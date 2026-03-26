import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { grantTokens } from './tokens.js';

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

// ─── Plans ────────────────────────────────────────────────────────────────────

export const PLANS = {
  PRO:   { price: 499,  tokens: 500_000,     label: 'Ghost Pro' },
  ULTRA: { price: 1490, tokens: 2_000_000,   label: 'Ghost Ultra' },
  TEAM:  { price: 3900, tokens: 10_000_000,  label: 'Ghost Team' },
} as const;

// ─── Token packs (Базовый / Стандарт / Про) ───────────────────────────────────
// Costs per action:  chat=1  code=2  doc=3  image=10

export const TOKEN_PACKS = {
  BASIC:    { price: 299,  tokens: 350,  label: 'Базовый' },
  STANDARD: { price: 699,  tokens: 1150, label: 'Стандарт' },
  PRO_PACK: { price: 1490, tokens: 3300, label: 'Про' },
} as const;

export type PlanKey = keyof typeof PLANS;
export type PackKey = keyof typeof TOKEN_PACKS;

// ─── Create payment ───────────────────────────────────────────────────────────

export async function createPayment(
  userId: string,
  type: 'TOKEN_PACK' | 'SUBSCRIPTION',
  key: PlanKey | PackKey,
  returnUrl: string
) {
  const idempotencyKey = crypto.randomUUID();

  const info =
    type === 'SUBSCRIPTION'
      ? PLANS[key as PlanKey]
      : TOKEN_PACKS[key as PackKey];

  const description =
    type === 'SUBSCRIPTION'
      ? `Подписка ${info.label} — GhostLine`
      : `Пополнение токенов ${info.label} — GhostLine`;

  const { data } = await axios.post(
    `${YOKASSA_BASE}/payments`,
    {
      amount: { value: info.price.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description,
      metadata: { userId, type, key },
    },
    { headers: yokassaHeaders(idempotencyKey) }
  );

  // Save payment record
  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: info.price,
      status: 'PENDING',
      type,
      tokensGranted: info.tokens,
      plan: type === 'SUBSCRIPTION' ? (key as any) : undefined,
    },
  });

  return {
    paymentId: data.id as string,
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

  const payment = await prisma.payment.findUnique({
    where: { yokassaId: event.object.id },
  });

  if (!payment || payment.status === 'SUCCEEDED') return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'SUCCEEDED' },
  });

  if (payment.tokensGranted) {
    await grantTokens(
      payment.userId,
      payment.tokensGranted,
      payment.type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'PURCHASE',
      { paymentId: payment.id }
    );
  }

  // Update plan if subscription
  if (payment.type === 'SUBSCRIPTION' && payment.plan) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await prisma.user.update({
      where: { id: payment.userId },
      data: { plan: payment.plan, planExpiresAt: expiresAt },
    });
  }
}
