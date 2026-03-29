import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { applyPlanLimits } from './tokens.js';

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
// messages: monthly cap (-1 = daily mode), images: monthly cap, files: monthly cap

export const PLANS = {
  FREE:     { price: 0,    label: 'Бесплатный', messagesLimit: -1,   imagesLimit: 3,   filesLimit: 0    },
  BASIC:    { price: 699,  label: 'Базовый',    messagesLimit: 500,  imagesLimit: 30,  filesLimit: 40   },
  STANDARD: { price: 1199, label: 'Стандарт',   messagesLimit: 1500, imagesLimit: 70,  filesLimit: 150  },
  PRO:      { price: 2490, label: 'Про',        messagesLimit: -1,   imagesLimit: 150, filesLimit: 500  },
  ULTRA:    { price: 5490, label: 'Ультра',     messagesLimit: -1,   imagesLimit: 350, filesLimit: 1000 },
} as const;

export type PlanKey = keyof typeof PLANS;

// ─── Create payment ───────────────────────────────────────────────────────────

export async function createPayment(
  userId: string,
  planKey: PlanKey,
  returnUrl: string
) {
  const info = PLANS[planKey];
  if (!info || info.price === 0) throw new Error('Invalid plan');

  const idempotencyKey = crypto.randomUUID();

  const { data } = await axios.post(
    `${YOKASSA_BASE}/payments`,
    {
      amount: { value: info.price.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description: `Подписка ${info.label} — GhostLine`,
      metadata: { userId, plan: planKey },
    },
    { headers: yokassaHeaders(idempotencyKey) }
  );

  await prisma.payment.create({
    data: {
      userId,
      yokassaId: data.id,
      amount: info.price,
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

  const payment = await prisma.payment.findUnique({ where: { yokassaId: event.object.id } });
  if (!payment || payment.status === 'SUCCEEDED') return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });

  if (payment.plan) {
    const planInfo = PLANS[payment.plan as PlanKey];
    if (planInfo) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      await prisma.user.update({
        where: { id: payment.userId },
        data: { plan: payment.plan, planExpiresAt: expiresAt },
      });
      await applyPlanLimits(
        payment.userId,
        {
          messagesLimit: planInfo.messagesLimit,
          filesLimit:    planInfo.filesLimit,
          imagesLimit:   planInfo.imagesLimit,
        },
        payment.plan
      );
    }
  }
}
