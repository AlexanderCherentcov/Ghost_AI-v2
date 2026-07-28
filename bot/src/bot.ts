import { Bot, InlineKeyboard, Keyboard, webhookCallback, type Context } from 'grammy';
import axios from 'axios';
import {
  ensureSession, type Mode, type UserSession,
  type VideoModel, type VideoOptions, type MusicOptions,
  DEFAULT_VIDEO_OPTIONS, DEFAULT_MUSIC_OPTIONS,
} from './lib/session.js';
import {
  listChats, createChat, deleteChat, getChatMessages,
  startVisionJob, startSoundJob, startReelJob, pollJob, generateLyrics,
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

async function getUserPlan(tgId: number): Promise<{ plan: string; dbName: string | null; caspers: number }> {
  try {
    const res = await api.get('/bot/user-info', { params: { tgId: String(tgId) } });
    return { plan: res.data.plan ?? 'FREE', dbName: res.data.name ?? null, caspers: res.data.caspers_balance ?? 0 };
  } catch {
    return { plan: 'FREE', dbName: null, caspers: 0 };
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

  // ── Получаем тариф и баланс пользователя с бэкенда ────────────────────────
  const { plan, dbName, caspers } = ctx.from
    ? await getUserPlan(ctx.from.id)
    : { plan: 'FREE', dbName: null, caspers: 0 };

  const displayName = dbName ?? tgName;
  const planLabel   = PLAN_LABELS[plan] ?? plan;

  const keyboard = new InlineKeyboard()
    .text('💬 Начать чат', 'newchat_menu')
    .text('📂 Мои чаты', 'chats_menu')
    .row()
    .url('🌐 Сайт', FRONTEND_URL)
    .text('📦 Тарифы', 'show_plans');

  await ctx.reply(
    `✨ *Твой личный ИИ\\-ассистент*\n\n` +
    `Привет, *${displayName}*\\!\n` +
    `Я готов к работе\\. Задавай вопросы, создавай изображения или генерируй видео в едином потоке\\.\n\n` +
    `📦 Тариф: *${planLabel}*\n` +
    `👻 Caspers: *${caspers}*`,
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
    `/settings — настройки видео (модель, разрешение, длительность...) или музыки (название, стиль, вокал/инструментал)\n` +
    `/balance — баланс Caspers, лимиты и цены на все операции\n` +
    `/plans — тарифы, оплата сразу через ЮKassa\n` +
    `/caspers <количество> — докупить Caspers\n` +
    `/promo <код> — активировать промокод на Caspers\n\n` +
    `*Режимы работы:*\n` +
    `💬 Чат — текстовый диалог\n` +
    `🧠 Про чат — глубокое рассуждение\n` +
    `🎨 Картинка — генерация изображений\n` +
    `🎵 Музыка — генерация музыки\n` +
    `🎬 Видео — генерация видео\n\n` +
    `После каждого сообщения и генерации показываю остаток Caspers.\n\n` +
    `Просто пиши сообщения — отвечаю в выбранном режиме. Фото и документы понимаю, а вот видео и голосовые пока нет.`,
    { parse_mode: 'Markdown' }
  );
}

bot.command('help', sendHelp);

// ─── /plans — тарифы, оплата сразу через ЮKassa ────────────────────────────────

async function sendPlans(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  try {
    const { data } = await api.get('/plans');
    const plans = data.plans as Array<{ key: string; price: number; caspers_monthly: number; features: string[] }>;
    const lines = plans.map((p) => {
      const featureLines = p.features.map((f) => `   • ${f}`).join('\n');
      return `${PLAN_LABELS[p.key] ?? p.key} — <b>${p.price.toLocaleString('ru')} ₽/мес</b> · ${p.caspers_monthly} Caspers/мес\n${featureLines}`;
    }).join('\n\n');

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

/** Сколько что стоит в Caspers — с бэкенда (GET /plans → casper_costs), не зашито в коде. */
async function casperPriceList(): Promise<string> {
  try {
    const { data } = await api.get('/plans');
    const c = data.casper_costs ?? {};
    return (
      `\n\n💰 <b>Цены в Caspers:</b>\n` +
      `🧠 Про чат — ${c.chat_pro} / сообщ.\n` +
      `🎨 Картинка — ${c.image_generate} / шт\n` +
      `🎵 Музыка — ${c.music_generate} / трек\n` +
      `🎬 Видео — ${c.video_std_4s}–${c.video_pro_8s} (зависит от модели и длительности)`
    );
  } catch {
    return '';
  }
}

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

    text += await casperPriceList();

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

// ─── Остаток Caspers после каждого обращения (чат, картинка, музыка, видео) ────
// Явного "сколько списано" бэкенд не отдаёт ни в WS-ответе чата (tokensCost
// там всегда 0 — не используется), ни в статусе задачи генерации — поэтому
// сравниваем баланс до/после самой операции, а не пытаемся угадать стоимость.

async function getCasperBalance(session: UserSession): Promise<number | null> {
  return getMe(session).then((m) => m.caspers_balance).catch(() => null);
}

/** Показывается после ЛЮБОГО обращения — со списанием (если оно было) или без. */
async function casperSpendNote(session: UserSession, before: number | null): Promise<string> {
  if (before === null) return '';
  const after = await getCasperBalance(session);
  if (after === null) return '';
  const spent = before - after;
  return spent > 0
    ? `👻 Списано: ${spent} · Остаток: ${after} Caspers`
    : `👻 Остаток: ${after} Caspers`;
}

// ─── Настройки видео/музыки — паритет с VideoSettingsMenu/MusicWidget на сайте ──
// Опции живут в сессии (session.videoOptions/musicOptions) и применяются к
// следующей генерации, пока пользователь их не поменяет — как state виджета на сайте.

const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  motion:  '⚡ Motion (Veo 3.1 Fast)',
  cinema:  '🎬 Cinema (Veo 3.1 Pro)',
  reality: '🎥 Reality (Kling V-2.5)',
};

/** Та же формула, что backend/src/services/tokens.ts:resolveVideoRequestType — только cinema тарифицируется как pro. */
function videoCasperCost(costs: Record<string, number>, o: VideoOptions): number {
  const isPro = o.videoModel === 'cinema';
  if (isPro) return o.duration === '4s' ? costs.video_pro_4s : costs.video_pro_8s;
  return o.duration === '4s' ? costs.video_std_4s : costs.video_std_8s;
}

async function fetchCasperCosts(): Promise<Record<string, number>> {
  try {
    const { data } = await api.get('/plans');
    return data.casper_costs ?? {};
  } catch {
    return {};
  }
}

/**
 * Правит сообщение-меню настроек; если правка не удалась из-за "message is not
 * modified" (повторный тап по уже выбранной опции) — тихо игнорирует, а не шлёт
 * дубликат меню новым сообщением. Та же логика, что у editOrSend выше.
 */
async function editMessageOrIgnore(ctx: Context, text: string, extra: object): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err: any) {
    if (err?.description?.includes?.('message is not modified')) return;
    await ctx.reply(text, extra).catch(() => {});
  }
}

/** Показывает кнопку настроек под подтверждением смены режима — только для reel/sound. */
function modeSwitchKb(mode: Mode): InlineKeyboard | undefined {
  if (mode === 'reel')  return new InlineKeyboard().text('⚙️ Настройки видео', 'vs:open');
  if (mode === 'sound') return new InlineKeyboard().text('⚙️ Настройки музыки', 'ms:open');
  return undefined;
}

async function sendVideoSettings(ctx: Context, session: UserSession, edit: boolean): Promise<void> {
  const o = session.videoOptions;
  const costs = await fetchCasperCosts();
  const cost = videoCasperCost(costs, o);

  const kb = new InlineKeyboard();
  (['motion', 'cinema', 'reality'] as VideoModel[]).forEach((m) => {
    kb.text(`${o.videoModel === m ? '✅ ' : ''}${VIDEO_MODEL_LABELS[m]}`, `vs:model:${m}`).row();
  });
  kb.text(`${o.resolution === '720p' ? '✅ ' : ''}720p`, 'vs:res:720p')
    .text(`${o.resolution === '1080p' ? '✅ ' : ''}1080p`, 'vs:res:1080p').row();
  kb.text(`${o.duration === '4s' ? '✅ ' : ''}4с`, 'vs:dur:4s')
    .text(`${o.duration === '8s' ? '✅ ' : ''}8с`, 'vs:dur:8s').row();
  kb.text(`${o.aspectRatio === '16:9' ? '✅ ' : ''}16:9`, 'vs:ar:16:9')
    .text(`${o.aspectRatio === '9:16' ? '✅ ' : ''}9:16`, 'vs:ar:9:16').row();
  kb.text(o.enableAudio ? '🔊 Звук: вкл' : '🔇 Звук: выкл', 'vs:audio:toggle').row();
  kb.text(o.negativePrompt ? '✏️ Исключить: изменить' : '✏️ Исключить из видео...', 'vs:negprompt');
  if (o.negativePrompt) kb.text('🗑 Очистить', 'vs:negprompt:clear');
  kb.row().text('↩️ Сбросить всё', 'vs:reset').text('✅ Готово', 'vs:close');

  const text =
    `🎬 <b>Настройки видео</b>\n\n` +
    `Модель: <b>${VIDEO_MODEL_LABELS[o.videoModel]}</b>\n` +
    `Разрешение: <b>${o.resolution}</b> · Длительность: <b>${o.duration}</b>\n` +
    `Формат: <b>${o.aspectRatio}</b> · Звук: <b>${o.enableAudio ? 'вкл' : 'выкл'}</b>\n` +
    (o.negativePrompt ? `Исключить: <i>${o.negativePrompt.slice(0, 200)}</i>\n` : '') +
    `\n💰 Стоимость следующей генерации: <b>${cost || '?'}</b> Caspers\n\n` +
    `На FREE-тарифе видео всегда идёт через Kling, независимо от выбора модели.`;

  const extra = { parse_mode: 'HTML' as const, reply_markup: kb };
  if (edit) await editMessageOrIgnore(ctx, text, extra);
  else await ctx.reply(text, extra);
}

function musicSettingsKb(o: MusicOptions): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(o.instrumental ? '🎹 Инструментал (переключить)' : '🎤 С вокалом (переключить)', 'ms:instrumental:toggle').row();
  kb.text(o.title ? '✏️ Название: изменить' : '✏️ Название...', 'ms:title');
  kb.text(o.style ? '✏️ Стиль: изменить' : '✏️ Стиль/жанр...', 'ms:style').row();
  if (!o.instrumental) {
    kb.text(o.lyrics ? '✏️ Текст песни: изменить' : '✏️ Текст песни...', 'ms:lyrics').row();
    kb.text('✨ Сгенерировать текст по названию/стилю', 'ms:lyrics:gen').row();
  }
  kb.text('↩️ Сбросить всё', 'ms:reset').text('✅ Готово', 'ms:close');
  return kb;
}

async function sendMusicSettings(ctx: Context, session: UserSession, edit: boolean): Promise<void> {
  const o = session.musicOptions;
  const costs = await fetchCasperCosts();

  const text =
    `🎵 <b>Настройки музыки</b>\n\n` +
    `Режим: <b>${o.instrumental ? 'Инструментал' : 'С вокалом'}</b>\n` +
    `Название: <b>${o.title || '—'}</b>\n` +
    `Стиль/жанр: <b>${o.style || '—'}</b>\n` +
    (!o.instrumental ? `Текст песни: <b>${o.lyrics ? `задан (${o.lyrics.length} симв.)` : '—'}</b>\n` : '') +
    `\n💰 Стоимость следующей генерации: <b>${costs.music_generate ?? '?'}</b> Caspers\n\n` +
    `Всё необязательно — можно просто написать сообщение с описанием трека.`;

  const extra = { parse_mode: 'HTML' as const, reply_markup: musicSettingsKb(o) };
  if (edit) await editMessageOrIgnore(ctx, text, extra);
  else await ctx.reply(text, extra);
}

bot.command('settings', async (ctx) => {
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  if (session.mode === 'reel')  { await sendVideoSettings(ctx, session, false); return; }
  if (session.mode === 'sound') { await sendMusicSettings(ctx, session, false); return; }
  await ctx.reply('⚙️ Настройки есть только для режимов 🎬 Видео и 🎵 Музыка. Переключись через /mode.');
});

bot.callbackQuery('vs:open', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  await sendVideoSettings(ctx, await ensureSession(ctx.from), true);
});

bot.callbackQuery(/^vs:model:(motion|cinema|reality)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.videoModel = ctx.match[1] as VideoModel;
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery(/^vs:res:(720p|1080p)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.resolution = ctx.match[1] as '720p' | '1080p';
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery(/^vs:dur:(4s|8s)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.duration = ctx.match[1] as '4s' | '8s';
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery(/^vs:ar:(16:9|9:16)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.aspectRatio = ctx.match[1] as '16:9' | '9:16';
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery('vs:audio:toggle', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.enableAudio = !session.videoOptions.enableAudio;
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery('vs:negprompt', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.awaitingInput = 'video_negative_prompt';
  await ctx.reply('✏️ Напиши текстом, что исключить из видео (например: «размытость, водяной знак»).\n/cancel — отменить.');
});

bot.callbackQuery('vs:negprompt:clear', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions.negativePrompt = '';
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery('vs:reset', async (ctx) => {
  await ctx.answerCallbackQuery('Сброшено');
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.videoOptions = { ...DEFAULT_VIDEO_OPTIONS };
  await sendVideoSettings(ctx, session, true);
});

bot.callbackQuery('vs:close', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery('ms:open', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  await sendMusicSettings(ctx, await ensureSession(ctx.from), true);
});

bot.callbackQuery('ms:instrumental:toggle', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  const wasInstrumental = session.musicOptions.instrumental;
  session.musicOptions.instrumental = !wasInstrumental;
  // Как на сайте: текст песни сохраняется только при переходе инструментал→вокал.
  if (!wasInstrumental) session.musicOptions.lyrics = '';
  await sendMusicSettings(ctx, session, true);
});

bot.callbackQuery('ms:title', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.awaitingInput = 'music_title';
  await ctx.reply('✏️ Напиши название трека.\n/cancel — отменить.');
});

bot.callbackQuery('ms:style', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.awaitingInput = 'music_style';
  await ctx.reply('✏️ Напиши стиль/жанр, например: «lo-fi, грустный».\n/cancel — отменить.');
});

bot.callbackQuery('ms:lyrics', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.awaitingInput = 'music_lyrics';
  await ctx.reply('✏️ Напиши текст песни.\n/cancel — отменить.');
});

bot.callbackQuery('ms:lyrics:gen', async (ctx) => {
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  const topic = session.musicOptions.title || session.musicOptions.style;
  if (!topic) {
    await ctx.answerCallbackQuery({ text: 'Сначала укажи название или стиль', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery('Генерирую текст...');
  try {
    const lyrics = await generateLyrics(session, topic, session.musicOptions.style, session.musicOptions.instrumental);
    session.musicOptions.lyrics = lyrics;
    await sendMusicSettings(ctx, session, true);
  } catch {
    await ctx.reply('❌ Не удалось сгенерировать текст. Попробуй позже.');
  }
});

bot.callbackQuery('ms:reset', async (ctx) => {
  await ctx.answerCallbackQuery('Сброшено');
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  session.musicOptions = { ...DEFAULT_MUSIC_OPTIONS };
  await sendMusicSettings(ctx, session, true);
});

bot.callbackQuery('ms:close', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

bot.command('cancel', async (ctx) => {
  if (!ctx.from) return;
  const session = await ensureSession(ctx.from);
  if (session.awaitingInput) {
    session.awaitingInput = null;
    await ctx.reply('❌ Отменено.');
  } else {
    await ctx.reply('Нечего отменять.');
  }
});

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
    await ctx.editMessageText(`✅ Режим: ${MODE_LABELS[session.mode]}\n\nПиши сообщение — отвечу в этом режиме.`, { reply_markup: modeSwitchKb(session.mode) });
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
    await ctx.editMessageText(`✅ Новый чат создан (${MODE_LABELS[mode]}). Пиши сообщение!`, { reply_markup: modeSwitchKb(mode) });
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

  // Остаток Caspers показываем после любого сообщения — и обычного чата, и Про.
  const balanceBefore = await getCasperBalance(session);

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

    const spendNote = await casperSpendNote(session, balanceBefore);

    if (result.content.length <= 4000) {
      const text = (result.content.trim() || '(пустой ответ)') + (spendNote ? `\n\n${spendNote}` : '');
      await editOrSend(ctx, placeholder.message_id, text);
    } else {
      await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => {});
      await sendLongText(ctx, result.content);
      if (spendNote) await ctx.reply(spendNote);
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
  // Генерация медиа всегда списывает Caspers — баланс до и после проверяем безусловно.
  const balanceBefore = await getCasperBalance(session);

  try {
    const jobId = mode === 'vision' ? await startVisionJob(session, session.activeChatId!, prompt, sourceImageUrl)
      : mode === 'sound' ? await startSoundJob(session, session.activeChatId!, prompt, session.musicOptions)
      : await startReelJob(session, session.activeChatId!, prompt, session.videoOptions, sourceImageUrl);
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

    const spendNote = await casperSpendNote(session, balanceBefore);
    if (spendNote) await ctx.reply(spendNote);
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

// ─── Ввод текстом для настроек видео/музыки (negative prompt, название, стиль, текст песни) ──

async function captureAwaitingInput(ctx: Context, session: UserSession, text: string): Promise<void> {
  const field = session.awaitingInput;
  session.awaitingInput = null;
  switch (field) {
    case 'video_negative_prompt':
      session.videoOptions.negativePrompt = text.slice(0, 2500);
      await sendVideoSettings(ctx, session, false);
      break;
    case 'music_title':
      session.musicOptions.title = text.slice(0, 100);
      await sendMusicSettings(ctx, session, false);
      break;
    case 'music_style':
      session.musicOptions.style = text.slice(0, 200);
      await sendMusicSettings(ctx, session, false);
      break;
    case 'music_lyrics':
      session.musicOptions.lyrics = text.slice(0, 10000);
      await sendMusicSettings(ctx, session, false);
      break;
  }
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

  if (!ctx.from) return;
  let earlySession: UserSession;
  try {
    earlySession = await ensureSession(ctx.from);
  } catch {
    await ctx.reply('❌ Ошибка авторизации. Попробуй /start');
    return;
  }

  // Ждём ввод для настроек видео/музыки — текст уходит в поле настройки, а не в AI.
  if (earlySession.awaitingInput) {
    await captureAwaitingInput(ctx, earlySession, text);
    return;
  }

  // Кнопки нижнего меню — переключение режима или раздел, а не промпт для AI.
  const kbMode = KB_MODE_MAP[text];
  if (kbMode) {
    earlySession.mode = kbMode;
    await ctx.reply(`✅ Режим: ${MODE_LABELS[kbMode]}\n\nПиши сообщение — отвечу в этом режиме.`, { reply_markup: modeSwitchKb(kbMode) });
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
// (транскрипции и понимания видео здесь нет).
bot.on(['message:video', 'message:audio', 'message:voice'], async (ctx) => {
  await ctx.reply('👻 Видео, аудио и голосовые пока не понимаю — пришли текстом или файлом/фото.');
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
    { command: 'settings', description: 'Настройки видео/музыки' },
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
