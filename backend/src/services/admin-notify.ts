/**
 * Сервис уведомлений администраторов
 * ───────────────────────────────────
 * Отправляет сообщения в Telegram на все настроенные chat ID админов через токен админ-бота.
 * Fail-silent: никогда не бросает исключение — основной поток не должен ломаться, если Telegram недоступен.
 */

import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { USAGE_COUNTERS_SELECT } from '../lib/user-select.js';

// Должен обходить HTTP_PROXY — глобальный прокси некорректно проксирует HTTPS (та же проблема, что и у YooKassa)
const notifyAxios = axios.create({ proxy: false });

const TOKEN  = process.env.ADMIN_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMINS = (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);

interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

async function send(chatId: string, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<void> {
  if (!TOKEN) return;
  await notifyAxios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
    { timeout: 5000 },
  ).catch(err => console.error(`[AdminNotify] Failed to notify ${chatId}:`, err.message));
}

export async function notifyAdmins(text: string, replyMarkup?: InlineKeyboardMarkup): Promise<void> {
  if (!TOKEN || ADMINS.length === 0) return;
  await Promise.allSettled(ADMINS.map(id => send(id, text, replyMarkup)));
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export async function notifyNewUser(user: {
  id: string;
  name: string | null;
  telegramId: string | null;
  telegramUsername?: string | null;
  email: string | null;
  plan: string;
  createdAt: Date;
  source?: string;
}): Promise<void> {
  const src  = user.source ?? 'unknown';
  const name = user.name ?? 'Без имени';
  const tgHandle = user.telegramUsername ? ` (@${user.telegramUsername})` : '';
  const tg   = user.telegramId ? `\nTG ID: <code>${user.telegramId}</code>${tgHandle}` : '';
  const mail = user.email ? `\nEmail: ${user.email}` : '';
  await notifyAdmins(
    `🆕 <b>Новый пользователь!</b>\n\n` +
    `👤 ${name}${tg}${mail}\n` +
    `🆔 ID: <code>${user.id}</code>\n` +
    `📦 План: ${user.plan}\n` +
    `🔑 Источник: ${src}`,
  );
}

export async function notifyPayment(info: {
  userId: string;
  userName: string | null;
  amount: number;
  plan: string;
  billing: string;
}): Promise<void> {
  await notifyAdmins(
    `💰 <b>Оплата получена!</b>\n\n` +
    `👤 ${info.userName ?? 'Без имени'}\n` +
    `🆔 User ID: <code>${info.userId}</code>\n` +
    `📦 План: <b>${info.plan}</b> (${info.billing})\n` +
    `💵 Сумма: <b>${info.amount.toLocaleString('ru')} ₽</b>`,
  );
}

export async function notifyAbuse(info: {
  userId: string;
  userName: string | null;
  type: 'chat' | 'image' | 'video';
  count: number;
  limit: number;
}): Promise<void> {
  const typeLabel = { chat: '💬 Чат', image: '🖼 Картинки', video: '🎬 Видео' }[info.type];
  await notifyAdmins(
    `⚠️ <b>Подозрительная активность!</b>\n\n` +
    `👤 ${info.userName ?? 'Без имени'}\n` +
    `🆔 User ID: <code>${info.userId}</code>\n` +
    `${typeLabel}: <b>${info.count}/${info.limit}</b> за час\n\n` +
    `Управление: /user ${info.userId}`,
  );
}

// ─── Тикет поддержки: карточка пользователя + кнопки действий ────────────────
// Карточка/клавиатура — те же поля и callback_data, что у /user в admin-bot.ts
// (fmtUser/userKb), чтобы существующие обработчики кнопок в админ-боте
// подхватывали нажатия без изменений на его стороне.

const PLAN_ICON: Record<string, string> = {
  FREE: '🆓', BASIC: '⭐', PRO: '🚀', VIP: '💎', ULTRA: '🔥',
};

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function userActionKeyboard(userId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '👤 Открыть карточку', callback_data: `u:${userId}` }],
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

async function fmtUserCard(userId: string): Promise<string | null> {
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

export async function notifySupportTicket(ticket: {
  userId: string | null;
  guestEmail?: string;
  message: string;
}): Promise<void> {
  const header = `📩 <b>Обращение в поддержку</b>\n\n💬 ${escHtml(ticket.message)}\n\n`;

  if (!ticket.userId) {
    await notifyAdmins(`${header}👤 Гость · 📧 ${ticket.guestEmail ?? 'не указан'}`);
    return;
  }

  const card = await fmtUserCard(ticket.userId);
  if (!card) {
    await notifyAdmins(`${header}⚠️ Пользователь <code>${ticket.userId}</code> не найден в БД`);
    return;
  }

  await notifyAdmins(`${header}${card}`, userActionKeyboard(ticket.userId));
}

export async function notifyApiError(info: {
  userId: string;
  userName?: string | null;
  operation: string; // 'image_gen' | 'video_gen' | 'music_gen' | 'chat' — тип операции
  error: string;
  context?: string;
}): Promise<void> {
  const opLabel: Record<string, string> = {
    image_gen: '🖼 Генерация изображения',
    video_gen: '🎬 Генерация видео',
    music_gen: '🎵 Генерация музыки',
    chat:      '💬 Чат',
  };
  const label = opLabel[info.operation] ?? `⚙️ ${info.operation}`;
  const ctx = info.context ? `\n📋 Контекст: <code>${info.context.slice(0, 200)}</code>` : '';
  await notifyAdmins(
    `🔴 <b>Ошибка API!</b>\n\n` +
    `👤 ${info.userName ?? 'Без имени'}\n` +
    `🆔 User ID: <code>${info.userId}</code>\n` +
    `${label}\n` +
    `❌ Ошибка: <code>${info.error.slice(0, 300)}</code>${ctx}`,
  );
}
