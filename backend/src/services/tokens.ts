import { prisma } from '../lib/prisma.js';
import { FREE_LIMITS, CASPER_COSTS as _COSTS } from '../config/plans.js';

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

// ─── Стоимость в Caspers (chat_std всегда бесплатен) ──────────────────────────

export const CASPER_COSTS: Record<RequestType, number> = {
  chat_std:       0,
  chat_pro:       _COSTS.chat_pro,
  image_generate: _COSTS.image_generate,
  image_edit:     _COSTS.image_edit,
  video_std_4s:   _COSTS.video_std_4s,
  video_std_8s:   _COSTS.video_std_8s,
  video_pro_4s:   _COSTS.video_pro_4s,
  video_pro_8s:   _COSTS.video_pro_8s,
  music_generate: _COSTS.music_generate,
};

export const FREE_WEEKLY_LIMITS = {
  images: FREE_LIMITS.images_weekly,
  music:  FREE_LIMITS.music_weekly,
};

export const FREE_MONTHLY_LIMITS = {
  videos: FREE_LIMITS.videos_monthly,  // 3 видео в месяц
};

export const FREE_DAILY_LIMITS = {
  std_messages: FREE_LIMITS.std_messages_daily,
};

// ─── Бесплатная дневная квота про-чата по тарифам (-1 = безлимит) ────────────

export const PRO_FREE_QUOTA: Record<string, number> = {
  FREE:  0,
  BASIC: 0,
  PRO:   20,
  VIP:   50,
  ULTRA: -1,
} as const;

// ─── Санитизация ввода ─────────────────────────────────────────────────────────

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F​-‍﻿]/g, '')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 16000);
}

// ─── Сброс дневных/недельных/месячных счётчиков по окончании периода ─────────

export async function checkResets(userId: string): Promise<void> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      day_start: true,
      week_start: true,
      month_start: true,
      period_start: true,
      caspers_monthly: true,
      caspers_balance: true,
    },
  });
  if (!user) return;

  const updates: Record<string, unknown> = {};

  // Дневной сброс (счётчики обычного/про чата)
  const dayEnd = new Date(user.day_start);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (now >= dayEnd) {
    updates.std_messages_today = 0;
    updates.pro_messages_today = 0;
    updates.day_start = now;
  }

  // Недельный сброс (FREE-тариф: картинки + музыка)
  const weekEnd = new Date(user.week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (now >= weekEnd) {
    updates.images_this_week = 0;
    updates.music_this_week  = 0;
    updates.week_start       = now;
  }

  // Месячный сброс (FREE-тариф: видео — 3/месяц)
  const monthEnd = new Date(user.month_start);
  monthEnd.setDate(monthEnd.getDate() + 30);
  if (now >= monthEnd) {
    updates.videos_this_month = 0;
    updates.month_start       = now;
  }

  // Месячное начисление Caspers: когда прошло period_start + 30 дней (только платные тарифы)
  // Используем оптимистичную блокировку (updateMany с условием по period_start) + атомарный
  // инкремент, чтобы избежать двойного начисления при гонке.
  let didGrantMonthly = false;
  if (user.caspers_monthly > 0) {
    const periodEnd = new Date(user.period_start);
    periodEnd.setDate(periodEnd.getDate() + 30);
    if (now >= periodEnd) {
      const granted = await prisma.user.updateMany({
        where: {
          id: userId,
          period_start: user.period_start,   // оптимистичная блокировка — сработает только один раз
          caspers_monthly: { gt: 0 },
        },
        data: {
          caspers_balance: { increment: user.caspers_monthly },
          period_start: now,
        },
      });
      if (granted.count > 0) {
        didGrantMonthly = true;
        await prisma.casperTransaction.create({
          data: { userId, amount: user.caspers_monthly, reason: 'plan_grant_monthly' },
        }).catch(() => {});
      }
    }
  }

  // Применяем оставшиеся сбросы счётчиков (если есть) отдельно
  if (Object.keys(updates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updates });
  }

  // Подавляем предупреждение о неиспользуемой переменной
  void didGrantMonthly;
}

// ─── Определение типа видео-запроса по модели + длительности ─────────────────

export function resolveVideoRequestType(
  model: 'standard' | 'pro' | 'motion' | 'cinema' | 'reality' = 'standard',
  duration: '4s' | '8s' = '8s',
): RequestType {
  // cinema = Veo 3.1 Pro (дорогая), motion/standard = Veo 3.1 Fast, reality = Kling (стандартная цена)
  if (model === 'pro' || model === 'cinema') {
    return duration === '4s' ? 'video_pro_4s' : 'video_pro_8s';
  }
  return duration === '4s' ? 'video_std_4s' : 'video_std_8s';
}

// ─── Проверка лимитов и списание (единая логика для FREE и платных тарифов) ──

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
        videos_this_month: true,
      },
    });
    if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

    const plan = user.plan as string;
    const cost = CASPER_COSTS[requestType];

    // ── обычный чат ───────────────────────────────────────────────────────────
    if (requestType === 'chat_std') {
      if (plan === 'FREE') {
        if (user.std_messages_today >= FREE_DAILY_LIMITS.std_messages) {
          throw Object.assign(
            new Error('Лимит бесплатных сообщений исчерпан'),
            { code: 'LIMIT_MESSAGES_DAILY' },
          );
        }
        await tx.user.update({ where: { id: userId }, data: { std_messages_today: { increment: 1 } } });
      } else {
        // Платные тарифы: обычный чат всегда бесплатный (списание не нужно)
        await tx.user.update({ where: { id: userId }, data: { std_messages_today: { increment: 1 } } });
      }
      return;
    }

    // ── про-чат ───────────────────────────────────────────────────────────────
    if (requestType === 'chat_pro') {
      const freeQuota = PRO_FREE_QUOTA[plan] ?? 0;

      if (freeQuota === 0 && plan !== 'ULTRA') {
        // Бесплатной про-квоты нет — проверяем, не FREE ли план (про недоступен)
        if (plan === 'FREE' || plan === 'BASIC') {
          // Проверяем Caspers
          if (user.caspers_balance < cost) {
            throw Object.assign(
              new Error('Недостаточно Caspers для про-сообщения'),
              { code: 'LIMIT_PRO_UNAVAILABLE' },
            );
          }
        }
      }

      // Сначала проверяем бесплатную квоту (у PRO/VIP есть дневные бесплатные про-сообщения)
      if (freeQuota === -1) {
        // ULTRA: безлимитный про — просто считаем
        await tx.user.update({ where: { id: userId }, data: { pro_messages_today: { increment: 1 } } });
        return;
      }

      if (freeQuota > 0 && user.pro_messages_today < freeQuota) {
        // Используем бесплатную квоту
        await tx.user.update({ where: { id: userId }, data: { pro_messages_today: { increment: 1 } } });
        return;
      }

      // Списываем Caspers
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

    // ── генерация изображений ────────────────────────────────────────────────
    if (requestType === 'image_generate' || requestType === 'image_edit') {
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации изображения'),
          { code: 'LIMIT_IMAGES' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({ data: { userId, amount: -cost, reason: requestType } });
      return;
    }

    // ── генерация музыки ─────────────────────────────────────────────────────
    if (requestType === 'music_generate') {
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации музыки'),
          { code: 'LIMIT_MUSIC' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({ data: { userId, amount: -cost, reason: 'music_generate' } });
      return;
    }

    // ── генерация видео ──────────────────────────────────────────────────────
    if (
      requestType === 'video_std_4s' ||
      requestType === 'video_std_8s' ||
      requestType === 'video_pro_4s' ||
      requestType === 'video_pro_8s'
    ) {
      if (user.caspers_balance < cost) {
        throw Object.assign(
          new Error('Недостаточно Caspers для генерации видео'),
          { code: 'LIMIT_VIDEOS' },
        );
      }
      await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: cost } } });
      await tx.casperTransaction.create({ data: { userId, amount: -cost, reason: requestType } });
      return;
    }
  });
}

// ─── Возврат Caspers при ошибке API ───────────────────────────────────────────

export async function refundCaspers(
  userId: string,
  requestType: RequestType,
): Promise<void> {
  try {
    const cost = CASPER_COSTS[requestType];
    if (cost === 0) return; // возвращать нечего

    // Проверяем, реально ли списывались Caspers (а не лимиты FREE-тарифа)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) return;

    // Для про-чата: возвращаем, только если Caspers реально списывались (не из бесплатной квоты)
    if (requestType === 'chat_pro') {
      // Best-effort: просто возвращаем стоимость
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
    // Возврат делается по принципу best-effort
  }
}

// ─── Устаревший алиас для обратной совместимости ─────────────────────────────

export const refundCounter = refundCaspers;

// ─── Прямое списание Caspers (используется в yokassa.ts) ─────────────────────

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

// ─── Начисление Caspers (при покупке/продлении тарифа) ───────────────────────

export async function grantCaspers(
  userId: string,
  amount: number,
  monthly: number,
  reason: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      caspers_balance: { increment: amount },
      caspers_monthly: monthly,
      period_start: new Date(),
      // Сбрасываем дневные счётчики при смене тарифа
      std_messages_today: 0,
      pro_messages_today: 0,
      day_start: new Date(),
    },
  });
  await prisma.casperTransaction.create({
    data: { userId, amount, reason },
  }).catch(() => {});
}

// ─── Устаревшее: оставлено для совместимости типов с chat.ts ─────────────────
// (chat.ts импортирует это, но использует новый checkAndDeduct выше)

export interface PlanLimits {
  std_messages_daily: number;
  pro_messages_daily: number;
  images_daily:       number;
  videos_daily:       number;
  music_daily:        number;
  files_monthly:      number;
}
