import { prisma } from '../lib/prisma.js';

export type RequestType =
  | 'chat_std'
  | 'chat_pro'
  | 'image_generate'
  | 'image_edit'
  | 'video_std_4s'
  | 'video_std_8s'
  | 'video_pro_4s'
  | 'video_pro_8s'
  | 'music_generate';

// ─── Casper costs per operation ───────────────────────────────────────────────

export const CASPER_COSTS: Record<RequestType, number> = {
  chat_std:      0,   // std chat is free on all plans
  chat_pro:      1,
  image_generate: 10,
  image_edit:    10,
  video_std_4s:  25,
  video_std_8s:  40,
  video_pro_4s:  50,
  video_pro_8s:  90,
  music_generate: 5,
} as const;

// ─── FREE tier weekly limits ──────────────────────────────────────────────────

export const FREE_WEEKLY_LIMITS = {
  images: 5,
  music:  5,
  videos: 3,
} as const;

// ─── FREE tier daily limits ───────────────────────────────────────────────────

export const FREE_DAILY_LIMITS = {
  std_messages: 5,
} as const;

// ─── Pro chat free quota per plan per day ─────────────────────────────────────
// -1 = unlimited

export const PRO_FREE_QUOTA: Record<string, number> = {
  FREE:  0,
  BASIC: 0,
  PRO:   20,
  VIP:   50,
  ULTRA: -1,
} as const;

// ─── Input sanitization ───────────────────────────────────────────────────────

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F​-‍﻿]/g, '')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 16000);
}

// ─── Reset daily/weekly/monthly counters if period ended ──────────────────────

export async function checkResets(userId: string): Promise<void> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      day_start: true,
      week_start: true,
      period_start: true,
      caspers_monthly: true,
      caspers_balance: true,
    },
  });
  if (!user) return;

  const updates: Record<string, unknown> = {};

  // Daily reset (std chat counter)
  const dayEnd = new Date(user.day_start);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (now >= dayEnd) {
    updates.std_messages_today = 0;
    updates.pro_messages_today = 0;
    updates.day_start = now;
  }

  // Weekly reset (FREE tier image/music/video counters)
  const weekEnd = new Date(user.week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (now >= weekEnd) {
    updates.images_this_week = 0;
    updates.music_this_week = 0;
    updates.videos_this_week = 0;
    updates.week_start = now;
  }

  // Monthly caspers grant: when period_start + 30 days passed
  const periodEnd = new Date(user.period_start);
  periodEnd.setDate(periodEnd.getDate() + 30);
  if (now >= periodEnd && user.caspers_monthly > 0) {
    // Add monthly caspers to balance
    updates.caspers_balance = user.caspers_balance + user.caspers_monthly;
    updates.period_start = now;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updates });

    // Log casper grant if applicable
    if (updates.caspers_balance !== undefined && user.caspers_monthly > 0) {
      await prisma.casperTransaction.create({
        data: {
          userId,
          amount: user.caspers_monthly,
          reason: 'plan_grant_monthly',
        },
      }).catch(() => {});
    }
  }
}

// ─── Resolve video request type from model + duration ─────────────────────────

export function resolveVideoRequestType(
  model: 'standard' | 'pro' = 'standard',
  duration: '4s' | '8s' = '8s',
): RequestType {
  if (model === 'pro') {
    return duration === '4s' ? 'video_pro_4s' : 'video_pro_8s';
  }
  return duration === '4s' ? 'video_std_4s' : 'video_std_8s';
}

// ─── Check limits & deduct (unified for both FREE and paid tiers) ──────────────

export async function checkAndDeduct(
  userId: string,
  requestType: RequestType,
  _count = 1,
  _hasFile = false,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        caspers_balance: true,
        std_messages_today: true,
        pro_messages_today: true,
        images_this_week: true,
        music_this_week: true,
        videos_this_week: true,
      },
    });
    if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

    const plan = user.plan as string;
    const cost = CASPER_COSTS[requestType];

    // ── std chat ──────────────────────────────────────────────────────────────
    if (requestType === 'chat_std') {
      if (plan === 'FREE') {
        if (user.std_messages_today >= FREE_DAILY_LIMITS.std_messages) {
          throw Object.assign(
            new Error('Лимит бесплатных сообщений исчерпан'),
            { code: 'LIMIT_FREE_MESSAGES' },
          );
        }
        await tx.user.update({ where: { id: userId }, data: { std_messages_today: { increment: 1 } } });
      } else {
        // Paid plans: std chat is always free (no deduction)
        await tx.user.update({ where: { id: userId }, data: { std_messages_today: { increment: 1 } } });
      }
      return;
    }

    // ── pro chat ──────────────────────────────────────────────────────────────
    if (requestType === 'chat_pro') {
      const freeQuota = PRO_FREE_QUOTA[plan] ?? 0;

      if (freeQuota === 0 && plan !== 'ULTRA') {
        // No free pro quota — check if FREE plan (pro unavailable)
        if (plan === 'FREE' || plan === 'BASIC') {
          // Check caspers
          if (user.caspers_balance < cost) {
            throw Object.assign(
              new Error('Недостаточно Caspers для про-сообщения'),
              { code: 'LIMIT_PRO_UNAVAILABLE' },
            );
          }
        }
      }

      // Check free quota first (PRO/VIP plans have daily free pro messages)
      if (freeQuota === -1) {
        // ULTRA: unlimited pro — just track
        await tx.user.update({ where: { id: userId }, data: { pro_messages_today: { increment: 1 } } });
        return;
      }

      if (freeQuota > 0 && user.pro_messages_today < freeQuota) {
        // Use free quota
        await tx.user.update({ where: { id: userId }, data: { pro_messages_today: { increment: 1 } } });
        return;
      }

      // Deduct from caspers
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers'),
          { code: 'LIMIT_PRO_MESSAGES' },
        );
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          caspers_balance: { decrement: cost },
          pro_messages_today: { increment: 1 },
        },
      });
      await tx.casperTransaction.create({
        data: { userId, amount: -cost, reason: 'chat_pro' },
      });
      return;
    }

    // ── image generation ──────────────────────────────────────────────────────
    if (requestType === 'image_generate' || requestType === 'image_edit') {
      if (plan === 'FREE') {
        if (user.images_this_week >= FREE_WEEKLY_LIMITS.images) {
          throw Object.assign(
            new Error('Лимит картинок на этой неделе исчерпан'),
            { code: 'LIMIT_IMAGES' },
          );
        }
        await tx.user.update({ where: { id: userId }, data: { images_this_week: { increment: 1 } } });
        return;
      }
      // Paid plans: deduct caspers
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации изображения'),
          { code: 'LIMIT_IMAGES' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({
        data: { userId, amount: -cost, reason: requestType },
      });
      return;
    }

    // ── music generation ──────────────────────────────────────────────────────
    if (requestType === 'music_generate') {
      if (plan === 'FREE') {
        if (user.music_this_week >= FREE_WEEKLY_LIMITS.music) {
          throw Object.assign(
            new Error('Лимит треков на этой неделе исчерпан'),
            { code: 'LIMIT_MUSIC' },
          );
        }
        await tx.user.update({ where: { id: userId }, data: { music_this_week: { increment: 1 } } });
        return;
      }
      // Paid plans: deduct caspers
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации музыки'),
          { code: 'LIMIT_MUSIC' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({
        data: { userId, amount: -cost, reason: 'music_generate' },
      });
      return;
    }

    // ── video generation ──────────────────────────────────────────────────────
    if (
      requestType === 'video_std_4s' ||
      requestType === 'video_std_8s' ||
      requestType === 'video_pro_4s' ||
      requestType === 'video_pro_8s'
    ) {
      if (plan === 'FREE') {
        if (user.videos_this_week >= FREE_WEEKLY_LIMITS.videos) {
          throw Object.assign(
            new Error('Лимит видео на этой неделе исчерпан'),
            { code: 'LIMIT_VIDEOS' },
          );
        }
        await tx.user.update({ where: { id: userId }, data: { videos_this_week: { increment: 1 } } });
        return;
      }
      // Paid plans: deduct caspers
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации видео'),
          { code: 'LIMIT_VIDEOS' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({
        data: { userId, amount: -cost, reason: requestType },
      });
      return;
    }
  });
}

// ─── Refund caspers on API error ──────────────────────────────────────────────

export async function refundCaspers(
  userId: string,
  requestType: RequestType,
): Promise<void> {
  try {
    const cost = CASPER_COSTS[requestType];
    if (cost === 0) return; // nothing to refund

    // Check if the user actually had caspers deducted (i.e. not FREE tier limits)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) return;

    const plan = user.plan as string;

    // FREE plan users don't have caspers deducted for images/music/videos
    const isFreeWeeklyOp =
      requestType === 'image_generate' ||
      requestType === 'image_edit' ||
      requestType === 'music_generate' ||
      requestType === 'video_std_4s' ||
      requestType === 'video_std_8s' ||
      requestType === 'video_pro_4s' ||
      requestType === 'video_pro_8s';

    if (plan === 'FREE' && isFreeWeeklyOp) return;

    // For pro chat: only refund if caspers were actually deducted (not free quota)
    if (requestType === 'chat_pro') {
      // Best-effort: just refund cost
    }

    await prisma.$executeRaw`
      UPDATE "User"
      SET "caspers_balance" = "caspers_balance" + ${cost}
      WHERE id = ${userId}
    `;

    await prisma.casperTransaction.create({
      data: { userId, amount: cost, reason: `refund_${requestType}` },
    }).catch(() => {});
  } catch {
    // Refund is best-effort
  }
}

// ─── Legacy alias for compatibility ──────────────────────────────────────────

export const refundCounter = refundCaspers;

// ─── Deduct caspers directly (used by yokassa.ts) ────────────────────────────

export async function deductCaspers(
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { caspers_balance: true },
    });
    if (!user) throw new Error('User not found');
    if (user.caspers_balance < amount) {
      throw Object.assign(new Error('Недостаточно Caspers'), { code: 'INSUFFICIENT_CASPERS' });
    }
    await tx.user.update({
      where: { id: userId },
      data: { caspers_balance: { decrement: amount } },
    });
    await tx.casperTransaction.create({
      data: { userId, amount: -amount, reason },
    });
  });
}

// ─── Grant caspers (used on plan purchase/renewal) ───────────────────────────

export async function grantCaspers(
  userId: string,
  amount: number,
  monthly: number,
  reason: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      caspers_balance: amount,
      caspers_monthly: monthly,
      period_start: new Date(),
      // Reset daily counters on plan change
      std_messages_today: 0,
      pro_messages_today: 0,
      day_start: new Date(),
    },
  });
  await prisma.casperTransaction.create({
    data: { userId, amount, reason },
  }).catch(() => {});
}

// ─── Legacy: kept for type compatibility with chat.ts ─────────────────────────
// (chat.ts imports this but uses the new checkAndDeduct above)

export interface PlanLimits {
  std_messages_daily: number;
  pro_messages_daily: number;
  images_daily:       number;
  videos_daily:       number;
  music_daily:        number;
  files_monthly:      number;
}
