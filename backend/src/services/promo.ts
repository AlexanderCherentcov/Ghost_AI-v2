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

// Атомарно резервируем одно использование. WHERE-условие перепроверяет active/maxUses
// на уровне БД, так что проигранная гонка за последнее использование не выдаст его дважды.
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

// ─── Промокод типа CASPERS — активируется сразу, начисляет Caspers на баланс ─

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

// ─── Промокод типа DISCOUNT_PERCENT ────────────────────────────────────────────
// Двухфазный: предпросмотр (валидация + расчёт скидки, без побочных эффектов)
// происходит при оформлении заказа; финализация (резерв использования + запись
// активации) — только когда вебхук подтвердит, что оплата реально прошла, так
// что брошенная оплата никогда не сжигает использование.

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
  if (!promo) return; // код удалили между оформлением и оплатой — оплата всё равно засчитана, записывать нечего

  if (await alreadyRedeemedBy(promo.id, userId)) return; // защита от повторов (ретраи вебхука)

  try {
    await claimOneUse(promo.id);
  } catch {
    return; // исчерпан между предпросмотром и успешной оплатой — редкий edge case, оплату не отменяем
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

// ─── Админка ──────────────────────────────────────────────────────────────────

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

// Настоящий DELETE, если код ещё никто не активировал; иначе деактивируем, чтобы
// существующие записи PromoRedemption (кто что использовал) остались нетронутыми.
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
