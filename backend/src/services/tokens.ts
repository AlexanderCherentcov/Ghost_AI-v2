import { prisma } from '../lib/prisma.js';

export type BalanceType = 'messages' | 'images';

// Cost per model (in balance units)
export const MODEL_COSTS: Record<string, { type: BalanceType; cost: number }> = {
  'anthropic/claude-haiku-4-5':      { type: 'messages', cost: 1 },
  'deepseek/deepseek-v3.2':          { type: 'messages', cost: 2 },
  'openai/gpt-4o-mini':              { type: 'messages', cost: 2 },
  'black-forest-labs/flux-1.1-pro':  { type: 'images',   cost: 1 },
  'black-forest-labs/flux.2-pro':    { type: 'images',   cost: 1 },
  'black-forest-labs/flux-fill-pro': { type: 'images',   cost: 1 },
};

export const LIMIT_CODE: Record<BalanceType, string> = {
  messages: 'LIMIT_MESSAGES',
  images:   'LIMIT_IMAGES',
};

// ─── Input sanitization ───────────────────────────────────────────────────────

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 2000);
}

// ─── Balance check (no deduction) ────────────────────────────────────────────

export async function checkBalance(userId: string, type: BalanceType): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceMessages: true, balanceImages: true, addonMessages: true, addonImages: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });
  const main  = type === 'messages' ? user.balanceMessages : user.balanceImages;
  const addon = type === 'messages' ? user.addonMessages   : user.addonImages;
  if (main + addon <= 0) {
    throw Object.assign(new Error(LIMIT_CODE[type]), { code: LIMIT_CODE[type] });
  }
}

// ─── Deduct by model (after streaming, cost depends on actual model used) ─────

export async function deductByModel(userId: string, model: string): Promise<number> {
  const entry = MODEL_COSTS[model];
  if (!entry) {
    // Unknown model: default to 1 message
    return deductBalance(userId, 'messages', 1);
  }
  return deductBalance(userId, entry.type, entry.cost);
}

// ─── Deduct N units — main first, then addon ──────────────────────────────────

export async function deductBalance(userId: string, type: BalanceType, amount = 1): Promise<number> {
  const mainField  = type === 'messages' ? 'balanceMessages' : 'balanceImages';
  const addonField = type === 'messages' ? 'addonMessages'   : 'addonImages';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [mainField]: true, [addonField]: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

  const main  = (user as any)[mainField]  as number;
  const addon = (user as any)[addonField] as number;
  if (main + addon < amount) {
    throw Object.assign(new Error(LIMIT_CODE[type]), { code: LIMIT_CODE[type] });
  }

  // Deduct from main first, overflow to addon
  const fromMain  = Math.min(main, amount);
  const fromAddon = amount - fromMain;

  const updates: any = {};
  if (fromMain  > 0) updates[mainField]  = { decrement: fromMain };
  if (fromAddon > 0) updates[addonField] = { decrement: fromAddon };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: updates }),
    prisma.tokenTransaction.create({
      data: { userId, amount: -amount, type: 'USAGE',
              meta: { balanceType: type, cost: amount, model: 'unknown' } },
    }),
  ]);
  return amount;
}

// ─── Grant addon balance ──────────────────────────────────────────────────────

export async function grantAddon(
  userId: string,
  type: BalanceType,
  amount: number,
  meta?: object
): Promise<void> {
  const field = type === 'messages' ? 'addonMessages' : 'addonImages';
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { [field]: { increment: amount } } }),
    prisma.tokenTransaction.create({
      data: { userId, amount, type: 'PURCHASE', meta: { balanceType: type, isAddon: true, ...meta } },
    }),
  ]);
}

// ─── Set plan balances (replaces main balance on subscription) ────────────────

export interface PlanBalances { messages: number; images: number; }

export async function setPlanBalances(
  userId: string,
  balances: PlanBalances,
  txType: 'SUBSCRIPTION' | 'BONUS' = 'SUBSCRIPTION',
  meta?: object
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { balanceMessages: balances.messages, balanceImages: balances.images },
    }),
    prisma.tokenTransaction.create({
      data: {
        userId,
        amount: balances.messages + balances.images,
        type: txType,
        meta: { balances: balances as unknown as Record<string, number>, ...(meta as Record<string, unknown> ?? {}) },
      },
    }),
  ]);
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

export async function grantTokens(
  userId: string,
  amount: number,
  type: 'PURCHASE' | 'SUBSCRIPTION' | 'BONUS' | 'REFUND',
  meta?: object
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { balanceMessages: { increment: amount } } }),
    prisma.tokenTransaction.create({ data: { userId, amount, type, meta: { legacy: true, ...meta } } }),
  ]);
}
