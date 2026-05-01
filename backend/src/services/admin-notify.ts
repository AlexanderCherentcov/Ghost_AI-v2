/**
 * Admin notification service
 * ──────────────────────────
 * Sends Telegram messages to all configured admin chat IDs via the admin bot token.
 * Fail-silent: never throws — main flow must not break if Telegram is down.
 */

import axios from 'axios';

const TOKEN  = process.env.ADMIN_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMINS = (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);

async function send(chatId: string, text: string): Promise<void> {
  if (!TOKEN) return;
  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
    { timeout: 5000 },
  ).catch(err => console.error(`[AdminNotify] Failed to notify ${chatId}:`, err.message));
}

export async function notifyAdmins(text: string): Promise<void> {
  if (!TOKEN || ADMINS.length === 0) return;
  await Promise.allSettled(ADMINS.map(id => send(id, text)));
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

export async function notifyApiError(info: {
  userId: string;
  userName?: string | null;
  operation: string; // 'image_gen' | 'video_gen' | 'music_gen' | 'chat'
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
