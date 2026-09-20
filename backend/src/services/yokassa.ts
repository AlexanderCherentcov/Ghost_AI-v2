import axios from 'axios';
import crypto from 'crypto';

// YooKassa должна подключаться напрямую — глобальные HTTP_PROXY/HTTPS_PROXY
// указывают на прокси, который некорректно проксирует HTTPS из контейнера.
const yokassaAxios = axios.create({ proxy: false });
import { prisma } from '../lib/prisma.js';
import { grantCaspers, reverseCaspersGrant, demoteIfDepleted } from './tokens.js';
import { notifyPayment } from './admin-notify.js';
import { PLANS, calculateCasperPrice } from '../config/plans.js';
import { previewDiscountPromo, finalizeDiscountRedemption } from './promo.js';
import { computeNewExpiry } from '../lib/subscription.js';

export type { PlanKey } from '../config/plans.js';
export { PLANS, calculateCasperPrice };

const YOKASSA_BASE = 'https://api.yookassa.ru/v3';

function yokassaHeaders(idempotencyKey: string) {
  const credentials = Buffer.from(
    `${process.env.YOKASSA_SHOP_ID}:${process.env.YOKASSA_SECRET_KEY}`
  ).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'Idempotence-Key': idempotencyKey,
  };
}

// ─── Создание платежа за подписку ─────────────────────────────────────────────

export async function createPayment(
  userId: string,
  planKey: keyof typeof PLANS,
  returnUrl: string,
  billing: 'monthly' | 'yearly' = 'monthly',
  promoCode?: string,
) {
  const info = PLANS[planKey];
  if (!info || info.price === 0) throw new Error('Invalid plan');
  const basePrice = billing === 'yearly' ? info.price_yearly : info.price;

  let totalPrice = basePrice;
  let appliedPromo: string | undefined;
  let discountPercent = 0;
  if (promoCode) {
    const preview = await previewDiscountPromo(promoCode, userId, planKey);
    discountPercent = preview.discountPercent;
    appliedPromo = preview.code;
    totalPrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
  }

  const idempotencyKey = crypto.randomUUID();

  let data: any;
  try {
    const response = await yokassaAxios.post(
      `${YOKASSA_BASE}/payments`,
      {
        amount: { value: totalPrice.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: returnUrl },
        capture: true,
        description: `Подписка ${info.label}${billing === 'yearly' ? ' (год)' : ''}${appliedPromo ? ` — промо ${appliedPromo}` : ''} — GhostLine`,
        metadata: {
          userId, plan: planKey, billing, paymentType: 'subscription',
          ...(appliedPromo ? { promoCode: appliedPromo } : {}),
        },
      },
      { headers: yokassaHeaders(idempotencyKey), timeout: 15_000 }
    );
    data = response.data;
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? 'unknown';
    const status = err?.response?.status;
    console.error('[yokassa] createPayment failed:', status, JSON.stringify(detail));
    throw new Error(`Платёжный сервис недоступен (${status ?? 'no response'}): ${JSON.stringify(detail)}`);
  }

  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: totalPrice,
      status: 'PENDING',
      plan: planKey as any,
      paymentType: 'subscription',
      // Фиксируем здесь, а не читаем из тела вебхука в processWebhook — оно
      // приходит на публичный эндпоинт без подписи и подделываемо клиентом
      // (например, оплатить месяц, но по гонке с настоящим вебхуком прислать
      // billing: "yearly" и активировать год по цене месяца).
      billing: billing === 'yearly' ? 'YEARLY' : 'MONTHLY',
      promoCode: appliedPromo ?? null,
    },
  });

  return {
    paymentId:  data.id as string,
    paymentUrl: data.confirmation.confirmation_url as string,
    discountPercent,
  };
}

// ─── Создание платежа на докупку Caspers ──────────────────────────────────────

export async function createCasperPayment(
  userId: string,
  casperAmount: number,
  returnUrl: string,
) {
  if (casperAmount < 1 || casperAmount > 1000) {
    throw new Error('Количество Caspers должно быть от 1 до 1000');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user || user.plan === 'FREE') {
    throw Object.assign(
      new Error('Докупка Caspers доступна только с активной подпиской'),
      { code: 'PLAN_RESTRICTED' },
    );
  }

  const totalPrice = calculateCasperPrice(casperAmount);
  const idempotencyKey = crypto.randomUUID();

  let data: any;
  try {
    const response = await yokassaAxios.post(
      `${YOKASSA_BASE}/payments`,
      {
        amount: { value: totalPrice.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: returnUrl },
        capture: true,
        description: `Докупка ${casperAmount} Caspers — GhostLine`,
        metadata: { userId, casperAmount: String(casperAmount), paymentType: 'caspers' },
      },
      { headers: yokassaHeaders(idempotencyKey), timeout: 15_000 }
    );
    data = response.data;
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? 'unknown';
    console.error('[yokassa] createCasperPayment failed:', detail);
    throw new Error('Платёжный сервис недоступен');
  }

  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: totalPrice,
      status: 'PENDING',
      paymentType: 'caspers',
      casperAmount,
    },
  });

  return {
    paymentId:  data.id as string,
    paymentUrl: data.confirmation.confirmation_url as string,
    totalPrice,
  };
}

// ─── Обработка вебхука ─────────────────────────────────────────────────────────

type YokassaEvent = {
  type: string;
  object: { id: string; status?: string; metadata?: Record<string, string>; payment_id?: string; amount?: { value: string } };
};

export async function processWebhook(body: unknown): Promise<void> {
  const event = body as YokassaEvent;

  // ── Отмена платежа — просто фиксируем статус, ничего не выдавали ──────────
  if (event.type === 'payment.canceled') {
    await prisma.payment.updateMany({
      where: { yokassaId: event.object.id, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
    return;
  }

  // ── Возврат оплаты — отзываем то, что было выдано ─────────────────────────
  // Раньше эти события вообще не обрабатывались: ручной возврат денег через
  // кабинет ЮKassa никак не отражался у нас — пользователь оставался с
  // оплаченной подпиской/Caspers, доступ не отзывался.
  if (event.type === 'refund.succeeded') {
    await handleRefund(event.object.payment_id);
    return;
  }

  if (event.type !== 'payment.succeeded') return;

  const paymentId = event.object.id;
  const verifyRes = await yokassaAxios.get(`${YOKASSA_BASE}/payments/${paymentId}`, {
    headers: yokassaHeaders(crypto.randomUUID()),
  }).catch(() => null);
  if (!verifyRes || verifyRes.data?.status !== 'succeeded') return;

  const payment = await prisma.payment.findUnique({ where: { yokassaId: paymentId } });
  if (!payment) return;

  // Флип статуса + начисление Caspers/выдача плана — ОДНА атомарная транзакция.
  // Раньше это были два независимых запроса: если процесс падал между ними
  // (OOM, деплой, краш), платёж навсегда оставался SUCCEEDED, а Caspers/план
  // не выданы — повторная доставка вебхука ничего не восстанавливала (guard
  // status != SUCCEEDED уже не срабатывал).
  const grantedNow = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { yokassaId: paymentId, status: { not: 'SUCCEEDED' } },
      data: { status: 'SUCCEEDED' },
    });
    if (updated.count === 0) return false; // уже обработан (повтор/гонка вебхуков)

    if (payment.paymentType === 'caspers' && payment.casperAmount) {
      await tx.user.update({
        where: { id: payment.userId },
        data: { caspers_balance: { increment: payment.casperAmount } },
      });
      await tx.casperTransaction.create({
        data: { userId: payment.userId, amount: payment.casperAmount, reason: 'topup' },
      }).catch(() => {});
    } else if (payment.plan) {
      const planInfo = PLANS[payment.plan as keyof typeof PLANS];
      if (planInfo) {
        // Берём billing из своей же записи Payment (зафиксирован в createPayment
        // на сервере), а не из event.object.metadata — тело вебхука не подписано
        // и приходит с публичного эндпоинта, клиент может прислать туда что угодно.
        const billing = payment.billing ?? 'MONTHLY';
        const current = await tx.user.findUnique({
          where: { id: payment.userId },
          select: { plan: true, planExpiresAt: true },
        });
        const expiresAt = computeNewExpiry({
          currentPlan: current?.plan ?? 'FREE',
          currentExpiresAt: current?.planExpiresAt ?? null,
          newPlan: payment.plan,
          billing,
        });

        await tx.user.update({
          where: { id: payment.userId },
          data: {
            plan: payment.plan,
            planExpiresAt: expiresAt,
            billing,
            images_this_week: 0,
            music_this_week: 0,
            videos_this_month: 0,
            week_start: new Date(),
            month_start: new Date(),
          },
        });

        await grantCaspers(
          payment.userId,
          planInfo.caspers_monthly,
          planInfo.caspers_monthly,
          `plan_grant_${payment.plan.toLowerCase()}`,
          tx,
        );
      }
    }
    return true;
  });

  if (!grantedNow) return;

  // Побочные эффекты best-effort — вне транзакции: их сбой не должен откатывать
  // уже подтверждённое (и закоммиченное) начисление.
  const payer = await prisma.user.findUnique({ where: { id: payment.userId }, select: { name: true } }).catch(() => null);

  if (payment.paymentType === 'caspers' && payment.casperAmount) {
    notifyPayment({
      userId:   payment.userId,
      userName: payer?.name ?? null,
      amount:   payment.amount,
      plan:     `${payment.casperAmount} Caspers (топап)`,
      billing:  'one-time',
    }).catch(() => {});
  } else if (payment.plan) {
    if (payment.promoCode) {
      await finalizeDiscountRedemption({ code: payment.promoCode, userId: payment.userId, paymentId: payment.id }).catch(() => {});
    }
    notifyPayment({
      userId:   payment.userId,
      userName: payer?.name ?? null,
      amount:   payment.amount,
      plan:     payment.plan,
      billing:  (payment.billing ?? 'MONTHLY').toLowerCase(),
    }).catch(() => {});
  }
}

// ─── Возврат оплаты — отзываем выданное ────────────────────────────────────────

async function handleRefund(originalYokassaPaymentId: string | undefined): Promise<void> {
  if (!originalYokassaPaymentId) return;

  const updated = await prisma.payment.updateMany({
    where: { yokassaId: originalYokassaPaymentId, status: 'SUCCEEDED' },
    data: { status: 'REFUNDED' },
  });
  if (updated.count === 0) return; // не был SUCCEEDED — ничего не выдавали, либо повтор вебхука возврата

  const payment = await prisma.payment.findUnique({ where: { yokassaId: originalYokassaPaymentId } });
  if (!payment) return;

  if (payment.paymentType === 'caspers' && payment.casperAmount) {
    await reverseCaspersGrant(payment.userId, payment.casperAmount, 'refund_topup');
  } else if (payment.plan) {
    const planInfo = PLANS[payment.plan as keyof typeof PLANS];
    if (planInfo?.caspers_monthly) {
      await reverseCaspersGrant(payment.userId, planInfo.caspers_monthly, `refund_plan_${payment.plan.toLowerCase()}`);
    }
  }

  // Балансовая демоция (см. tokens.ts) — если после отмены гранта баланс ушёл
  // в 0, платные привилегии отзываются немедленно, а не при следующем чате/генерации.
  await demoteIfDepleted(payment.userId);
}
