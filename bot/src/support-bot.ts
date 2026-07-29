/**
 * GhostLine Support Bot
 * ──────────────────────
 * Отдельный бот только для тикетов поддержки — намеренно не имеет доступа
 * ни к чему из admin-bot.ts (бан/тарифы/Caspers/логи/рестарт серверов).
 * Вся бизнес-логика — в registerSupportHandlers (support-admin.ts) и на
 * backend (support-tickets.ts); этот файл только поднимает процесс.
 */
import { Bot } from 'grammy';
import { registerSupportHandlers } from './support-admin.js';
import { registerUserIntakeHandlers } from './support-user-intake.js';

const BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('SUPPORT_BOT_TOKEN is required');

const bot = new Bot(BOT_TOKEN);

// Личка (пользователь пишет обращение) и темы группы (оператор отвечает) —
// независимые обработчики, каждый игнорирует чужой тип чата через next().
registerUserIntakeHandlers(bot);
registerSupportHandlers(bot);

bot.catch((err) => {
  // Игнорируем ошибки просроченных / уже отвеченных callback query — безобидная гонка
  if (err.message.includes('query is too old') || err.message.includes('query ID is invalid')) return;
  console.error('[SupportBot] Error:', err.message);
});

async function main() {
  console.log('[SupportBot] Starting GhostLine Support Bot...');
  await bot.start({
    onStart: (info) => console.log(`[SupportBot] Running as @${info.username}`),
  });
}

main().catch((err) => {
  console.error('[SupportBot] Fatal:', err);
  process.exit(1);
});
