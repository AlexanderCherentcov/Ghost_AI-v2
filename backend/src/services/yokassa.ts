import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { applyPlanLimits } from './tokens.js';
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
// std_messages_daily / pro_messages_daily: -1 = unlimited
// All image/video limits are daily; files is monthly.

export const PLANS = {
  FREE: {
    price: 0, price_yearly: 0,
    label: 'Бесплатный',
    show_message_limit: true,
    std_messages_daily: 10, pro_messages_daily: 0,
    images_daily: 3,   videos_daily: 0,  files_monthly: 0,
  },
  TRIAL: {
    price: 299, price_yearly: 299,
    label: 'Пробный',
    show_message_limit: true,
    duration_days: 7,            // особый срок: 7 дней вместо месяца
    std_messages_daily: 30, pro_messages_daily: 0,
    images_daily: 5,   videos_daily: 1,  files_monthly: 0,
  },
  BASIC: {
    price: 699, price_yearly: 594,
    label: 'Базовый',
    show_message_limit: false,
    std_messages_daily: -1, pro_messages_daily: 0,
    images_daily: 20,  videos_daily: 0,  files_monthly: 40,
  },
  STANDARD: {
    price: 1199, price_yearly: 1019,
    label: 'Стандарт',
    show_message_limit: false,
    std_messages_daily: -1, pro_messages_daily: 50,
    images_daily: 30,  videos_daily: 1,  files_monthly: 150,
  },
  PRO: {
    price: 2490, price_yearly: 2117,
    label: 'Про',
    show_message_limit: false, // UI always shows ∞ — real cap enforced silently
    std_messages_daily: 200, pro_messages_daily: 200,
    images_daily: 80,  videos_daily: 3,  files_monthly: 500,
  },
  ULTRA: {
    price: 5490, price_yearly: 4667,
    label: 'Ультра',
    show_message_limit: false, // UI always shows ∞ — real cap enforced silently
    std_messages_daily: 400, pro_messages_daily: 400,
    images_daily: 150, videos_daily: 5,  files_monthly: 1000,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// ─── Create payment ───────────────────────────────────────────────────────────

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
        metadata: { userId, plan: planKey, billing },
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
    },
  });

  return {
    paymentId:  data.id as string,
    paymentUrl: data.confirmation.confirmation_url as string,
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

  // Notify admins about successful payment
  const payer = await prisma.user.findUnique({ where: { id: payment.userId }, select: { name: true } });
  const billing = event.object.metadata?.billing === 'yearly' ? 'yearly' : 'monthly';
  notifyPayment({
    userId:   payment.userId,
    userName: payer?.name ?? null,
    amount:   payment.amount,
    plan:     payment.plan ?? 'unknown',
    billing,
  }).catch(() => {});

  if (payment.plan) {
    const planInfo = PLANS[payment.plan as PlanKey];
    if (planInfo) {
      const billing = (event.object.metadata?.billing === 'yearly' ? 'YEARLY' : 'MONTHLY') as 'MONTHLY' | 'YEARLY';
      const expiresAt = new Date();
      // TRIAL — 7 days; YEARLY — 1 year; default — 1 month
      const durationDays = (planInfo as any).duration_days as number | undefined;
      if (durationDays) {
        expiresAt.setDate(expiresAt.getDate() + durationDays);
      } else if (billing === 'YEARLY') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }
      await prisma.user.update({
        where: { id: payment.userId },
        data: { plan: payment.plan, planExpiresAt: expiresAt, billing },
      });
      await applyPlanLimits(
        payment.userId,
        {
          std_messages_daily: planInfo.std_messages_daily,
          pro_messages_daily: planInfo.pro_messages_daily,
          images_daily:       planInfo.images_daily,
          videos_daily:       planInfo.videos_daily,
          files_monthly:      planInfo.files_monthly,
        },
        payment.plan,
      );
    }
  }
}
