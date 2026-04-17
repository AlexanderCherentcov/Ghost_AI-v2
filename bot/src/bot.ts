import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

const API_URL      = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';
const MINIAPP_URL  = process.env.MINIAPP_URL ?? 'https://miniapp.ghostlineai.ru';

// Comma-separated list of admin Telegram user IDs
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
);

const bot = new Bot(BOT_TOKEN);

// ─── Rate limit map for auth ───────────────────────────────────────────────────
const authRateLimit = new Map<number, number>(); // userId -> lastAuthTime

// ─── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name ?? 'пользователь';
  const payload = ctx.match; // text after /start

  // ── Auth via bot link ──────────────────────────────────────────────────────
  if (payload === 'auth' && ctx.from) {
    try {
      // [L-09] Flood protection
      const now = Date.now();
      const lastAuth = authRateLimit.get(ctx.from.id) ?? 0;
      if (now - lastAuth < 10_000) { // 10 секунд между запросами
        await ctx.reply('⏳ Подождите немного перед повторным входом.');
        return;
      }
      authRateLimit.set(ctx.from.id, now);

      const res = await axios.post(`${API_URL}/api/auth/telegram-bot`, {
        id: ctx.from.id,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        photo_url: undefined,
      }, {
        headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' },
      });

      const { accessToken, refreshToken, isNew } = res.data as {
        accessToken: string;
        refreshToken: string;
        isNew: boolean;
      };

      const redirect = isNew ? '/onboarding/name' : '/chat';
      const loginUrl = `${FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${redirect}`;

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
    `/help — Это сообщение\n\n` +
    `*Режимы работы:*\n` +
    `• Chat — текстовый диалог\n` +
    `• Vision — генерация изображений\n` +
    `• Sound — генерация музыки\n` +
    `• Reel — генерация видео\n` +
    `• Think — глубокий анализ\n\n` +
    `Открой мини-приложение для полного доступа 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().webApp('🤖 Открыть приложение', MINIAPP_URL),
    }
  );
});

// ─── Admin: /setplan ───────────────────────────────────────────────────────────
// Usage: /setplan <userId> <PLAN>
// Example: /setplan abc123 PRO

bot.command('setplan', async (ctx) => {
  const userId = String(ctx.from?.id ?? '');
  if (!ADMIN_IDS.has(userId)) {
    await ctx.reply('⛔ Нет доступа.');
    return;
  }

  const [targetUserId, plan] = (ctx.match ?? '').trim().split(/\s+/);
  const validPlans = ['FREE', 'BASIC', 'STANDARD', 'PRO', 'ULTRA'];

  if (!targetUserId || !plan || !validPlans.includes(plan.toUpperCase())) {
    await ctx.reply(
      `❌ Использование: /setplan <userId> <plan>\nПланы: ${validPlans.join(', ')}`
    );
    return;
  }

  try {
    await axios.post(
      `${API_URL}/api/admin/setplan`,
      { userId: targetUserId, plan: plan.toUpperCase() },
      { headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' } }
    );
    await ctx.reply(`✅ Пользователь <code>${targetUserId}</code> → план <b>${plan.toUpperCase()}</b>`, {
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${err.response?.data?.error ?? err.message}`);
  }
});

// ─── Admin: /resetlimits ───────────────────────────────────────────────────────
// Usage: /resetlimits <userId>

bot.command('resetlimits', async (ctx) => {
  const userId = String(ctx.from?.id ?? '');
  if (!ADMIN_IDS.has(userId)) {
    await ctx.reply('⛔ Нет доступа.');
    return;
  }

  const targetUserId = (ctx.match ?? '').trim();
  if (!targetUserId) {
    await ctx.reply('❌ Использование: /resetlimits <userId>');
    return;
  }

  try {
    await axios.post(
      `${API_URL}/api/admin/resetlimits`,
      { userId: targetUserId },
      { headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' } }
    );
    await ctx.reply(`✅ Лимиты сброшены для <code>${targetUserId}</code>`, {
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${err.response?.data?.error ?? err.message}`);
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

bot.catch(async (err) => {
  if (err.message?.includes('query is too old') || err.message?.includes('query ID is invalid')) return;
  console.error('[Bot] Unhandled error:', err.message);
});

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
