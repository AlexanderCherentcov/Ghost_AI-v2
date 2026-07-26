import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import axios from 'axios';
import { ensureSession, type Mode, type UserSession } from './lib/session.js';
import {
  listChats, createChat, deleteChat, getChatMessages,
  startVisionJob, startSoundJob, startReelJob, pollJob,
} from './lib/api-client.js';
import { streamChat, ChatStreamError } from './lib/chat-ws.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

const API_URL      = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';
const MINIAPP_URL     = process.env.MINIAPP_URL ?? 'https://miniapp.ghostlineai.ru';
const BOT_USERNAME    = process.env.BOT_USERNAME ?? 'GhostSuperAI_bot';

// Comma-separated list of admin Telegram user IDs
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
);

const bot = new Bot(BOT_TOKEN);

// ─── Rate limit map for auth ───────────────────────────────────────────────────
const authRateLimit = new Map<number, number>(); // userId -> lastAuthTime

// ─── Plan label helper ─────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  FREE:     '🆓 Бесплатный',
  TRIAL:    '🔮 Пробный',
  BASIC:    '⚡ Basic',
  STANDARD: '🌟 Standard',
  PRO:      '🚀 Pro',
  ULTRA:    '💎 Ultra',
  TEAM:     '👥 Team',
};

async function getUserPlan(tgId: number): Promise<{ plan: string; dbName: string | null }> {
  try {
    const res = await axios.get(`${API_URL}/api/bot/user-info`, {
      params: { tgId: String(tgId) },
      headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' },
    });
    return { plan: res.data.plan ?? 'FREE', dbName: res.data.name ?? null };
  } catch {
    return { plan: 'FREE', dbName: null };
  }
}

// ─── Magic link auth (shared by /start auth, /plans, /caspers) ───────────────
// Mints a fresh access/refresh token pair and returns a URL that logs the user
// straight into the given page — payment is handled entirely on the website
// (existing YooKassa checkout), the bot just gets them there authenticated.

interface TgFrom {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

async function mintMagicLink(from: TgFrom, redirectPath: string): Promise<string | null> {
  const now = Date.now();
  const lastAuth = authRateLimit.get(from.id) ?? 0;
  if (now - lastAuth < 10_000) return null; // 10s flood protection, shared across all magic-link commands
  authRateLimit.set(from.id, now);

  const res = await axios.post(`${API_URL}/api/auth/telegram-bot`, {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined,
  }, {
    headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' },
  });

  const { accessToken, refreshToken } = res.data as { accessToken: string; refreshToken: string };
  return `${FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${encodeURIComponent(redirectPath)}`;
}

// ─── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const tgName = ctx.from?.first_name ?? 'пользователь';
  const payload = ctx.match; // text after /start

  // ── Auth via bot link ──────────────────────────────────────────────────────
  if (payload === 'auth' && ctx.from) {
    try {
      // isNew determines the redirect, so this one call still goes through
      // /api/auth/telegram-bot directly rather than the shared mintMagicLink helper.
      const now = Date.now();
      const lastAuth = authRateLimit.get(ctx.from.id) ?? 0;
      if (now - lastAuth < 10_000) {
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

  // ── Fetch user plan from backend ──────────────────────────────────────────
  const { plan, dbName } = ctx.from
    ? await getUserPlan(ctx.from.id)
    : { plan: 'FREE', dbName: null };

  const displayName = dbName ?? tgName;
  const planLabel   = PLAN_LABELS[plan] ?? plan;

  const keyboard = new InlineKeyboard()
    .text('💬 Начать чат', 'newchat_menu')
    .text('📂 Мои чаты', 'chats_menu')
    .row()
    .url('🌐 Открыть GhostLine', FRONTEND_URL)
    .text('📦 Тарифы', 'show_plans');

  await ctx.reply(
    `✨ *Твой личный ИИ\\-ассистент*\n\n` +
    `Привет, *${displayName}*\\!\n` +
    `Я готов к работе\\. Задавай вопросы, создавай изображения или генерируй видео в едином потоке\\.\n\n` +
    `📦 Тариф: *${planLabel}*`,
    {
      parse_mode: 'MarkdownV2',
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
    `/help — Это сообщение\n` +
    `/newchat — новый чат (выбор режима)\n` +
    `/chats — список чатов, переключение, удаление\n` +
    `/mode — сменить режим текущего диалога\n` +
    `/plans — тарифы и оплата\n` +
    `/caspers — докупить Caspers\n` +
    `/promo <код> — активировать промокод на Caspers\n\n` +
    `*Режимы работы:*\n` +
    `💬 Чат — текстовый диалог\n` +
    `🧠 Think — глубокий анализ\n` +
    `🎨 Картинка — генерация изображений\n` +
    `🎵 Музыка — генерация музыки\n` +
    `🎬 Видео — генерация видео\n\n` +
    `Просто пиши сообщения — отвечаю в выбранном режиме. Файлы и голосовые пока только в приложении 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().webApp('🤖 Открыть приложение', MINIAPP_URL),
    }
  );
});

// ─── /plans — тарифы, оплата на сайте ──────────────────────────────────────────

async function sendPlans(ctx: any): Promise<void> {
  if (!ctx.from) return;
  try {
    const { data } = await axios.get(`${API_URL}/api/plans`);
    const lines = data.plans.map((p: any) =>
      `${PLAN_LABELS[p.key] ?? p.key} — <b>${p.price.toLocaleString('ru')} ₽/мес</b> · ${p.caspers_monthly} Caspers/мес`
    ).join('\n');

    const link = await mintMagicLink(ctx.from, '/billing');
    if (!link) {
      await ctx.reply('⏳ Подождите немного перед повторным запросом.');
      return;
    }

    await ctx.reply(
      `📦 <b>Тарифы GhostLine</b>\n\n${lines}\n\n` +
      `Оплата и промокоды — на сайте, кнопка ниже уже войдёт в аккаунт:`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💳 Тарифы и оплата', link) },
    );
  } catch {
    await ctx.reply('❌ Не удалось загрузить тарифы. Попробуйте позже.');
  }
}

bot.command('plans', sendPlans);
bot.callbackQuery('show_plans', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendPlans(ctx);
});

// ─── /caspers — докупить Caspers, оплата на сайте ──────────────────────────────

bot.command('caspers', async (ctx) => {
  if (!ctx.from) return;
  const link = await mintMagicLink(ctx.from, '/billing');
  if (!link) {
    await ctx.reply('⏳ Подождите немного перед повторным запросом.');
    return;
  }
  await ctx.reply(
    `👻 Докупить Caspers можно на сайте (доступно с активной подпиской):`,
    { reply_markup: new InlineKeyboard().url('👻 Докупить Caspers', link) },
  );
});

// ─── /promo ────────────────────────────────────────────────────────────────────
// Активация промокода на Caspers. Скидочные промокоды на тарифы вводятся на сайте
// при оформлении подписки (billing page).

bot.command('promo', async (ctx) => {
  const code = (ctx.match ?? '').trim();
  if (!ctx.from) return;
  if (!code) {
    await ctx.reply('🎟 Использование: /promo <код>');
    return;
  }

  try {
    const res = await axios.post(
      `${API_URL}/api/bot/promo/redeem`,
      { tgId: String(ctx.from.id), code },
      { headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' } },
    );
    await ctx.reply(`✅ Промокод активирован! +${res.data.casperAmount} Caspers 👻`);
  } catch (err: any) {
    const msg = err.response?.data?.error ?? 'Не удалось активировать промокод';
    await ctx.reply(`❌ ${msg}`);
  }
});

// ─── AI engine: modes, chats, text streaming, media generation ────────────────

const MODE_LABELS: Record<Mode, string> = {
  chat: '💬 Чат', think: '🧠 Think', vision: '🎨 Картинка', sound: '🎵 Музыка', reel: '🎬 Видео',
};
const CHAT_MODE_ICON: Record<string, string> = {
  chat: '💬', vision: '🎨', sound: '🎵', reel: '🎬',
};

function modeKb(prefix: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(MODE_LABELS) as Mode[]).forEach((m, i) => {
    kb.text(MODE_LABELS[m], `${prefix}:${m}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

async function sendLongText(ctx: any, text: string): Promise<void> {
  const trimmed = text.trim() || '(пустой ответ)';
  const CHUNK = 4000;
  for (let i = 0; i < trimmed.length; i += CHUNK) {
    await ctx.reply(trimmed.slice(i, i + CHUNK));
  }
}

/**
 * Edits a placeholder message; if the edit fails for any reason other than
 * "message not modified" (e.g. the message was deleted, or a transient API
 * error), falls back to sending the text as a new message so the final
 * answer never silently disappears.
 */
async function editOrSend(ctx: any, messageId: number, text: string, extra?: object): Promise<void> {
  try {
    await ctx.api.editMessageText(ctx.chat.id, messageId, text, extra);
  } catch (err: any) {
    if (err?.description?.includes?.('message is not modified')) return;
    await ctx.reply(text, extra).catch(() => {});
  }
}

// ─── /mode — switch mode without starting a new chat ──────────────────────────

bot.command('mode', async (ctx) => {
  await ctx.reply('Выбери режим для следующих сообщений:', { reply_markup: modeKb('mode') });
});

bot.callbackQuery(/^mode:(chat|think|vision|sound|reel)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  try {
    const session = await ensureSession(ctx.from);
    session.mode = ctx.match[1] as Mode;
    await ctx.editMessageText(`✅ Режим: ${MODE_LABELS[session.mode]}\n\nПиши сообщение — отвечу в этом режиме.`);
  } catch {
    await ctx.reply('❌ Ошибка авторизации. Попробуй /start');
  }
});

// ─── /newchat — create a chat and switch to it ────────────────────────────────

bot.command('newchat', async (ctx) => {
  await ctx.reply('Новый чат в каком режиме?', { reply_markup: modeKb('newchat') });
});

bot.callbackQuery(/^newchat:(chat|think|vision|sound|reel)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const mode = ctx.match[1] as Mode;
  try {
    const session = await ensureSession(ctx.from);
    const chat = await createChat(session, mode);
    session.activeChatId = chat.id;
    session.mode = mode;
    session.history = [];
    await ctx.editMessageText(`✅ Новый чат создан (${MODE_LABELS[mode]}). Пиши сообщение!`);
  } catch {
    await ctx.reply('❌ Не удалось создать чат. Попробуй позже.');
  }
});

// ─── /chats — list, switch, delete ─────────────────────────────────────────────

async function sendChatList(ctx: any): Promise<void> {
  if (!ctx.from) return;
  try {
    const session = await ensureSession(ctx.from);
    const chats = await listChats(session);
    if (chats.length === 0) {
      await ctx.reply('У тебя пока нет чатов.', { reply_markup: new InlineKeyboard().text('➕ Новый чат', 'newchat_menu') });
      return;
    }
    const kb = new InlineKeyboard();
    for (const c of chats.slice(0, 15)) {
      const icon = CHAT_MODE_ICON[c.mode] ?? '💬';
      const activeMark = c.id === session.activeChatId ? '• ' : '';
      kb.text(`${activeMark}${icon} ${c.title.slice(0, 28)}`, `sw:${c.id}`).text('🗑', `delchat:${c.id}`).row();
    }
    kb.text('➕ Новый чат', 'newchat_menu');
    await ctx.reply('📂 Твои чаты:', { reply_markup: kb });
  } catch {
    await ctx.reply('❌ Не удалось загрузить чаты. Попробуй /start');
  }
}

bot.command('chats', sendChatList);
bot.callbackQuery('chats_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendChatList(ctx);
});

bot.callbackQuery('newchat_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('Новый чат в каком режиме?', { reply_markup: modeKb('newchat') });
});

bot.callbackQuery(/^sw:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Переключаю...');
  if (!ctx.from) return;
  const chatId = ctx.match[1];
  try {
    const session = await ensureSession(ctx.from);
    const messages = await getChatMessages(session, chatId, 20);
    session.activeChatId = chatId;
    session.history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-20);
    await ctx.reply(`✅ Переключился на чат. Пиши сообщение!`);
  } catch {
    await ctx.reply('❌ Не удалось переключиться. Попробуй позже.');
  }
});

bot.callbackQuery(/^delchat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.match[1];
  await ctx.editMessageText('⚠️ Удалить этот чат безвозвратно?', {
    reply_markup: new InlineKeyboard().text('✅ Да, удалить', `delchat_yes:${chatId}`).text('❌ Отмена', 'chats_back'),
  });
});

bot.callbackQuery('chats_back', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await sendChatList(ctx);
});

bot.callbackQuery(/^delchat_yes:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Удаляю...');
  if (!ctx.from) return;
  const chatId = ctx.match[1];
  try {
    const session = await ensureSession(ctx.from);
    await deleteChat(session, chatId);
    if (session.activeChatId === chatId) {
      session.activeChatId = null;
      session.history = [];
    }
    await ctx.editMessageText('🗑 Чат удалён.');
  } catch {
    await ctx.reply('❌ Не удалось удалить чат.');
  }
});

// ─── Text chat streaming ────────────────────────────────────────────────────

async function handleTextChat(ctx: any, session: UserSession, prompt: string): Promise<void> {
  const placeholder = await ctx.reply('✍️ Печатаю...');
  let lastEdit = 0;
  const EDIT_INTERVAL_MS = 1200;

  try {
    const result = await streamChat(
      session,
      { chatId: session.activeChatId!, mode: session.mode as 'chat' | 'think', prompt, history: session.history },
      (partial) => {
        const now = Date.now();
        if (now - lastEdit < EDIT_INTERVAL_MS) return;
        lastEdit = now;
        const preview = partial.length > 3900 ? partial.slice(0, 3900) + '…' : partial;
        ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, preview || '…').catch(() => {});
      },
    );

    if (result.content.length <= 4000) {
      await editOrSend(ctx, placeholder.message_id, result.content.trim() || '(пустой ответ)');
    } else {
      await ctx.api.deleteMessage(ctx.chat.id, placeholder.message_id).catch(() => {});
      await sendLongText(ctx, result.content);
    }

    session.history.push({ role: 'user', content: prompt });
    session.history.push({ role: 'assistant', content: result.content });
    if (session.history.length > 20) session.history = session.history.slice(-20);
  } catch (err: any) {
    const msg = err instanceof ChatStreamError ? err.message : (err.message ?? 'Ошибка чата');
    await editOrSend(ctx, placeholder.message_id, `❌ ${msg}`);
  }
}

// ─── Media generation (image / music / video) ──────────────────────────────

const GEN_ICON: Record<string, string> = { vision: '🎨', sound: '🎵', reel: '🎬' };
const GEN_LABEL: Record<string, string> = { vision: 'картинку', sound: 'музыку', reel: 'видео' };
const GEN_TIMEOUT_MS: Record<string, number> = { vision: 3 * 60_000, sound: 3 * 60_000, reel: 6 * 60_000 };

async function handleGeneration(ctx: any, session: UserSession, prompt: string): Promise<void> {
  const mode = session.mode as 'vision' | 'sound' | 'reel';
  const placeholder = await ctx.reply(`${GEN_ICON[mode]} Генерирую ${GEN_LABEL[mode]}... обычно 30с–3мин`);

  try {
    const start = mode === 'vision' ? startVisionJob : mode === 'sound' ? startSoundJob : startReelJob;
    const jobId = await start(session, session.activeChatId!, prompt);
    const result = await pollJob(session, jobId, { timeoutMs: GEN_TIMEOUT_MS[mode] });

    if (result.status !== 'done' || !result.mediaUrl) {
      await editOrSend(ctx, placeholder.message_id, `❌ ${result.error ?? 'Не удалось сгенерировать'}`);
      return;
    }

    await ctx.api.deleteMessage(ctx.chat.id, placeholder.message_id).catch(() => {});
    const caption = prompt.slice(0, 1000);
    if (mode === 'vision') await ctx.replyWithPhoto(result.mediaUrl, { caption });
    else if (mode === 'sound') await ctx.replyWithAudio(result.mediaUrl, { caption });
    else await ctx.replyWithVideo(result.mediaUrl, { caption });
  } catch (err: any) {
    const msg = err.response?.data?.error ?? err.message ?? 'Ошибка генерации';
    await editOrSend(ctx, placeholder.message_id, `❌ ${msg}`);
  }
}

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

// ─── Plain text: route through the active mode ─────────────────────────────
// Files/photos/voice still point to the miniapp — attachments aren't wired
// into the bot's AI engine yet.

bot.on('message:text', async (ctx) => {
  if (!ctx.from) return;
  const text = ctx.message.text.trim();
  if (!text) return;

  // Unrecognized slash command (e.g. a typo) — don't forward it to the AI as a prompt.
  if (text.startsWith('/')) {
    await ctx.reply('🤔 Неизвестная команда. Список команд — /help');
    return;
  }

  let session: UserSession;
  try {
    session = await ensureSession(ctx.from);
  } catch {
    await ctx.reply('❌ Ошибка авторизации. Попробуй /start');
    return;
  }

  if (!session.activeChatId) {
    try {
      const chat = await createChat(session, session.mode);
      session.activeChatId = chat.id;
    } catch {
      await ctx.reply('❌ Не удалось создать чат. Попробуй позже.');
      return;
    }
  }

  if (session.mode === 'chat' || session.mode === 'think') {
    await handleTextChat(ctx, session, text);
  } else {
    await handleGeneration(ctx, session, text);
  }
});

bot.on(['message:document', 'message:photo', 'message:video', 'message:audio', 'message:voice'], async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('🤖 Открыть GhostLine', MINIAPP_URL);

  await ctx.reply(
    `👻 Файлы и голосовые пока доступны в приложении:`,
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
