// Карточка пользователя + кнопки управления аккаунтом (план/Caspers/бан) —
// общий формат для админ-бота (/user в admin-bot.ts) и системы тикетов
// поддержки (support-tickets.ts), чтобы не дублировать вёрстку в двух местах.
import { prisma } from './prisma.js';
import { redis } from './redis.js';
import { USAGE_COUNTERS_SELECT } from './user-select.js';
import type { InlineKeyboardMarkup } from './telegram-forum.js';

const PLAN_ICON: Record<string, string> = {
  FREE: '🆓', BASIC: '⭐', PRO: '🚀', VIP: '💎', ULTRA: '🔥',
};

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function userActionKeyboard(userId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📦 Изменить план', callback_data: `plan_menu:${userId}` },
        { text: '🔄 Сбросить лимиты', callback_data: `rl:${userId}` },
      ],
      [
        { text: '➕ Caspers', callback_data: `caspers_add:${userId}` },
        { text: '➖ Caspers', callback_data: `caspers_sub:${userId}` },
      ],
      [
        { text: '🚫 Бан', callback_data: `ban:${userId}` },
        { text: '✅ Разбан', callback_data: `unban:${userId}` },
      ],
    ],
  };
}

/** null — пользователь не найден (нечего показать). */
export async function fmtUserCard(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, telegramId: true,
      plan: true, planExpiresAt: true, billing: true,
      createdAt: true,
      ...USAGE_COUNTERS_SELECT,
    },
  });
  if (!user) return null;

  const isBanned = (await redis.exists(`banned:${user.id}`)) === 1;
  const plan     = `${PLAN_ICON[user.plan] ?? '?'} <b>${user.plan}</b>`;
  const expires  = user.planExpiresAt
    ? `\n⏰ Подписка до: ${user.planExpiresAt.toLocaleDateString('ru')}`
    : '';
  const tg       = user.telegramId ? `\n📱 TG ID: <code>${user.telegramId}</code>` : '';
  const email    = user.email ? `\n📧 ${user.email}` : '';
  const banned   = isBanned ? '\n🚫 <b>ЗАБАНЕН</b>' : '';
  const billing  = user.billing ? ` (${user.billing})` : '';

  return (
    `👤 <b>${escHtml(user.name ?? 'Без имени')}</b>${banned}\n` +
    `🆔 <code>${user.id}</code>${tg}${email}\n` +
    `📅 Зарегистрирован: ${user.createdAt.toLocaleDateString('ru')}\n` +
    `📦 План: ${plan}${billing}${expires}\n\n` +
    `👻 <b>Caspers:</b> ${user.caspers_balance} (месячных: ${user.caspers_monthly})\n\n` +
    `📊 <b>Активность сегодня:</b>\n` +
    `💬 Чат (стд): ${user.std_messages_today}\n` +
    `🧠 Чат (про): ${user.pro_messages_today}\n` +
    `🖼 Картинки (нед): ${user.images_this_week}\n` +
    `🎵 Музыка (нед): ${user.music_this_week}\n` +
    `🎬 Видео (мес): ${user.videos_this_month}`
  );
}
