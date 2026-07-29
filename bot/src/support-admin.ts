/**
 * Обработчики группы поддержки GhostLine AI в админ-боте.
 * ────────────────────────────────────────────────────────
 * Отдельный модуль (не часть admin-bot.ts) — регистрируется через
 * registerSupportHandlers(bot), ничего не знает о командах/клавиатурах
 * остального админ-бота.
 *
 *   • Ответ оператора текстом в теме тикета → релей пользователю (backend)
 *   • Кнопки «Взять» / «Закрыть» / «Возобновить» под каждым сообщением темы
 *
 * Вся бизнес-логика (статусы, форум-топики, релей пользователю) — на
 * backend (support-tickets.ts); этот модуль только читает апдейты Telegram
 * и дёргает соответствующие ручки.
 */
import type { Bot } from 'grammy';
import { api } from './lib/admin-api.js';
import { apiErrorMessage } from './lib/error-message.js';

const SUPPORT_GROUP_ID = process.env.GHOSTLINE_SUPPORT_GROUP_ID ?? '';

type TicketStatus = 'OPEN' | 'ASSIGNED' | 'CLOSED';
interface Ticket {
  id: string;
  status: TicketStatus;
}

function takeCloseKb(ticketId: string) {
  return {
    inline_keyboard: [[
      { text: '✋ Взять', callback_data: `supt_take:${ticketId}` },
      { text: '🔒 Закрыть', callback_data: `supt_close:${ticketId}` },
    ]],
  };
}

function closeKb(ticketId: string) {
  return { inline_keyboard: [[{ text: '🔒 Закрыть', callback_data: `supt_close:${ticketId}` }]] };
}

function reopenKb(ticketId: string) {
  return { inline_keyboard: [[{ text: '↩️ Возобновить', callback_data: `supt_reopen:${ticketId}` }]] };
}

async function findTicketByTopic(topicId: number): Promise<Ticket | null> {
  try {
    const { data } = await api.get(`/support/tickets/by-topic/${topicId}`);
    return data;
  } catch {
    return null;
  }
}

export function registerSupportHandlers(bot: Bot): void {
  if (!SUPPORT_GROUP_ID) {
    console.warn('[SupportAdmin] GHOSTLINE_SUPPORT_GROUP_ID не задан — группа поддержки отключена');
    return;
  }

  // ── Оператор пишет текст в теме тикета → релей пользователю ────────────────
  // Должен быть зарегистрирован раньше общего 'message:text' в admin-bot.ts —
  // тот не вызывает next(), иначе ответы операторов до сюда не долетят.
  bot.on('message:text', async (ctx, next) => {
    const isSupportTopic =
      String(ctx.chat.id) === SUPPORT_GROUP_ID &&
      ctx.message.message_thread_id !== undefined &&
      !ctx.message.text.startsWith('/');
    if (!isSupportTopic) return next();

    const ticket = await findTicketByTopic(ctx.message.message_thread_id!);
    if (!ticket) return; // тема не привязана к тикету — не мешаем остальным обсуждениям в группе

    try {
      const { data } = await api.post(`/support/tickets/${ticket.id}/reply`, { text: ctx.message.text });
      if (!data.ok && data.reason === 'no_telegram_id') {
        await ctx.reply('ℹ️ Ответ записан, но пользователь пришёл с сайта без Telegram — переслать некуда.');
      }
    } catch (err: any) {
      await ctx.reply(`❌ Не удалось отправить ответ: ${apiErrorMessage(err)}`);
    }
  });

  // ── Взять ───────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^supt_take:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    const admin = ctx.from;
    const adminName = admin.username ? `@${admin.username}` : (admin.first_name || 'Оператор');
    try {
      await api.post(`/support/tickets/${ticketId}/take`, { adminId: String(admin.id), adminName });
      await ctx.answerCallbackQuery(`Тикет за тобой, ${adminName}!`);
      await ctx.editMessageReplyMarkup({ reply_markup: closeKb(ticketId) });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: apiErrorMessage(err), show_alert: true });
    }
  });

  // ── Закрыть ──────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^supt_close:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    try {
      await api.post(`/support/tickets/${ticketId}/close`, {});
      await ctx.answerCallbackQuery('Тикет закрыт');
      await ctx.editMessageReplyMarkup({ reply_markup: reopenKb(ticketId) });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: apiErrorMessage(err), show_alert: true });
    }
  });

  // ── Возобновить ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^supt_reopen:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    try {
      await api.post(`/support/tickets/${ticketId}/reopen`, {});
      await ctx.answerCallbackQuery('Тикет возобновлён');
      await ctx.editMessageReplyMarkup({ reply_markup: closeKb(ticketId) });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: apiErrorMessage(err), show_alert: true });
    }
  });
}
