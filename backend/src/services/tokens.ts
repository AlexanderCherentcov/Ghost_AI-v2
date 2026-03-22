import { prisma } from '../lib/prisma.js';

export const TOKEN_COSTS = {
  chat_simple:  1000,  // ~$0.001 our cost
  chat_complex: 2500,  // ~$0.005 our cost
  think:        5000,  // reasoning model
  vision:       5000,  // image generation
  sound:       10000,  // track generation
  reel:        50000,  // video generation
} as const;

export type TokenMode = keyof typeof TOKEN_COSTS;

export function getTokenCost(mode: string, complexity?: string): number {
  if (mode === 'chat') {
    const key = `chat_${complexity ?? 'simple'}` as TokenMode;
    return TOKEN_COSTS[key] ?? TOKEN_COSTS.chat_simple;
  }
  return TOKEN_COSTS[mode as TokenMode] ?? TOKEN_COSTS.chat_simple;
}

export async function checkBalance(userId: string, cost: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  if (!user || user.tokenBalance < cost) {
    throw Object.assign(new Error('INSUFFICIENT_TOKENS'), { code: 'INSUFFICIENT_TOKENS' });
  }
}

export async function chargeTokens(
  userId: string,
  mode: string,
  complexity?: string,
  meta?: object
): Promise<number> {
  const cost = getTokenCost(mode, complexity);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });

  if (!user || user.tokenBalance < cost) {
    throw Object.assign(new Error('INSUFFICIENT_TOKENS'), { code: 'INSUFFICIENT_TOKENS' });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: cost } },
    }),
    prisma.tokenTransaction.create({
      data: {
        userId,
        amount: -cost,
        type: 'USAGE',
        meta: { mode, complexity, ...meta },
      },
    }),
  ]);

  return cost;
}

export async function grantTokens(
  userId: string,
  amount: number,
  type: 'PURCHASE' | 'SUBSCRIPTION' | 'BONUS' | 'REFUND',
  meta?: object
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    }),
    prisma.tokenTransaction.create({
      data: {
        userId,
        amount,
        type,
        meta: meta ?? {},
      },
    }),
  ]);
}
