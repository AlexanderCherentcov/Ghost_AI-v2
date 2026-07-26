import { prisma } from '../lib/prisma.js';
import type { Plan, PromoCode } from '@prisma/client';
import type { PlanKey } from '../config/plans.js';

export class PromoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

async function findActivePromo(rawCode: string): Promise<PromoCode> {
  const code = normalizePromoCode(rawCode);
  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) throw new PromoError('PROMO_NOT_FOUND', 'Промокод не найден');
  if (!promo.active) throw new PromoError('PROMO_INACTIVE', 'Промокод больше не действует');
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw new PromoError('PROMO_EXPIRED', 'Срок действия промокода истёк');
  }
  if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
    throw new PromoError('PROMO_EXHAUSTED', 'Промокод исчерпан');
  }
  return promo;
}

async function alreadyRedeemedBy(promoCodeId: string, userId: string): Promise<boolean> {
  const existing = await prisma.promoRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId, userId } },
  });
  return !!existing;
}

// Atomically reserve one use. The WHERE clause re-checks active/maxUses at the
// DB level so a lost race on the very last use can't hand it out twice.
async function claimOneUse(promoId: string): Promise<void> {
  const promo = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
  const claimed = await prisma.promoCode.updateMany({
    where: {
      id: promoId,
      active: true,
      OR: [{ maxUses: null }, { usesCount: { lt: promo.maxUses ?? undefined } }],
    },
    data: { usesCount: { increment: 1 } },
  });
  if (claimed.count === 0) throw new PromoError('PROMO_EXHAUSTED', 'Промокод исчерпан');
}

async function releaseOneUse(promoId: string): Promise<void> {
  await prisma.promoCode.update({ where: { id: promoId }, data: { usesCount: { decrement: 1 } } }).catch(() => {});
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === 'P2002';
}

// ─── CASPERS-type promo — redeemed immediately, grants Caspers to balance ────

export async function redeemCaspersPromo(
  rawCode: string,
  userId: string,
): Promise<{ casperAmount: number }> {
  const promo = await findActivePromo(rawCode);
  if (promo.rewardType !== 'CASPERS') {
    throw new PromoError('PROMO_WRONG_TYPE', 'Этот промокод даёт скидку на тариф — примените его при оплате подписки');
  }
  if (await alreadyRedeemedBy(promo.id, userId)) {
    throw new PromoError('PROMO_ALREADY_USED', 'Вы уже использовали этот промокод');
  }

  const amount = promo.casperAmount ?? 0;
  await claimOneUse(promo.id);

  try {
    await prisma.$transaction([
      prisma.promoRedemption.create({
        data: {
          promoCodeId: promo.id,
          userId,
          codeSnapshot: promo.code,
          rewardType: 'CASPERS',
          casperAmount: amount,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { caspers_balance: { increment: amount } },
      }),
      prisma.casperTransaction.create({
        data: { userId, amount, reason: `promo:${promo.code}` },
      }),
    ]);
  } catch (err) {
    await releaseOneUse(promo.id);
    if (isUniqueViolation(err)) throw new PromoError('PROMO_ALREADY_USED', 'Вы уже использовали этот промокод');
    throw err;
  }

  return { casperAmount: amount };
}

// ─── DISCOUNT_PERCENT-type promo ──────────────────────────────────────────────
// Two-phase: preview (validate + compute discount, no side effects) happens at
// checkout; finalize (claim use + record redemption) happens once the webhook
// confirms the payment actually succeeded — so an abandoned checkout never
// burns a use.

export async function previewDiscountPromo(
  rawCode: string,
  userId: string,
  plan: PlanKey,
): Promise<{ discountPercent: number; code: string }> {
  const promo = await findActivePromo(rawCode);
  if (promo.rewardType !== 'DISCOUNT_PERCENT') {
    throw new PromoError('PROMO_WRONG_TYPE', 'Этот промокод начисляет Caspers — используйте его в разделе пополнения');
  }
  if (promo.applicablePlans.length > 0 && !promo.applicablePlans.includes(plan as unknown as Plan)) {
    throw new PromoError('PROMO_PLAN_NOT_APPLICABLE', 'Промокод не действует для этого тарифа');
  }
  if (await alreadyRedeemedBy(promo.id, userId)) {
    throw new PromoError('PROMO_ALREADY_USED', 'Вы уже использовали этот промокод');
  }
  return { discountPercent: promo.discountPercent ?? 0, code: promo.code };
}

export async function finalizeDiscountRedemption(params: {
  code: string;
  userId: string;
  paymentId: string;
}): Promise<void> {
  const { code, userId, paymentId } = params;
  const promo = await prisma.promoCode.findUnique({ where: { code: normalizePromoCode(code) } });
  if (!promo) return; // code deleted between checkout and payment — payment still stands, nothing to record

  if (await alreadyRedeemedBy(promo.id, userId)) return; // idempotency guard (webhook retries)

  try {
    await claimOneUse(promo.id);
  } catch {
    return; // exhausted between preview and payment success — rare edge case, don't undo the payment
  }

  try {
    await prisma.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId,
        paymentId,
        codeSnapshot: promo.code,
        rewardType: 'DISCOUNT_PERCENT',
        discountPercent: promo.discountPercent,
      },
    });
  } catch (err) {
    await releaseOneUse(promo.id);
    if (!isUniqueViolation(err)) throw err;
  }
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export async function createPromoCode(input: {
  code: string;
  rewardType: 'CASPERS' | 'DISCOUNT_PERCENT';
  casperAmount?: number;
  discountPercent?: number;
  applicablePlans?: string[];
  maxUses?: number | null;
  expiresAt?: Date | null;
  createdBy?: string;
}): Promise<PromoCode> {
  const code = normalizePromoCode(input.code);
  return prisma.promoCode.create({
    data: {
      code,
      rewardType: input.rewardType,
      casperAmount: input.rewardType === 'CASPERS' ? input.casperAmount ?? 0 : null,
      discountPercent: input.rewardType === 'DISCOUNT_PERCENT' ? input.discountPercent ?? 0 : null,
      applicablePlans: (input.applicablePlans ?? []) as Plan[],
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy,
    },
  });
}

// Real DELETE when nobody has redeemed the code yet; otherwise deactivate so
// existing PromoRedemption audit rows (who used what) stay intact.
export async function deletePromoCode(code: string): Promise<{ deleted: boolean; deactivated: boolean }> {
  const promo = await prisma.promoCode.findUnique({ where: { code: normalizePromoCode(code) } });
  if (!promo) throw new PromoError('PROMO_NOT_FOUND', 'Промокод не найден');

  if (promo.usesCount === 0) {
    await prisma.promoCode.delete({ where: { id: promo.id } });
    return { deleted: true, deactivated: false };
  }
  await prisma.promoCode.update({ where: { id: promo.id }, data: { active: false } });
  return { deleted: false, deactivated: true };
}
