import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { setPlanBalances, grantAddon } from './tokens.js';
import type { PlanBalances } from './tokens.js';

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

// ─── Subscription plans ────────────────────────────────────────────────────────

export const PLANS = {
  BASIC:    { price: 499,  label: 'Базовый',  balances: { messages: 500,   images: 10  } },
  STANDARD: { price: 999,  label: 'Стандарт', balances: { messages: 1500,  images: 20  } },
  PRO:      { price: 2190, label: 'Про',       balances: { messages: 4000,  images: 50  } },
  ULTRA:    { price: 4490, label: 'Ультра',    balances: { messages: 10000, images: 120 } },
} as const;

// ─── Addon packs ──────────────────────────────────────────────────────────────

export const ADDON_PACKS = {
  // Standard messages (Haiku, costs 1 per message)
  MESSAGES_STD_200:  { price: 199,  label: '200 стандартных сообщений',  type: 'messages' as const, amount: 200  },
  MESSAGES_STD_500:  { price: 399,  label: '500 стандартных сообщений',  type: 'messages' as const, amount: 500  },
  MESSAGES_STD_1500: { price: 999,  label: '1500 стандартных сообщений', type: 'messages' as const, amount: 1500 },
  // Extended messages (DeepSeek, costs 2 per message)
  MESSAGES_EXT_300:  { price: 199,  label: '300 расширенных сообщений',  type: 'messages' as const, amount: 300  },
  MESSAGES_EXT_800:  { price: 399,  label: '800 расширенных сообщений',  type: 'messages' as const, amount: 800  },
  MESSAGES_EXT_2000: { price: 799,  label: '2000 расширенных сообщений', type: 'messages' as const, amount: 2000 },
  // Images
  IMAGES_10:  { price: 299,  label: '10 картинок',  type: 'images' as const, amount: 10  },
  IMAGES_30:  { price: 699,  label: '30 картинок',  type: 'images' as const, amount: 30  },
  IMAGES_100: { price: 1990, label: '100 картинок', type: 'images' as const, amount: 100 },
} as const;

export type PlanKey  = keyof typeof PLANS;
export type AddonKey = keyof typeof ADDON_PACKS;

// ─── Create payment ───────────────────────────────────────────────────────────

export async function createPayment(
  userId: string,
  type: 'SUBSCRIPTION' | 'ADDON',
  key: PlanKey | AddonKey,
  returnUrl: string
) {
  const idempotencyKey = crypto.randomUUID();
  let price: number;
  let description: string;
  let addonType: string | undefined;
  let addonAmount: number | undefined;
  let plan: PlanKey | undefined;

  if (type === 'SUBSCRIPTION') {
    const info = PLANS[key as PlanKey];
    price = info.price;
    description = `Подписка ${info.label} — GhostLine`;
    plan = key as PlanKey;
  } else {
    const info = ADDON_PACKS[key as AddonKey];
    price = info.price;
    description = `Аддон ${info.label} — GhostLine`;
    addonType   = info.type;
    addonAmount = info.amount;
  }

  const { data } = await axios.post(
    `${YOKASSA_BASE}/payments`,
    {
      amount: { value: price.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description,
      metadata: { userId, type, key },
    },
    { headers: yokassaHeaders(idempotencyKey) }
  );

  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: price,
      status: 'PENDING',
      type,
      plan: plan as any,
      addonType,
      addonAmount,
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

  const payment = await prisma.payment.findUnique({ where: { yokassaId: event.object.id } });
  if (!payment || payment.status === 'SUCCEEDED') return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });

  if (payment.type === 'SUBSCRIPTION' && payment.plan) {
    const planInfo = PLANS[payment.plan as PlanKey];
    if (planInfo) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      await prisma.user.update({
        where: { id: payment.userId },
        data: { plan: payment.plan, planExpiresAt: expiresAt },
      });
      await setPlanBalances(payment.userId, planInfo.balances as { messages: number; images: number }, 'SUBSCRIPTION', { paymentId: payment.id });
    }
  } else if (payment.type === 'ADDON' && payment.addonType && payment.addonAmount) {
    await grantAddon(payment.userId, payment.addonType as any, payment.addonAmount, { paymentId: payment.id });
  }
}

// ─── Legacy: TOKEN_PACKS for old routes/plans.ts ─────────────────────────────
export const TOKEN_PACKS = ADDON_PACKS;
