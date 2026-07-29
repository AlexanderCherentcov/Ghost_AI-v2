/**
 * Система тикетов поддержки
 * ─────────────────────────
 * Один тикет = одна тема (topic) в Telegram-супергруппе поддержки
 * (GHOSTLINE_SUPPORT_GROUP_ID, отдельная от группы ВПН-проекта).
 *
 *   1. Пользователь пишет в бота/на сайте → создаётся тикет, публикуется
 *      тема с карточкой пользователя (или гостя) и кнопками «Взять»/«Закрыть»
 *   2. Оператор берёт тикет — становится ответственным
 *   3. Ответ оператора в теме релеится пользователю через основного бота
 *      (только если пришёл из бота — у telegramId есть значение)
 *   4. «Закрыть»/«Возобновить» — статус тикета + форум-топик синхронно
 *
 * Ничего не хардкодится: токены и ID группы — из env, тексты сообщений
 * пользователю не смешаны с бизнес-логикой (отдельные константы внизу файла).
 */
import { prisma } from '../lib/prisma.js';
import type { SupportTicket } from '@prisma/client';
import {
  createForumTopic, reopenForumTopic, closeForumTopic, sendTelegramMessage,
  type InlineKeyboardMarkup,
} from '../lib/telegram-forum.js';
import { fmtUserCard, userActionKeyboard, escHtml } from '../lib/admin-user-card.js';

const ADMIN_BOT_TOKEN  = process.env.ADMIN_BOT_TOKEN ?? '';
const MAIN_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN ?? '';
const SUPPORT_GROUP_ID = process.env.GHOSTLINE_SUPPORT_GROUP_ID ?? '';

const OPEN_STATUSES = ['OPEN', 'ASSIGNED'] as const;

const USER_MESSAGES = {
  ticketAccepted: '✅ Обращение принято! Оператор ответит в ближайшее время 🕐',
  closed:         '✅ Ваш вопрос решён! Если появятся новые вопросы — просто напишите нам 💬',
  reopened:       '↩️ Оператор возобновил ваш запрос. Если есть дополнительные вопросы — просто напишите 💬',
};

// ─── Клавиатуры ────────────────────────────────────────────────────────────

function takeCloseKb(ticketId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: '✋ Взять',    callback_data: `supt_take:${ticketId}` },
      { text: '🔒 Закрыть', callback_data: `supt_close:${ticketId}` },
    ]],
  };
}

function closeKb(ticketId: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: '🔒 Закрыть', callback_data: `supt_close:${ticketId}` }]] };
}

export function reopenKb(ticketId: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: '↩️ Возобновить', callback_data: `supt_reopen:${ticketId}` }]] };
}

function ticketKeyboard(ticket: Pick<SupportTicket, 'id' | 'status'>): InlineKeyboardMarkup | undefined {
  if (ticket.status === 'OPEN')     return takeCloseKb(ticket.id);
  if (ticket.status === 'ASSIGNED') return closeKb(ticket.id);
  return undefined;
}

// ─── Карточка при открытии/переоткрытии темы ────────────────────────────────

async function postTicketOpenCard(ticket: SupportTicket): Promise<void> {
  if (!SUPPORT_GROUP_ID || !ticket.topicId) return;

  const card = ticket.userId ? await fmtUserCard(ticket.userId) : null;
  const body = card
    ? `📋 <b>Новое обращение</b>\n\n${card}`
    : `📋 <b>Новое обращение</b>\n\n👤 Гость\n📧 ${ticket.guestEmail ?? 'не указан'}` +
      (ticket.telegramId ? `\n🆔 TG: <code>${ticket.telegramId}</code>` : '');

  try {
    await sendTelegramMessage(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, body, {
      messageThreadId: ticket.topicId,
      replyMarkup: ticket.userId ? userActionKeyboard(ticket.userId) : undefined,
    });
  } catch (err: any) {
    console.error('[SupportTickets] Failed to post ticket card:', err.message);
  }
}

// ─── Создание тикета / поиск открытого ──────────────────────────────────────

interface TicketOrigin {
  userId: string | null;
  telegramId: string | null;
  guestEmail?: string;
  displayName?: string;
}

async function findOpenTicket(origin: TicketOrigin): Promise<SupportTicket | null> {
  if (origin.userId) {
    return prisma.supportTicket.findFirst({
      where: { userId: origin.userId, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (origin.telegramId) {
    return prisma.supportTicket.findFirst({
      where: { telegramId: origin.telegramId, userId: null, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
  }
  return null; // гость с сайта без идентификатора — сматчить прошлый тикет нечем
}

/** Последняя известная тема этого пользователя (для переоткрытия вместо создания новой). */
async function findPriorTopicId(origin: TicketOrigin): Promise<number | null> {
  const where = origin.userId
    ? { userId: origin.userId, topicId: { not: null } }
    : origin.telegramId
      ? { telegramId: origin.telegramId, userId: null, topicId: { not: null } }
      : null;
  if (!where) return null;
  const prior = await prisma.supportTicket.findFirst({ where, orderBy: { createdAt: 'desc' } });
  return prior?.topicId ?? null;
}

async function resolveTopicName(origin: TicketOrigin): Promise<string> {
  if (origin.displayName) return origin.displayName.slice(0, 100);
  if (origin.userId) {
    const user = await prisma.user.findUnique({ where: { id: origin.userId }, select: { name: true } });
    if (user?.name) return user.name.slice(0, 100);
  }
  return 'Гость';
}

/** Возвращает открытый тикет пользователя или создаёт новый (+ тема в группе, если она настроена). */
export async function getOrCreateOpenTicket(origin: TicketOrigin): Promise<SupportTicket> {
  const existing = await findOpenTicket(origin);
  if (existing) return existing;

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: origin.userId,
      telegramId: origin.telegramId,
      guestEmail: origin.guestEmail,
    },
  });

  if (!SUPPORT_GROUP_ID) return ticket; // группа не настроена — тикет остаётся только в БД

  try {
    const priorTopicId = await findPriorTopicId(origin);
    let topicId: number;
    if (priorTopicId) {
      try {
        await reopenForumTopic(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, priorTopicId);
        topicId = priorTopicId;
      } catch {
        // Тема могла быть удалена вручную — создаём новую вместо падения
        topicId = await createForumTopic(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, await resolveTopicName(origin));
      }
    } else {
      topicId = await createForumTopic(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, await resolveTopicName(origin));
    }

    const updated = await prisma.supportTicket.update({ where: { id: ticket.id }, data: { topicId } });
    await postTicketOpenCard(updated);
    return updated;
  } catch (err: any) {
    console.error('[SupportTickets] Failed to create topic:', err.message);
    return ticket;
  }
}

// ─── Сообщения ───────────────────────────────────────────────────────────────

export async function appendUserMessage(ticket: SupportTicket, text: string): Promise<void> {
  await prisma.supportMessage.create({ data: { ticketId: ticket.id, direction: 'IN', text } });
  if (!SUPPORT_GROUP_ID || !ticket.topicId) return;
  try {
    await sendTelegramMessage(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, escHtml(text), {
      messageThreadId: ticket.topicId,
      replyMarkup: ticketKeyboard(ticket),
    });
  } catch (err: any) {
    console.error('[SupportTickets] Failed to relay user message to group:', err.message);
  }
}

export type ReplyResult = { ok: true } | { ok: false; reason: 'not_found' | 'no_telegram_id' | 'send_failed' };

/** Ответ оператора из темы группы — записывается и релеится пользователю (если он писал через бота). */
export async function appendAdminReply(ticketId: string, text: string): Promise<ReplyResult> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, reason: 'not_found' };

  await prisma.supportMessage.create({ data: { ticketId, direction: 'OUT', text } });

  if (!ticket.telegramId) return { ok: false, reason: 'no_telegram_id' };
  try {
    await sendTelegramMessage(MAIN_BOT_TOKEN, ticket.telegramId, text);
    return { ok: true };
  } catch (err: any) {
    console.error('[SupportTickets] Failed to relay admin reply to user:', err.message);
    return { ok: false, reason: 'send_failed' };
  }
}

// ─── Статусы: взять / закрыть / возобновить ─────────────────────────────────

export async function takeTicket(ticketId: string, adminId: string, adminName: string): Promise<SupportTicket | null> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === 'CLOSED') return null;
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'ASSIGNED', assigneeId: adminId, assigneeName: adminName },
  });
}

export async function closeTicket(ticketId: string): Promise<SupportTicket | null> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === 'CLOSED') return null;

  const updated = await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'CLOSED' } });

  if (SUPPORT_GROUP_ID && updated.topicId) {
    await closeForumTopic(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, updated.topicId).catch(() => {});
  }
  if (updated.telegramId) {
    await sendTelegramMessage(MAIN_BOT_TOKEN, updated.telegramId, USER_MESSAGES.closed).catch(() => {});
  }
  return updated;
}

export async function reopenTicket(ticketId: string): Promise<SupportTicket | null> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status !== 'CLOSED') return null;

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: ticket.assigneeId ? 'ASSIGNED' : 'OPEN' },
  });

  if (SUPPORT_GROUP_ID && updated.topicId) {
    await reopenForumTopic(ADMIN_BOT_TOKEN, SUPPORT_GROUP_ID, updated.topicId).catch(() => {});
  }
  if (updated.telegramId) {
    await sendTelegramMessage(MAIN_BOT_TOKEN, updated.telegramId, USER_MESSAGES.reopened).catch(() => {});
  }
  return updated;
}

export async function findTicketByTopicId(topicId: number): Promise<SupportTicket | null> {
  return prisma.supportTicket.findFirst({ where: { topicId }, orderBy: { createdAt: 'desc' } });
}

export function ticketAcceptedMessage(): string {
  return USER_MESSAGES.ticketAccepted;
}

export { ticketKeyboard };
