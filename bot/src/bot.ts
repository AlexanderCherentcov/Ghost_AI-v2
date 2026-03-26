import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';
const MINIAPP_URL = process.env.MINIAPP_URL ?? 'https://miniapp.ghostlineai.ru';

const bot = new Bot(BOT_TOKEN);

// ─── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name ?? 'пользователь';
  const payload = ctx.match; // text after /start

  // ── Auth via bot link ──────────────────────────────────────────────────────
  if (payload === 'auth' && ctx.from) {
    try {
      const res = await axios.post(`${API_URL}/api/auth/telegram-bot`, {
        id: ctx.from.id,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        photo_url: ctx.from.username
          ? `https://t.me/i/userpic/320/${ctx.from.username}.jpg`
          : undefined,
      }, {
        headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' },
      });

      const { accessToken, refreshToken, isNew } = res.data as {
        accessToken: string;
        refreshToken: string;
        isNew: boolean;
      };

      const redirect = isNew ? '/onboarding/name' : '/chat';
      const loginUrl = `${FRONTEND_URL}/auth/callback?access=${accessToken}&refresh=${refreshToken}&redirect=${redirect}`;

      await ctx.reply(
        `🔑 *Ваша ссылка для входа:*\n\nНажмите кнопку ниже — она действует 5 минут.\nНикому не передавайте эту ссылку.`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url('🚀 Войти в GhostLine', loginUrl),
        }
      );
      return;
    } catch {
      await ctx.reply('❌ Ошибка входа. Попробуйте ещё раз.');
      return;
    }
  }

  const keyboard = new InlineKeyboard()
    .webApp('🤖 Открыть GhostLine', MINIAPP_URL)
    .row()
    .url('🌐 Сайт', FRONTEND_URL)
    .url('💬 Чат', `${FRONTEND_URL}/chat`);

  await ctx.reply(
    `👻 *Привет, ${name}!*\n\nДобро пожаловать в *GhostLine AI* — твой личный ИИ-помощник.\n\n` +
    `🔮 Что умею:\n` +
    `• 💬 Отвечать на вопросы и вести диалог\n` +
    `• 🖼 Генерировать изображения\n` +
    `• 🎵 Создавать музыку\n` +
    `• 🎬 Генерировать видео\n` +
    `• 🧠 Глубокий анализ и размышления\n\n` +
    `Нажми кнопку ниже, чтобы начать 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
});

// ─── /help ─────────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  await ctx.reply(
    `👻 *GhostLine AI — Помощь*\n\n` +
    `*Команды:*\n` +
    `/start — Главное меню\n` +
    `/balance — Баланс токенов\n` +
    `/help — Это сообщение\n\n` +
    `*Режимы работы:*\n` +
    `• Chat — текстовый диалог\n` +
    `• Vision — генерация изображений (DALL-E 3)\n` +
    `• Sound — генерация музыки\n` +
    `• Reel — генерация видео\n` +
    `• Think — глубокий анализ (Claude Sonnet)\n\n` +
    `Открой мини-приложение для полного доступа 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().webApp('🤖 Открыть приложение', MINIAPP_URL),
    }
  );
});

// ─── /balance ──────────────────────────────────────────────────────────────────

bot.command('balance', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const response = await axios.get(`${API_URL}/api/users/telegram/${telegramId}/balance`);
    const { tokens, plan } = response.data as { tokens: number; plan: string };

    await ctx.reply(
      `💎 *Баланс токенов*\n\n` +
      `• Доступно: *${tokens.toLocaleString('ru')} токенов*\n` +
      `• Тариф: *${plan}*\n\n` +
      `Пополнить баланс можно в приложении 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .webApp('💎 Пополнить', MINIAPP_URL)
          .url('🌐 Биллинг', `${FRONTEND_URL}/billing`),
      }
    );
  } catch {
    await ctx.reply(
      `🔐 Для проверки баланса нужно войти в систему.\n\nОткрой приложение и войди через Telegram:`,
      {
        reply_markup: new InlineKeyboard().webApp('🤖 Войти', MINIAPP_URL),
      }
    );
  }
});

// ─── Text messages & documents: redirect to app ────────────────────────────────

bot.on(['message:text', 'message:document', 'message:photo', 'message:video', 'message:audio', 'message:voice'], async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('🤖 Открыть GhostLine', MINIAPP_URL);

  await ctx.reply(
    `👻 Для работы с файлами и чата с ИИ открой приложение:`,
    { reply_markup: keyboard }
  );
});

// ─── Start bot ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Bot] Starting GhostLine AI bot...');
  await bot.start({
    onStart: (info) => {
      console.log(`[Bot] Running as @${info.username}`);
    },
  });
}

main().catch((err) => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});
