import { prisma } from '../lib/prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BalanceType = 'chat' | 'images' | 'docs' | 'code';

const MAIN_FIELD: Record<BalanceType, string> = {
  chat:   'balanceChat',
  images: 'balanceImages',
  docs:   'balanceDocs',
  code:   'balanceCode',
};
const ADDON_FIELD: Record<BalanceType, string> = {
  chat:   'addonChat',
  images: 'addonImages',
  docs:   'addonDocs',
  code:   'addonCode',
};

export const LIMIT_CODE: Record<BalanceType, string> = {
  chat:   'LIMIT_CHAT',
  images: 'LIMIT_IMAGES',
  docs:   'LIMIT_DOCS',
  code:   'LIMIT_CODE',
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
    select: { balanceChat: true, balanceImages: true, balanceDocs: true, balanceCode: true,
              addonChat: true, addonImages: true, addonDocs: true, addonCode: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });
  const main  = (user as any)[MAIN_FIELD[type]]  as number;
  const addon = (user as any)[ADDON_FIELD[type]] as number;
  if (main + addon <= 0) {
    throw Object.assign(new Error(LIMIT_CODE[type]), { code: LIMIT_CODE[type] });
  }
}

// ─── Deduct 1 unit — main first, then addon ───────────────────────────────────

export async function deductBalance(userId: string, type: BalanceType): Promise<void> {
  const mainField  = MAIN_FIELD[type];
  const addonField = ADDON_FIELD[type];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [mainField]: true, [addonField]: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

  const main  = (user as any)[mainField]  as number;
  const addon = (user as any)[addonField] as number;
  if (main + addon <= 0) {
    throw Object.assign(new Error(LIMIT_CODE[type]), { code: LIMIT_CODE[type] });
  }

  const field = main > 0 ? mainField : addonField;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { [field]: { decrement: 1 } } }),
    prisma.tokenTransaction.create({
      data: { userId, amount: -1, type: 'USAGE',
              meta: { balanceType: type, source: main > 0 ? 'main' : 'addon' } },
    }),
  ]);
}

// ─── Grant addon balance ──────────────────────────────────────────────────────

export async function grantAddon(
  userId: string,
  type: BalanceType,
  amount: number,
  meta?: object
): Promise<void> {
  const field = ADDON_FIELD[type];
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { [field]: { increment: amount } } }),
    prisma.tokenTransaction.create({
      data: { userId, amount, type: 'PURCHASE', meta: { balanceType: type, isAddon: true, ...meta } },
    }),
  ]);
}

// ─── Set plan balances (replaces main balance on subscription) ────────────────

export interface PlanBalances { chat: number; images: number; docs: number; code: number; }

export async function setPlanBalances(
  userId: string,
  balances: PlanBalances,
  txType: 'SUBSCRIPTION' | 'BONUS' = 'SUBSCRIPTION',
  meta?: object
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { balanceChat: balances.chat, balanceImages: balances.images,
              balanceDocs: balances.docs, balanceCode: balances.code },
    }),
    prisma.tokenTransaction.create({
      data: {
        userId,
        amount: balances.chat + balances.images + balances.docs + balances.code,
        type: txType,
        meta: { balances, ...meta },
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
    prisma.user.update({ where: { id: userId }, data: { balanceChat: { increment: amount } } }),
    prisma.tokenTransaction.create({ data: { userId, amount, type, meta: { legacy: true, ...meta } } }),
  ]);
}

// Keep old TOKEN_COSTS export for any remaining references
export const TOKEN_COSTS = { chat_simple: 1, chat_complex: 2, think: 2, document: 3, vision: 10, sound: 10, reel: 50 } as const;
export type TokenMode = keyof typeof TOKEN_COSTS;
export function getTokenCost(mode: string, complexity?: string): number {
  if (mode === 'chat') return TOKEN_COSTS[`chat_${complexity ?? 'simple'}` as TokenMode] ?? 1;
  return TOKEN_COSTS[mode as TokenMode] ?? 1;
}
export async function chargeTokens(userId: string, mode: string, complexity?: string, meta?: object): Promise<number> {
  const type: BalanceType = mode === 'vision' ? 'images' : mode === 'think' ? 'chat' : 'chat';
  await deductBalance(userId, type);
  return 1;
}
