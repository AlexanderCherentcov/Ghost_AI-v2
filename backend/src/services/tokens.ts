import { prisma } from '../lib/prisma.js';
import { FREE_LIMITS, CASPER_COSTS } from '../config/plans.js';

/**
 * Домен операции — определяет, какой путь списания применяется. Цена для
 * 'chat'/'image'/'video' приходит из реестра моделей (config/models.ts,
 * ModelSpec.cost), а не отсюда — эта функция больше не знает о конкретных
 * моделях. 'music' — временно исключение: пока нет реестра музыкальных
 * моделей, цена берётся из статического CASPER_COSTS.music_generate,
 * как и раньше.
 */
export type SpendDomain = 'chat' | 'image' | 'video' | 'music';

export { CASPER_COSTS };

// Тип клиента транзакции Prisma — тот же приём, что уже применён в
// deductCaspersOrThrow, чтобы функции могли работать и с обычным prisma,
// и внутри чужого $transaction (например, вебхука ЮKassa).
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const FREE_WEEKLY_LIMITS = {
  images: FREE_LIMITS.images_weekly,
  music:  FREE_LIMITS.music_weekly,
};

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

  // Балансовая демоция подписки (решение Александра, 2026-09-11): платные
  // привилегии держатся, пока caspers_balance > 0, а не до какой-то даты.
  // РАНЬШЕ здесь был периодический авто-регрант caspers_monthly каждые 30 дней
  // (period_start + 30d) НЕЗАВИСИМО от того, оплатил ли пользователь ещё раз —
  // то есть один платёж давал бесконечные ежемесячные Caspers даром, а
  // user.plan вообще никогда не откатывался на FREE (planExpiresAt не
  // проверялся нигде). Теперь единственный источник новых Caspers на платный
  // тариф — реальная оплата (см. processWebhook в yokassa.ts), а демоция —
  // вот эта проверка, тот же паттерн, что и в checkAndDeduct.
  if (user.plan !== 'FREE' && user.caspers_balance <= 0) {
    updates.plan = 'FREE';
    updates.caspers_monthly = 0;
  }

  // Применяем сбросы счётчиков/демоцию (если есть) одним запросом
  if (Object.keys(updates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updates });
  }
}

/**
 * Та же балансовая демоция, что в checkResets/checkAndDeduct — вызывается
 * отдельно там, где баланс мог уйти в 0 не через обычный расход (возврат
 * оплаты, ручное списание админом), а не через checkAndDeduct/checkResets.
 */
export async function demoteIfDepleted(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, plan: { not: 'FREE' }, caspers_balance: { lte: 0 } },
    data: { plan: 'FREE', caspers_monthly: 0 },
  }).catch(() => {});
}

// ─── Атомарное списание Caspers ────────────────────────────────────────────────
// ВАЖНО: проверка баланса и decrement объединены в один UPDATE с условием в WHERE
// (как claimOneUse в promo.ts), а не read-then-write — иначе два параллельных
// запроса (например, двойной клик или скрипт) читают один и тот же баланс,
// оба проходят проверку "хватает" и оба списывают, уводя баланс в минус.
async function deductCaspersOrThrow(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  cost: number,
  reason: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const result = await tx.user.updateMany({
    where: { id: userId, caspers_balance: { gte: cost } },
    data: { caspers_balance: { decrement: cost } },
  });
  if (result.count === 0) {
    throw Object.assign(new Error(errorMessage), { code: errorCode });
  }
  await tx.casperTransaction.create({ data: { userId, amount: -cost, reason } });
}

// ─── Проверка лимитов и списание (единая логика для FREE и платных тарифов) ──
//
// cost — Caspers-цена операции, уже разрешённая вызывающим кодом из реестра
// моделей (ChatModelSpec.cost / VideoModelSpec.cost(duration) / ImageModelSpec.cost)
// или из CASPER_COSTS.music_generate для музыки.
//
// Возвращает { caspersSpent } — сколько РЕАЛЬНО списано с баланса (0, если
// операция покрылась дневным лимитом FREE-чата или бесплатной про-квотой).
// Это важно для refundCaspers: раньше при ошибке возвращалась полная cost
// независимо от того, списывались ли Caspers вообще — если про-сообщение
// покрыла бесплатная квота, а не Caspers, refund всё равно начислял cost
// пользователю, фактически даря Caspers. Теперь возвращаем ровно то, что
// списали.

export interface DeductResult {
  caspersSpent: number;
}

export async function checkAndDeduct(
  userId: string,
  domain: SpendDomain,
  cost: number,
  reason: string,
): Promise<DeductResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        caspers_balance: true,
        std_messages_today: true,
        pro_messages_today: true,
      },
    });
    if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

    // Балансовая демоция подписки — см. подробный комментарий в checkResets.
    // Проверяем здесь тоже (не только в checkResets), т.к. это единственная
    // точка, где домен-специфичная логика ниже читает user.plan для гейтинга —
    // без этого баланс мог упасть до 0 прямо в этой транзакции (списание за
    // предыдущий домен того же запроса не бывает, но на всякий случай единый
    // источник правды лучше двух разных).
    let plan = user.plan as string;
    if (plan !== 'FREE' && user.caspers_balance <= 0) {
      await tx.user.update({ where: { id: userId }, data: { plan: 'FREE', caspers_monthly: 0 } });
      plan = 'FREE';
    }

    // ── обычный чат (бесплатная модель, cost === 0) ─────────────────────────
    // Безлимитный на платных тарифах — Cloudflare-модель ничего не стоит по
    // себестоимости, ограничивать её там незачем. На FREE — жёсткий дневной
    // лимит (FREE_LIMITS.chat_daily), см. решение Александра 2026-08-25:
    // раньше это был реальный безлимит даже без приветственного бонуса, теперь
    // бонус убран (FREE_WELCOME_CASPERS: 0) и лимит на чат — единственное,
    // что вообще ограничивает FREE-тариф. std_messages_today сбрасывается
    // в checkResets по day_start — тот же механизм, что уже был для статистики.
    if (domain === 'chat' && cost === 0) {
      if (plan === 'FREE') {
        // Проверка лимита и инкремент объединены в один UPDATE с условием в
        // WHERE (как в deductCaspersOrThrow) — иначе два параллельных запроса
        // читают один и тот же std_messages_today, оба проходят проверку и
        // оба инкрементируют, пропуская дневной лимит FREE-тарифа.
        const claimed = await tx.user.updateMany({
          where: { id: userId, std_messages_today: { lt: FREE_LIMITS.chat_daily } },
          data: { std_messages_today: { increment: 1 } },
        });
        if (claimed.count === 0) {
          throw Object.assign(
            new Error('Лимит бесплатных сообщений на сегодня исчерпан'),
            { code: 'LIMIT_MESSAGES' },
          );
        }
        return { caspersSpent: 0 };
      }
      await tx.user.update({ where: { id: userId }, data: { std_messages_today: { increment: 1 } } });
      return { caspersSpent: 0 };
    }

    // ── про-чат (платная модель) ────────────────────────────────────────────
    // Раньше здесь была бесплатная дневная квота по тарифам (PRO/VIP/ULTRA) —
    // убрана по прямому решению Александра: модели, за которые платим мы,
    // должны оплачиваться Caspers всеми тарифами одинаково, без исключений.
    // pro_messages_today остаётся чистым счётчиком для статистики/админки,
    // на списание больше не влияет.
    if (domain === 'chat') {
      const proClaimed = await tx.user.updateMany({
        where: { id: userId, caspers_balance: { gte: cost } },
        data: { caspers_balance: { decrement: cost }, pro_messages_today: { increment: cost } },
      });
      if (proClaimed.count === 0) {
        throw Object.assign(new Error('Недостаточно Caspers'), { code: 'LIMIT_PRO_MESSAGES' });
      }
      await tx.casperTransaction.create({ data: { userId, amount: -cost, reason } });
      return { caspersSpent: cost };
    }

    // ── видео недоступно на FREE вообще — не только за приветственные Caspers,
    // но и за любые докупленные позже. Видео — самый дорогой домен по себестоимости
    // (в разы дороже картинок/музыки), пускать в него по одной лишь проверке баланса
    // означало, что приветственный бонус (100 Caspers) можно было целиком сжечь на
    // одну-две генерации видео без всякой реальной выручки. Раньше был необязательный
    // FREE_MONTHLY_LIMITS.videos = 3, но нигде фактически не проверялся — мёртвый код.
    if (domain === 'video' && plan === 'FREE') {
      throw Object.assign(
        new Error('Генерация видео доступна с тарифа BASIC и выше'),
        { code: 'LIMIT_VIDEOS_FREE_PLAN' },
      );
    }

    // ── изображения / видео / музыка — всегда прямое списание Caspers ──────
    const errorMap: Record<Exclude<SpendDomain, 'chat'>, { code: string; message: string }> = {
      image: { code: 'LIMIT_IMAGES', message: 'Недостаточно Caspers для генерации изображения' },
      video: { code: 'LIMIT_VIDEOS', message: 'Недостаточно Caspers для генерации видео' },
      music: { code: 'LIMIT_MUSIC', message: 'Недостаточно Caspers для генерации музыки' },
    };
    const { code, message } = errorMap[domain as Exclude<SpendDomain, 'chat'>];
    await deductCaspersOrThrow(tx, userId, cost, reason, code, message);
    return { caspersSpent: cost };
  });
}

// ─── Возврат Caspers при ошибке API ───────────────────────────────────────────
//
// amount — берётся из DeductResult.caspersSpent, а не пересчитывается заново,
// иначе легко повторить старый баг (возврат по прайсу вместо факта списания).

export async function refundCaspers(
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  if (amount <= 0) return; // нечего возвращать — операция была бесплатной (квота/дневной лимит)
  try {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "caspers_balance" = "caspers_balance" + ${amount}
      WHERE id = ${userId}
    `;
    await prisma.casperTransaction.create({
      data: { userId, amount, reason: `refund_${reason}` },
    }).catch(() => {});
  } catch {
    // Возврат делается по принципу best-effort
  }
}

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
//
// client — опционально передаётся tx, если вызывается внутри чужого
// $transaction (см. processWebhook в yokassa.ts — флип статуса платежа и
// начисление должны быть одной атомарной операцией, иначе крах процесса между
// ними навсегда помечает платёж SUCCEEDED без выданных Caspers/плана).

export async function grantCaspers(
  userId: string,
  amount: number,
  monthly: number,
  reason: string,
  client: PrismaTx | typeof prisma = prisma,
): Promise<void> {
  await client.user.update({
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
  await client.casperTransaction.create({
    data: { userId, amount, reason },
  }).catch(() => {});
}

// ─── Отмена начисления при возврате оплаты (refund.succeeded) ────────────────
// В отличие от deductCaspers — не бросает ошибку, если баланс меньше суммы
// (клэмп на 0): к моменту возврата пользователь мог уже потратить часть или
// весь начисленный при оплате баланс, отменить то, чего больше нет, нельзя.

export async function reverseCaspersGrant(userId: string, amount: number, reason: string): Promise<void> {
  if (amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { caspers_balance: true } });
    if (!user) return;
    const deduct = Math.min(amount, user.caspers_balance);
    if (deduct <= 0) return;
    await tx.user.update({ where: { id: userId }, data: { caspers_balance: { decrement: deduct } } });
    await tx.casperTransaction.create({ data: { userId, amount: -deduct, reason } }).catch(() => {});
  }).catch(() => {});
}

