/**
 * Приём обращений от пользователей напрямую в боте поддержки (личные сообщения).
 * ──────────────────────────────────────────────────────────────────────────────
 * Отдельно от registerSupportHandlers (support-admin.ts), который слушает
 * ответы ОПЕРАТОРОВ внутри тем группы — здесь обратная сторона: пользователь
 * пишет боту в личку, а мы заводим/дополняем тикет через backend.
 */
import { Bot } from 'grammy';
import { api } from './lib/admin-api.js';

const WELCOME_TEXT =
  '👋 Поддержка GhostLine AI\n\n' +
  'Напиши сюда свой вопрос одним сообщением — оператор ответит в ближайшее время.';

const ACCEPTED_TEXT = '✅ Обращение принято! Ответим в ближайшее время 🕐';
const FAILED_TEXT   = '❌ Не удалось отправить обращение. Попробуй ещё раз чуть позже.';

export function registerUserIntakeHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply(WELCOME_TEXT);
  });

  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private' || ctx.message.text.startsWith('/')) return next();

    try {
      await api.post('/support/message-from-telegram', {
        telegramId: String(ctx.from.id),
        text: ctx.message.text.slice(0, 2000),
        displayName: ctx.from.first_name,
      });
      await ctx.reply(ACCEPTED_TEXT);
    } catch {
      await ctx.reply(FAILED_TEXT);
    }
  });
}
