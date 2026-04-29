import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { grantCaspers } from './tokens.js';
import { notifyPayment } from './admin-notify.js';

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

// ─── Plans ─────────────────────────────────────────────────────────────────────
// yearly = price * 12 * 0.8 (20% real discount, shown as 70% in UI)

export const PLANS = {
  FREE: {
    price: 0,    price_yearly: 0,
    label: 'Бесплатный',
    caspers_monthly: 0,
    pro_free_daily: 0,
  },
  BASIC: {
    price: 790,  price_yearly: 7584,  // 790 * 12 * 0.8
    label: 'Базовый',
    caspers_monthly: 300,
    pro_free_daily: 0,
  },
  PRO: {
    price: 1690, price_yearly: 16224, // 1690 * 12 * 0.8
    label: 'Про',
    caspers_monthly: 700,
    pro_free_daily: 20,
  },
  VIP: {
    price: 3990, price_yearly: 38304, // 3990 * 12 * 0.8
    label: 'VIP',
    caspers_monthly: 1800,
    pro_free_daily: 50,
  },
  ULTRA: {
    price: 5990, price_yearly: 57504, // 5990 * 12 * 0.8
    label: 'Ультра',
    caspers_monthly: 2800,
    pro_free_daily: -1,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// ─── Casper tiered pricing ────────────────────────────────────────────────────

export function calculateCasperPrice(amount: number): number {
  if (amount <= 0) return 0;

  let total = 0;
  let remaining = amount;
  const tiers = [
    { max: 100,  price: 3.0 },
    { max: 100,  price: 2.9 },
    { max: 100,  price: 2.8 },
    { max: 100,  price: 2.7 },
    { max: 100,  price: 2.6 },
    { max: 100,  price: 2.5 },
    { max: 100,  price: 2.4 },
    { max: 100,  price: 2.3 },
    { max: 100,  price: 2.2 },
    { max: 100,  price: 2.1 },
  ];

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const inTier = Math.min(remaining, tier.max);
    total += inTier * tier.price;
    remaining -= inTier;
  }

  return Math.round(total * 100) / 100;
}

// ─── Create subscription payment ─────────────────────────────────────────────

export async function createPayment(
  userId: string,
  planKey: PlanKey,
  returnUrl: string,
  billing: 'monthly' | 'yearly' = 'monthly',
) {
  const info = PLANS[planKey];
  if (!info || info.price === 0) throw new Error('Invalid plan');
  const totalPrice = billing === 'yearly' ? info.price_yearly : info.price;

  const idempotencyKey = crypto.randomUUID();

  let data: any;
  try {
    const response = await axios.post(
      `${YOKASSA_BASE}/payments`,
      {
        amount: { value: totalPrice.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: returnUrl },
        capture: true,
        description: `Подписка ${info.label}${billing === 'yearly' ? ' (год)' : ''} — GhostLine`,
        metadata: { userId, plan: planKey, billing, paymentType: 'subscription' },
      },
      { headers: yokassaHeaders(idempotencyKey), timeout: 15_000 }
    );
    data = response.data;
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? 'unknown';
    console.error('[yokassa] createPayment failed:', detail);
    throw new Error('Платёжный сервис недоступен');
  }

  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: totalPrice,
      status: 'PENDING',
      plan: planKey as any,
      paymentType: 'subscription',
    },
  });

  return {
    paymentId:  data.id as string,
    paymentUrl: data.confirmation.confirmation_url as string,
  };
}

// ─── Create Casper top-up payment ─────────────────────────────────────────────

export async function createCasperPayment(
  userId: string,
  casperAmount: number,
  returnUrl: string,
) {
  if (casperAmount < 1 || casperAmount > 1000) {
    throw new Error('Количество Caspers должно быть от 1 до 1000');
  }

  // Only available for paid plans
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
    const response = await axios.post(
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

// ─── Process webhook ──────────────────────────────────────────────────────────

export async function processWebhook(body: unknown): Promise<void> {
  const event = body as {
    type: string;
    object: { id: string; status: string; metadata: Record<string, string> };
  };

  if (event.type !== 'payment.succeeded') return;

  // Re-verify payment status directly with YooKassa API (prevents forged webhooks)
  const paymentId = event.object.id;
  const verifyRes = await axios.get(`${YOKASSA_BASE}/payments/${paymentId}`, {
    headers: yokassaHeaders(crypto.randomUUID()),
  }).catch(() => null);
  if (!verifyRes || verifyRes.data?.status !== 'succeeded') return;

  // Atomic update: only update if not yet SUCCEEDED — prevents double billing on duplicate webhooks
  const updated = await prisma.payment.updateMany({
    where: { yokassaId: paymentId, status: { not: 'SUCCEEDED' } },
    data: { status: 'SUCCEEDED' },
  });
  if (updated.count === 0) return; // already processed

  const payment = await prisma.payment.findUnique({ where: { yokassaId: paymentId } });
  if (!payment) return;

  const payer = await prisma.user.findUnique({ where: { id: payment.userId }, select: { name: true } });

  // ── Casper top-up payment ──────────────────────────────────────────────────
  if (payment.paymentType === 'caspers' && payment.casperAmount) {
    const casperAmount = payment.casperAmount;

    await prisma.user.update({
      where: { id: payment.userId },
      data: { caspers_balance: { increment: casperAmount } },
    });

    await prisma.casperTransaction.create({
      data: {
        userId: payment.userId,
        amount: casperAmount,
        reason: 'topup',
      },
    });

    notifyPayment({
      userId:   payment.userId,
      userName: payer?.name ?? null,
      amount:   payment.amount,
      plan:     `${casperAmount} Caspers (топап)`,
      billing:  'one-time',
    }).catch(() => {});

    return;
  }

  // ── Subscription payment ───────────────────────────────────────────────────
  if (payment.plan) {
    const planInfo = PLANS[payment.plan as PlanKey];
    if (planInfo) {
      const billing = (event.object.metadata?.billing === 'yearly' ? 'YEARLY' : 'MONTHLY') as 'MONTHLY' | 'YEARLY';
      const expiresAt = new Date();
      if (billing === 'YEARLY') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          plan: payment.plan,
          planExpiresAt: expiresAt,
          billing,
          // Reset weekly counters on plan change
          images_this_week: 0,
          music_this_week: 0,
          videos_this_week: 0,
          week_start: new Date(),
        },
      });

      // Grant fresh caspers for the new plan period
      await grantCaspers(
        payment.userId,
        planInfo.caspers_monthly,
        planInfo.caspers_monthly,
        `plan_grant_${payment.plan.toLowerCase()}`,
      );

      notifyPayment({
        userId:   payment.userId,
        userName: payer?.name ?? null,
        amount:   payment.amount,
        plan:     payment.plan,
        billing:  billing.toLowerCase(),
      }).catch(() => {});
    }
  }
}
