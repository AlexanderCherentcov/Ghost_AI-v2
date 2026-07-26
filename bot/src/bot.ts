import { Bot, InlineKeyboard, Keyboard, webhookCallback, type Context } from 'grammy';
import axios from 'axios';
import { ensureSession, type Mode, type UserSession } from './lib/session.js';
import {
  listChats, createChat, deleteChat, getChatMessages,
  startVisionJob, startSoundJob, startReelJob, pollJob,
  getMe, createPlanPayment, createCasperPayment,
} from './lib/api-client.js';
import { streamChat, ChatStreamError } from './lib/chat-ws.js';
import { uploadTelegramImage, extractTelegramDocument } from './lib/telegram-files.js';
import { PLAN_KEYS } from './lib/plan-keys.js';
import { apiErrorMessage } from './lib/error-message.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

const API_URL      = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';
const MINIAPP_URL     = process.env.MINIAPP_URL ?? 'https://miniapp.ghostlineai.ru';
const BOT_USERNAME    = process.env.BOT_USERNAME ?? 'GhostSuperAI_bot';

// Список Telegram ID администраторов через запятую
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
);

const bot = new Bot(BOT_TOKEN);

// ─── HTTP-клиент для backend ────────────────────────────────────────────────
// proxy: false обязателен — HTTPS_PROXY/HTTP_PROXY в .env нужны для внешних
// API (OpenRouter и т.д.) с не-RU IP; внутренний Docker-хост backend:4000
// через этот внешний прокси недостижим, запросы будут падать.
// Та же правка уже сделана в admin-bot.ts и yokassa.ts по той же причине.
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'x-bot-secret': process.env.BOT_SECRET ?? '' },
  timeout: 15_000,
  proxy: false,
});

// ─── Rate-limit авторизации ─────────────────────────────────────────────────
const authRateLimit = new Map<number, number>(); // userId -> время последней попытки
const AUTH_RATE_LIMIT_MS = 10_000;

/** true — можно продолжать, false — рано, ещё не прошло 10с с прошлой попытки. */
function checkAuthRateLimit(userId: number): boolean {
  const now = Date.now();
  const lastAuth = authRateLimit.get(userId) ?? 0;
  if (now - lastAuth < AUTH_RATE_LIMIT_MS) return false;
  authRateLimit.set(userId, now);
  return true;
}

// ─── Хелпер меток тарифов ───────────────────────────────────────────────────

// Ключи планов должны совпадать с PLAN_KEYS из backend/src/config/plans.ts —
// TRIAL/STANDARD/TEAM были переименованы в апреле 2026 (миграция 20260429_caspers_system) и здесь мёртвые.
const PLAN_LABELS: Record<string, string> = {
  FREE:  '🆓 Бесплатный',
  BASIC: '⚡ Basic',
  PRO:   '🚀 Pro',
  VIP:   '👑 VIP',
  ULTRA: '💎 Ultra',
};

// Метки режимов — единственное место, где они заданы. "Про чат" — то же самое,
// что "Про чат" на сайте (глубокое рассуждение, тарификация chat_pro), не путать
// с выбором модели Стандарт/Про внутри обычного чата на сайте — это тот же биллинг.
const MODE_LABELS: Record<Mode, string> = {
  chat: '💬 Чат', think: '🧠 Про чат', vision: '🎨 Картинка', sound: '🎵 Музыка', reel: '🎬 Видео',
};

// ─── Постоянное нижнее меню ──────────────────────────────────────────────────
// Кнопки — обычный текст, а не команды: пользователю не нужно ничего запоминать,
// достаточно тапнуть. Перехватываются в обработчике 'message:text' до того,
// как текст уйдёт в AI как промпт.

const KB_CHATS   = '📂 Мои чаты';
const KB_PLANS   = '📦 Тарифы';
const KB_BALANCE = '👤 Баланс';
const KB_HELP    = '❓ Помощь';

const MAIN_KEYBOARD = new Keyboard()
  .text(MODE_LABELS.chat).text(MODE_LABELS.think).row()
  .text(MODE_LABELS.vision).text(MODE_LABELS.sound).text(MODE_LABELS.reel).row()
  .text(KB_CHATS).text(KB_PLANS).row()
  .text(KB_BALANCE).text(KB_HELP)
  .resized()
  .persistent()
  .placeholder('Напиши сообщение или выбери действие ниже');

// Обратная карта "текст кнопки" → режим, чтобы не дублировать строки из MODE_LABELS
const KB_MODE_MAP: Partial<Record<string, Mode>> = Object.fromEntries(
  (Object.keys(MODE_LABELS) as Mode[]).map((m) => [MODE_LABELS[m], m])
);

async function getUserPlan(tgId: number): Promise<{ plan: string; dbName: string | null }> {
  try {
    const res = await api.get('/bot/user-info', { params: { tgId: String(tgId) } });
    return { plan: res.data.plan ?? 'FREE', dbName: res.data.name ?? null };
  } catch {
    return { plan: 'FREE', dbName: null };
  }
}

// ─── Magic-link авторизация (общая для /start auth и опции "промокод/год" в /plans) ───
// Выпускает свежую пару access/refresh токенов и возвращает URL, который сразу
// логинит пользователя на нужной странице сайта. Обычная покупка тарифа/Caspers
// идёт напрямую через ЮKassa (см. buyCaspers/buy: callback) без захода на сайт —
// сюда бот приводит только за тем, чего нет в самом боте (промокод, оплата за год).

interface TgFrom {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

async function mintMagicLink(from: TgFrom, redirectPath: string): Promise<string | null> {
  if (!checkAuthRateLimit(from.id)) return null;

  const res = await api.post('/auth/telegram-bot', {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined,
  });

  const { accessToken, refreshToken } = res.data as { accessToken: string; refreshToken: string };
  return `${FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${encodeURIComponent(redirectPath)}`;
}

// ─── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const tgName = ctx.from?.first_name ?? 'пользователь';
  const payload = ctx.match; // текст после /start

  // ── Авторизация по ссылке из бота ────────────────────────────────────────
  if (payload === 'auth' && ctx.from) {
    try {
      // isNew определяет редирект, поэтому этот вызов идёт напрямую в /api/auth/telegram-bot,
      // а не через общий mintMagicLink — но сама проверка rate-limit общая (checkAuthRateLimit).
      if (!checkAuthRateLimit(ctx.from.id)) {
        await ctx.reply('⏳ Подождите немного перед повторным входом.');
        return;
      }

      const res = await api.post('/auth/telegram-bot', {
        id: ctx.from.id,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        photo_url: undefined,
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

  // ── Получаем тариф пользователя с бэкенда ─────────────────────────────────
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

  await ctx.reply('👇 Меню действий всегда под рукой снизу', { reply_markup: MAIN_KEYBOARD });
});

// ─── /help ─────────────────────────────────────────────────────────────────────

async function sendHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `👻 *GhostLine AI — Помощь*\n\n` +
    `*Нижнее меню* — самый быстрый способ: тапни режим или раздел, ничего вводить не нужно.\n\n` +
    `*Команды:*\n` +
    `/start — Главное меню\n` +
    `/help — Это сообщение\n` +
    `/newchat — новый чат (выбор режима)\n` +
    `/chats — список чатов, переключение, удаление\n` +
    `/mode — сменить режим текущего диалога\n` +
    `/balance — баланс Caspers и лимиты\n` +
    `/plans — тарифы, оплата сразу через ЮKassa\n` +
    `/caspers <количество> — докупить Caspers\n` +
    `/promo <код> — активировать промокод на Caspers\n\n` +
    `*Режимы работы:*\n` +
    `💬 Чат — текстовый диалог\n` +
    `🧠 Про чат — глубокое рассуждение\n` +
    `🎨 Картинка — генерация изображений\n` +
    `🎵 Музыка — генерация музыки\n` +
    `🎬 Видео — генерация видео\n\n` +
    `Просто пиши сообщения — отвечаю в выбранном режиме. Файлы и голосовые пока только в приложении 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().webApp('🤖 Открыть приложение', MINIAPP_URL),
    }
  );
}

bot.command('help', sendHelp);

// ─── /plans — тарифы, оплата сразу через ЮKassa ────────────────────────────────

async function sendPlans(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  try {
    const { data } = await api.get('/plans');
    const plans = data.plans as Array<{ key: string; price: number; caspers_monthly: number }>;
    const lines = plans.map((p) =>
      `${PLAN_LABELS[p.key] ?? p.key} — <b>${p.price.toLocaleString('ru')} ₽/мес</b> · ${p.caspers_monthly} Caspers/мес`
    ).join('\n');

    const kb = new InlineKeyboard();
    for (const p of plans) {
      kb.text(`💳 ${PLAN_LABELS[p.key] ?? p.key} — ${p.price.toLocaleString('ru')} ₽`, `buy:${p.key}`).row();
    }
    // Промокод и оплата за год доступны только на сайте — не дублируем логику билинга в боте
    const link = await mintMagicLink(ctx.from, '/billing');
    if (link) kb.url('⚙️ Промокод / оплата за год', link);

    await ctx.reply(
      `📦 <b>Тарифы GhostLine</b>\n\n${lines}\n\n` +
      `Выбери тариф — оплата сразу через ЮKassa, без входа на сайт:`,
      { parse_mode: 'HTML', reply_markup: kb },
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

bot.callbackQuery(/^buy:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Формирую ссылку на оплату...');
  if (!ctx.from) return;
  const plan = ctx.match[1];
  try {
    const session = await ensureSession(ctx.from);
    const paymentUrl = await createPlanPayment(session, plan, 'monthly');
    await ctx.reply(
      `💳 Оплата тарифа <b>${PLAN_LABELS[plan] ?? plan}</b> — жми кнопку, откроется ЮKassa:`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💳 Оплатить через ЮKassa', paymentUrl) },
    );
  } catch (err: any) {
    const msg = apiErrorMessage(err, 'Не удалось создать платёж. Попробуй позже.');
    await ctx.reply(`❌ ${msg}`);
  }
});

// ─── /caspers — докупить Caspers, оплата сразу через ЮKassa ────────────────────

const CASPER_PRESETS = [100, 300, 500, 1000];

async function sendCaspersMenu(ctx: Context): Promise<void> {
  const kb = new InlineKeyboard();
  CASPER_PRESETS.forEach((amount, i) => {
    kb.text(`${amount} Caspers`, `caspers:${amount}`);
    if (i % 2 === 1) kb.row();
  });
  await ctx.reply(
    '👻 Сколько Caspers докупить? (доступно с активной подпиской)\n\n' +
    'Своё количество — просто напиши: /caspers 250',
    { reply_markup: kb },
  );
}

bot.command('caspers', async (ctx) => {
  const argText = (ctx.match ?? '').trim();
  if (argText) {
    const amount = parseInt(argText, 10);
    if (!Number.isFinite(amount) || amount < 10 || amount > 1000) {
      await ctx.reply('❌ Количество Caspers — от 10 до 1000. Пример: /caspers 250');
      return;
    }
    await buyCaspers(ctx, amount);
    return;
  }
  await sendCaspersMenu(ctx);
});

bot.callbackQuery(/^caspers:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await buyCaspers(ctx, Number(ctx.match[1]));
});

async function buyCaspers(ctx: Context, amount: number): Promise<void> {
  if (!ctx.from) return;
  try {
    const session = await ensureSession(ctx.from);
    const paymentUrl = await createCasperPayment(session, amount);
    await ctx.reply(
      `💳 Докупка <b>${amount}</b> Caspers — жми кнопку, откроется ЮKassa:`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💳 Оплатить через ЮKassa', paymentUrl) },
    );
  } catch (err: any) {
    const msg = apiErrorMessage(err, 'Не удалось создать платёж. Попробуй позже.');
    await ctx.reply(`❌ ${msg}`);
  }
}

// ─── /balance — баланс Caspers и лимиты ────────────────────────────────────────

async function sendBalance(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  try {
    const session = await ensureSession(ctx.from);
    const me = await getMe(session);
    const isFree = me.plan === 'FREE';
    const planLabel = PLAN_LABELS[me.plan] ?? me.plan;

    let text =
      `👤 <b>Баланс</b>\n\n` +
      `📦 Тариф: <b>${planLabel}</b>\n` +
      `👻 Caspers: <b>${me.caspers_balance.toLocaleString('ru')}</b>` +
      (isFree ? '' : ` (+${me.caspers_monthly.toLocaleString('ru')}/мес)`) +
      `\n\n📊 <b>Сегодня:</b>\n💬 Сообщений: ${me.std_messages_today}\n🧠 Про чат: ${me.pro_messages_today}`;

    if (isFree) {
      text +=
        `\n\n📊 <b>На этой неделе:</b>\n🎨 Картинок: ${me.images_this_week}\n🎵 Треков: ${me.music_this_week}` +
        `\n\n📊 <b>В этом месяце:</b>\n🎬 Видео: ${me.videos_this_month}`;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('📦 Тарифы', 'show_plans').text('👻 Докупить Caspers', 'show_caspers'),
    });
  } catch {
    await ctx.reply('❌ Не удалось загрузить баланс. Попробуй /start');
  }
}

bot.command('balance', sendBalance);
bot.callbackQuery('show_caspers', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendCaspersMenu(ctx);
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
    const res = await api.post('/bot/promo/redeem', { tgId: String(ctx.from.id), code });
    await ctx.reply(`✅ Промокод активирован! +${res.data.casperAmount} Caspers 👻`);
  } catch (err: any) {
    const msg = apiErrorMessage(err, 'Не удалось активировать промокод');
    await ctx.reply(`❌ ${msg}`);
  }
});

// ─── AI-движок: режимы, чаты, стриминг текста, генерация медиа ────────────────

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

async function sendLongText(ctx: Context, text: string): Promise<void> {
  const trimmed = text.trim() || '(пустой ответ)';
  const CHUNK = 4000;
  for (let i = 0; i < trimmed.length; i += CHUNK) {
    await ctx.reply(trimmed.slice(i, i + CHUNK));
  }
}

/**
 * Редактирует сообщение-плейсхолдер; если правка не удалась по причине,
 * отличной от "message is not modified" (например, сообщение удалили или
 * временная ошибка API), отправляет текст новым сообщением — чтобы финальный
 * ответ никогда молча не пропадал.
 */
async function editOrSend(ctx: Context, messageId: number, text: string, extra?: object): Promise<void> {
  try {
    await ctx.api.editMessageText(ctx.chat!.id, messageId, text, extra);
  } catch (err: any) {
    if (err?.description?.includes?.('message is not modified')) return;
    await ctx.reply(text, extra).catch(() => {});
  }
}

// ─── /mode — смена режима без создания нового чата ─────────────────────────────

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

// ─── /newchat — создать чат и переключиться на него ────────────────────────────

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

// ─── /chats — список, переключение, удаление ────────────────────────────────────

async function sendChatList(ctx: Context): Promise<void> {
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

// ─── Стриминг текстового чата ───────────────────────────────────────────────

interface TextAttachment {
  imageUrl?: string;
  fileContent?: string;
  fileName?: string;
  fileLang?: string;
}

async function handleTextChat(ctx: Context, session: UserSession, prompt: string, attachment?: TextAttachment): Promise<void> {
  const placeholder = await ctx.reply('✍️ Печатаю...');
  let lastEdit = 0;
  const EDIT_INTERVAL_MS = 1200;
  const chatId = ctx.chat!.id;

  try {
    const result = await streamChat(
      session,
      { chatId: session.activeChatId!, mode: session.mode as 'chat' | 'think', prompt, history: session.history, ...attachment },
      (partial) => {
        const now = Date.now();
        if (now - lastEdit < EDIT_INTERVAL_MS) return;
        lastEdit = now;
        const preview = partial.length > 3900 ? partial.slice(0, 3900) + '…' : partial;
        ctx.api.editMessageText(chatId, placeholder.message_id, preview || '…').catch(() => {});
      },
    );

    if (result.content.length <= 4000) {
      await editOrSend(ctx, placeholder.message_id, result.content.trim() || '(пустой ответ)');
    } else {
      await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => {});
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

// ─── Генерация медиа (картинка / музыка / видео) ────────────────────────────

const GEN_ICON: Record<string, string> = { vision: '🎨', sound: '🎵', reel: '🎬' };
const GEN_LABEL: Record<string, string> = { vision: 'картинку', sound: 'музыку', reel: 'видео' };
const GEN_TIMEOUT_MS: Record<string, number> = { vision: 3 * 60_000, sound: 3 * 60_000, reel: 6 * 60_000 };

async function handleGeneration(ctx: Context, session: UserSession, prompt: string, sourceImageUrl?: string): Promise<void> {
  const mode = session.mode as 'vision' | 'sound' | 'reel';
  const placeholder = await ctx.reply(`${GEN_ICON[mode]} Генерирую ${GEN_LABEL[mode]}... обычно 30с–3мин`);

  try {
    const jobId = mode === 'vision' ? await startVisionJob(session, session.activeChatId!, prompt, sourceImageUrl)
      : mode === 'sound' ? await startSoundJob(session, session.activeChatId!, prompt)
      : await startReelJob(session, session.activeChatId!, prompt, sourceImageUrl);
    const result = await pollJob(session, jobId, { timeoutMs: GEN_TIMEOUT_MS[mode] });

    if (result.status !== 'done' || !result.mediaUrl) {
      await editOrSend(ctx, placeholder.message_id, `❌ ${result.error ?? 'Не удалось сгенерировать'}`);
      return;
    }

    await ctx.api.deleteMessage(ctx.chat!.id, placeholder.message_id).catch(() => {});
    const caption = prompt.slice(0, 1000);
    if (mode === 'vision') await ctx.replyWithPhoto(result.mediaUrl, { caption });
    else if (mode === 'sound') await ctx.replyWithAudio(result.mediaUrl, { caption });
    else await ctx.replyWithVideo(result.mediaUrl, { caption });
  } catch (err: any) {
    const msg = apiErrorMessage(err, 'Ошибка генерации');
    await editOrSend(ctx, placeholder.message_id, `❌ ${msg}`);
  }
}

// ─── Админ: /setplan ─────────────────────────────────────────────────────────
// Использование: /setplan <userId> <PLAN>
// Пример: /setplan abc123 PRO

bot.command('setplan', async (ctx) => {
  const userId = String(ctx.from?.id ?? '');
  if (!ADMIN_IDS.has(userId)) {
    await ctx.reply('⛔ Нет доступа.');
    return;
  }

  const [targetUserId, plan] = (ctx.match ?? '').trim().split(/\s+/);
  const validPlans: string[] = [...PLAN_KEYS];

  if (!targetUserId || !plan || !validPlans.includes(plan.toUpperCase())) {
    await ctx.reply(
      `❌ Использование: /setplan <userId> <plan>\nПланы: ${validPlans.join(', ')}`
    );
    return;
  }

  try {
    await api.post('/admin/setplan', { userId: targetUserId, plan: plan.toUpperCase() });
    await ctx.reply(`✅ Пользователь <code>${targetUserId}</code> → план <b>${plan.toUpperCase()}</b>`, {
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

// ─── Админ: /resetlimits ─────────────────────────────────────────────────────
// Использование: /resetlimits <userId>

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
    await api.post('/admin/resetlimits', { userId: targetUserId });
    await ctx.reply(`✅ Лимиты сброшены для <code>${targetUserId}</code>`, {
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

// ─── Общее: получить сессию с активным чатом, создав его при необходимости ────

async function sessionWithActiveChat(ctx: Context): Promise<UserSession | null> {
  if (!ctx.from) return null;
  let session: UserSession;
  try {
    session = await ensureSession(ctx.from);
  } catch {
    await ctx.reply('❌ Ошибка авторизации. Попробуй /start');
    return null;
  }
  if (!session.activeChatId) {
    try {
      const chat = await createChat(session, session.mode);
      session.activeChatId = chat.id;
    } catch {
      await ctx.reply('❌ Не удалось создать чат. Попробуй позже.');
      return null;
    }
  }
  return session;
}

// ─── Обычный текст: маршрутизация через активный режим ──────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;

  // Нераспознанная команда (например, опечатка) — не отправляем её в AI как промпт.
  if (text.startsWith('/')) {
    await ctx.reply('🤔 Неизвестная команда. Список команд — /help');
    return;
  }

  // Кнопки нижнего меню — переключение режима или раздел, а не промпт для AI.
  const kbMode = KB_MODE_MAP[text];
  if (kbMode) {
    if (!ctx.from) return;
    try {
      const session = await ensureSession(ctx.from);
      session.mode = kbMode;
      await ctx.reply(`✅ Режим: ${MODE_LABELS[kbMode]}\n\nПиши сообщение — отвечу в этом режиме.`);
    } catch {
      await ctx.reply('❌ Ошибка авторизации. Попробуй /start');
    }
    return;
  }
  if (text === KB_CHATS)   { await sendChatList(ctx); return; }
  if (text === KB_PLANS)   { await sendPlans(ctx);    return; }
  if (text === KB_BALANCE) { await sendBalance(ctx);  return; }
  if (text === KB_HELP)    { await sendHelp(ctx);     return; }

  const session = await sessionWithActiveChat(ctx);
  if (!session) return;

  if (session.mode === 'chat' || session.mode === 'think') {
    await handleTextChat(ctx, session, text);
  } else {
    await handleGeneration(ctx, session, text);
  }
});

// ─── Фото: мультимодальный вопрос (chat/think), исходник для правки (vision/reel) ────

bot.on('message:photo', async (ctx) => {
  const session = await sessionWithActiveChat(ctx);
  if (!session) return;

  if (session.mode === 'sound') {
    await ctx.reply('🎵 В режиме музыки фото не используется. Просто опиши, какой трек нужен.');
    return;
  }

  const notice = await ctx.reply('📎 Загружаю фото...');
  let imageUrl: string;
  try {
    const largest = ctx.message.photo[ctx.message.photo.length - 1];
    imageUrl = await uploadTelegramImage(session, largest.file_id);
  } catch {
    await editOrSend(ctx, notice.message_id, '❌ Не удалось загрузить фото. Попробуй ещё раз.');
    return;
  }
  await ctx.api.deleteMessage(ctx.chat.id, notice.message_id).catch(() => {});

  const caption = (ctx.message.caption ?? '').trim();

  if (session.mode === 'chat' || session.mode === 'think') {
    await handleTextChat(ctx, session, caption || 'Опиши что изображено на фото.', { imageUrl });
  } else {
    // vision → правим это изображение; reel → анимируем его (image-to-video)
    await handleGeneration(ctx, session, caption || (session.mode === 'reel' ? 'оживи это изображение' : 'обработай это изображение'), imageUrl);
  }
});

// ─── Документ: извлечь текст и использовать как контекст чата (только chat/think) ──────

bot.on('message:document', async (ctx) => {
  const session = await sessionWithActiveChat(ctx);
  if (!session) return;

  if (session.mode !== 'chat' && session.mode !== 'think') {
    await ctx.reply('📎 Файлы работают только в режиме Чат или Про чат. Переключись кнопкой в меню снизу или через /mode.');
    return;
  }

  const notice = await ctx.reply('📎 Читаю файл...');
  let doc: { text: string; fileName: string; lang: string };
  try {
    doc = await extractTelegramDocument(session, ctx.message.document.file_id);
  } catch (err: any) {
    const msg = apiErrorMessage(err, 'Не удалось прочитать файл');
    await editOrSend(ctx, notice.message_id, `❌ ${msg}`);
    return;
  }
  await ctx.api.deleteMessage(ctx.chat.id, notice.message_id).catch(() => {});

  const caption = (ctx.message.caption ?? '').trim();
  await handleTextChat(ctx, session, caption || 'Проанализируй содержимое прикреплённого файла.', {
    fileContent: doc.text,
    fileName: doc.fileName,
    fileLang: doc.lang,
  });
});

// Видеофайлы, голосовые и аудио пока не подключены к AI-движку бота
// (транскрипции и понимания видео здесь нет) — только мини-апп/сайт.
bot.on(['message:video', 'message:audio', 'message:voice'], async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('🤖 Открыть GhostLine', MINIAPP_URL);

  await ctx.reply(
    `👻 Видео, аудио и голосовые пока доступны в приложении:`,
    { reply_markup: keyboard }
  );
});

// ─── Запуск бота ──────────────────────────────────────────────────────────────────

bot.catch(async (err) => {
  if (err.message?.includes('query is too old') || err.message?.includes('query ID is invalid')) return;
  console.error('[Bot] Unhandled error:', err.message);
});

// Список команд в системном меню Telegram (кнопка "/" рядом с полем ввода) —
// без этого пользователь никак не узнает, какие команды вообще существуют.
async function registerCommands(): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'start',   description: 'Главное меню' },
    { command: 'help',    description: 'Список команд и режимов' },
    { command: 'newchat', description: 'Новый чат (выбор режима)' },
    { command: 'chats',   description: 'Мои чаты' },
    { command: 'mode',    description: 'Сменить режим текущего диалога' },
    { command: 'balance', description: 'Баланс Caspers и лимиты' },
    { command: 'plans',   description: 'Тарифы — оплата через ЮKassa' },
    { command: 'caspers', description: 'Докупить Caspers' },
    { command: 'promo',   description: 'Активировать промокод' },
  ]);
}

async function main() {
  console.log('[Bot] Starting GhostLine AI bot...');
  await registerCommands();
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
