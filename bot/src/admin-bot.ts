/**
 * GhostLine Admin Bot
 * ───────────────────
 * Полноценная панель управления для администраторов.
 *
 * Команды:
 *   /start         — главное меню
 *   /users [page]  — список пользователей
 *   /user  <id>    — карточка пользователя
 *   /find  <query> — поиск по имени/email/TG ID/username
 *   /setplan <userId> <PLAN>
 *   /resetlimits <userId>  — сбросить дневной/недельный счётчик FREE-тарифа
 *   /ban   <userId>
 *   /newpromo <CODE> type=caspers amount=N [maxuses=N] [expires=YYYY-MM-DD]
 *   /newpromo <CODE> type=discount percent=N [plans=BASIC,PRO] [maxuses=N] [expires=YYYY-MM-DD]
 *   /promos [page]  — список промокодов
 *   /promo <code>   — детали + кто использовал
 *   /delpromo <code>
 *   /stats          — сводная статистика
 *   /health         — состояние сервисов
 *   /restart <svc>  — перезапуск контейнера
 *   /logs [svc] [n] — последние N строк логов
 *   /sys            — CPU / RAM контейнеров
 */

import { Bot, InlineKeyboard } from 'grammy';
import { PLAN_KEYS } from './lib/plan-keys.js';
import { apiErrorMessage } from './lib/error-message.js';
import { api } from './lib/admin-api.js';
import { ALL_SERVICES, RESTARTABLE_SERVICES, LOGGABLE_SERVICES, containerLogs, containerRestart, allContainerStatuses, containerStats } from './lib/docker.js';
import { esc, fmtUser, fmtUserList, fmtStats, quickStats, fmtHealth, fmtPromoShort, fmtPromoDetail } from './lib/admin-format.js';
import {
  mainKb, promoListKb, promoDetailKb, userKb, planKb, userListKb, serverKb,
  ADMIN_KEYBOARD, KB_START, KB_USERS, KB_STATS, KB_PROMOS, KB_HEALTH, KB_SERVER,
} from './lib/admin-keyboards.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('ADMIN_BOT_TOKEN is required');

const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
);

// ─── Bot ──────────────────────────────────────────────────────────────────────

const bot = new Bot(BOT_TOKEN);

// ─── Auth guard ───────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (!ADMIN_IDS.has(String(ctx.from?.id ?? ''))) {
    await ctx.reply('⛔ Нет доступа.');
    return;
  }
  await next();
});

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchUser(id: string): Promise<any> {
  const { data } = await api.get(`/users/${encodeURIComponent(id)}`);
  return data;
}

async function replyUserCard(ctx: any, userId: string, edit = false): Promise<void> {
  const u  = await fetchUser(userId);
  const text = fmtUser(u);
  const kb   = userKb(u.id);
  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function sendMainMenu(ctx: any): Promise<void> {
  const text = await quickStats();
  await ctx.reply(text + '\n\nВыберите раздел:', { parse_mode: 'HTML', reply_markup: mainKb() });
}

bot.command('start', async (ctx) => {
  await sendMainMenu(ctx);
  await ctx.reply('👇 Меню всегда под рукой снизу', { reply_markup: ADMIN_KEYBOARD });
});

async function sendUsersPage(ctx: any, page: number): Promise<void> {
  try {
    const { data } = await api.get(`/users?page=${page}&limit=8`);
    await ctx.reply(fmtUserList(data, page), {
      parse_mode: 'HTML',
      reply_markup: userListKb(data, page),
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
}

bot.command('users', async (ctx) => {
  const page = Math.max(1, parseInt((ctx.match ?? '1').trim()) || 1);
  await sendUsersPage(ctx, page);
});

bot.command('user', async (ctx) => {
  const id = (ctx.match ?? '').trim();
  if (!id) { await ctx.reply('❌ /user <userId>'); return; }
  try {
    await replyUserCard(ctx, id);
  } catch {
    await ctx.reply('❌ Пользователь не найден.');
  }
});

bot.command('find', async (ctx) => {
  const q = (ctx.match ?? '').trim();
  if (!q) {
    await ctx.reply(
      '🔍 <b>Поиск пользователя</b>\n\n' +
      '/find <i>&lt;запрос&gt;</i>\n\n' +
      'Поиск по:\n' +
      '• <b>Имени</b> — напр. <code>/find Алексей</code>\n' +
      '• <b>Email</b> — напр. <code>/find user@gmail.com</code>\n' +
      '• <b>Telegram ID</b> — напр. <code>/find 1800342635</code>\n' +
      '• <b>UUID пользователя</b> — напр. <code>/find cuid123...</code>\n' +
      '• <b>Yandex / Google ID</b>\n',
      { parse_mode: 'HTML' },
    );
    return;
  }

  try {
    const { data } = await api.get(`/users?search=${encodeURIComponent(q)}&limit=10`);
    const users: any[] = data.users ?? [];

    if (users.length === 0) {
      await ctx.reply('🔍 Пользователей не найдено.');
      return;
    }
    if (users.length === 1) {
      await replyUserCard(ctx, users[0].id);
      return;
    }

    const kb = new InlineKeyboard();
    users.forEach((u: any) => {
      const label = (u.name ?? 'Без имени').slice(0, 30);
      kb.text(label, `u:${u.id}`).row();
    });
    kb.text('⬅ Меню', 'menu');

    await ctx.reply(`🔍 Найдено ${data.total}. Выберите:`, {
      reply_markup: kb,
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.command('setplan', async (ctx) => {
  const [userId, plan] = (ctx.match ?? '').trim().split(/\s+/);
  const valid: string[] = [...PLAN_KEYS];
  if (!userId || !plan || !valid.includes(plan.toUpperCase())) {
    await ctx.reply(`❌ /setplan <userId> <план>\nПланы: ${valid.join(', ')}`);
    return;
  }
  try {
    await api.post('/setplan', { userId, plan: plan.toUpperCase() });
    await ctx.reply(`✅ <code>${userId}</code> → план <b>${plan.toUpperCase()}</b>`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.command('resetlimits', async (ctx) => {
  const userId = (ctx.match ?? '').trim();
  if (!userId) { await ctx.reply('❌ /resetlimits <userId>'); return; }
  try {
    await api.post('/resetlimits', { userId });
    await ctx.reply(`✅ Лимиты сброшены для <code>${userId}</code>`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.command('ban', async (ctx) => {
  const userId = (ctx.match ?? '').trim();
  if (!userId) { await ctx.reply('❌ /ban <userId>'); return; }
  try {
    await api.post('/ban', { userId });
    await ctx.reply(`🚫 Пользователь <code>${userId}</code> заблокирован`, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.command('addcaspers', async (ctx) => {
  const [userId, amountStr] = (ctx.match ?? '').trim().split(/\s+/);
  const amount = parseInt(amountStr ?? '');
  if (!userId || isNaN(amount) || amount === 0) {
    await ctx.reply('❌ /addcaspers <userId> <кол-во>\nОтрицательное — вычесть. Например: /addcaspers abc123 100');
    return;
  }
  try {
    const endpoint = amount > 0 ? '/addcaspers' : '/subcaspers';
    await api.post(endpoint, { userId, amount: Math.abs(amount) });
    const sign = amount > 0 ? '+' : '-';
    await ctx.reply(`✅ Caspers ${sign}${Math.abs(amount)} для <code>${userId}</code>`, { parse_mode: 'HTML' });
    await replyUserCard(ctx, userId);
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.command('newpromo', async (ctx) => {
  const parts = (ctx.match ?? '').trim().split(/\s+/);
  const code  = parts[0];
  if (!code) {
    await ctx.reply(
      '❌ <b>Создание промокода</b>\n\n' +
      '<code>/newpromo CODE type=caspers amount=500 maxuses=100 expires=2026-12-31</code>\n' +
      '<code>/newpromo CODE type=discount percent=20 plans=BASIC,PRO maxuses=50</code>\n\n' +
      '<i>maxuses и expires необязательны (по умолчанию — без лимита). plans необязателен (по умолчанию — все тарифы).</i>',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const kv: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const [k, v] = p.split('=');
    if (k && v !== undefined) kv[k] = v;
  }

  const body: Record<string, any> = { code, createdBy: String(ctx.from?.id ?? '') };
  if (kv.type === 'caspers') {
    body.rewardType = 'CASPERS';
    body.casperAmount = parseInt(kv.amount ?? '');
    if (!body.casperAmount || body.casperAmount < 1) {
      await ctx.reply('❌ Укажи amount=N (кол-во Caspers)'); return;
    }
  } else if (kv.type === 'discount') {
    body.rewardType = 'DISCOUNT_PERCENT';
    body.discountPercent = parseInt(kv.percent ?? '');
    if (!body.discountPercent || body.discountPercent < 1 || body.discountPercent > 100) {
      await ctx.reply('❌ Укажи percent=N (1-100)'); return;
    }
    if (kv.plans) body.applicablePlans = kv.plans.split(',').map(s => s.trim().toUpperCase());
  } else {
    await ctx.reply('❌ Укажи type=caspers или type=discount'); return;
  }
  if (kv.maxuses) body.maxUses = parseInt(kv.maxuses);
  if (kv.expires) body.expiresAt = new Date(kv.expires + 'T23:59:59Z').toISOString();

  try {
    const { data } = await api.post('/promo/create', body);
    await ctx.reply(fmtPromoDetail(data.promo, []), {
      parse_mode: 'HTML', reply_markup: promoDetailKb(data.promo.code),
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

async function sendPromosPage(ctx: any, page: number): Promise<void> {
  try {
    const { data } = await api.get(`/promo/list?page=${page}&limit=10`);
    const text = data.promos.length
      ? `🎟 <b>Промокоды</b> (стр. ${page}, всего: ${data.total})\n\n` + data.promos.map(fmtPromoShort).join('\n')
      : '🎟 Промокодов пока нет. Создай через /newpromo';
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: promoListKb(data, page) });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
}

bot.command('promos', async (ctx) => {
  const page = Math.max(1, parseInt((ctx.match ?? '1').trim()) || 1);
  await sendPromosPage(ctx, page);
});

bot.command('promo', async (ctx) => {
  const code = (ctx.match ?? '').trim();
  if (!code) { await ctx.reply('❌ /promo <код>'); return; }
  try {
    const { data } = await api.get(`/promo/${encodeURIComponent(code)}`);
    await ctx.reply(fmtPromoDetail(data.promo, data.redemptions), {
      parse_mode: 'HTML', reply_markup: promoDetailKb(data.promo.code),
    });
  } catch {
    await ctx.reply('❌ Промокод не найден.');
  }
});

bot.command('delpromo', async (ctx) => {
  const code = (ctx.match ?? '').trim();
  if (!code) { await ctx.reply('❌ /delpromo <код>'); return; }
  try {
    const { data } = await api.delete(`/promo/${encodeURIComponent(code)}`);
    await ctx.reply(
      data.deleted
        ? `✅ Промокод <code>${esc(code)}</code> удалён (не использовался)`
        : `✅ Промокод <code>${esc(code)}</code> деактивирован (уже использовался — история сохранена)`,
      { parse_mode: 'HTML' },
    );
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

async function sendStatsMsg(ctx: any): Promise<void> {
  try {
    const { data } = await api.get('/stats');
    await ctx.reply(fmtStats(data), { parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔄 Обновить', 'stats').text('🏠 Меню', 'menu'),
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
}

bot.command('stats', sendStatsMsg);

async function sendHealthMsg(ctx: any): Promise<void> {
  try {
    const statuses = await allContainerStatuses();
    await ctx.reply(fmtHealth(statuses), { parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔄 Обновить', 'health').text('🏠 Меню', 'menu'),
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
}

bot.command('health', sendHealthMsg);

async function sendServerMenu(ctx: any): Promise<void> {
  await ctx.reply('🔧 <b>Управление сервером</b>', { parse_mode: 'HTML', reply_markup: serverKb() });
}

bot.command('restart', async (ctx) => {
  const svc     = (ctx.match ?? '').trim();
  const allowed = RESTARTABLE_SERVICES;
  if (!allowed.includes(svc)) {
    await ctx.reply(`❌ /restart <сервис>\nДоступные: ${allowed.join(', ')}`);
    return;
  }
  const msg = await ctx.reply(`🔄 Перезапускаю <b>${svc}</b>...`, { parse_mode: 'HTML' });
  try {
    await containerRestart(svc);
    await ctx.api.editMessageText(
      ctx.chat!.id, msg.message_id,
      `✅ <b>${svc}</b> перезапущен в ${new Date().toLocaleTimeString('ru')}`,
      { parse_mode: 'HTML' },
    );
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id, msg.message_id,
      `❌ Не удалось перезапустить <b>${svc}</b>: ${esc(apiErrorMessage(err))}`,
      { parse_mode: 'HTML' },
    );
  }
});

bot.command('logs', async (ctx) => {
  const allowedSvcs = LOGGABLE_SERVICES;
  const parts = (ctx.match ?? 'backend 60').trim().split(/\s+/);
  const svc   = parts[0] || 'backend';
  if (!allowedSvcs.includes(svc)) {
    await ctx.reply(`❌ Недопустимый сервис. Доступные: ${allowedSvcs.join(', ')}`);
    return;
  }
  const n     = Math.min(200, parseInt(parts[1] ?? '60') || 60);
  await ctx.reply(`📋 Получаю логи <b>${svc}</b>...`, { parse_mode: 'HTML' });
  try {
    const logs = await containerLogs(svc, n);
    const text = logs ? esc(logs).slice(-3800) : 'Логи пусты.';
    await ctx.reply(`📋 <b>${svc}</b> (${n} строк):\n<pre>${text}</pre>`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('🔄 Обновить', `logs:${svc}:${n}`)
        .text('⬅ Сервер', 'server_menu'),
    });
  } catch (e: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(e)}`);
  }
});

bot.command('sys', async (ctx) => {
  await ctx.reply('📊 Запрашиваю ресурсы...', { parse_mode: 'HTML' });
  const svcs  = LOGGABLE_SERVICES;
  const lines = await Promise.all(
    svcs.map(async svc => {
      const s = await containerStats(svc);
      return s
        ? `📦 <b>${svc}</b>: CPU ${s.cpu}% | RAM ${s.memMb}MB (${s.memPct}%)`
        : `📦 <b>${svc}</b>: недоступен`;
    }),
  );
  await ctx.reply(
    `📊 <b>Ресурсы контейнеров</b>\n\n${lines.join('\n')}\n\n🕐 ${new Date().toLocaleTimeString('ru')}`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔄 Обновить', 'sys').text('⬅ Сервер', 'server_menu'),
    },
  );
});

// ─── Callback queries ─────────────────────────────────────────────────────────

bot.callbackQuery('menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const text = await quickStats();
    await ctx.editMessageText(text + '\n\nВыберите раздел:', {
      parse_mode: 'HTML', reply_markup: mainKb(),
    });
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    console.error('[AdminBot] menu callback error:', msg);
    await ctx.reply(`❌ Ошибка меню: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery('stats', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const { data } = await api.get('/stats');
    await ctx.editMessageText(fmtStats(data), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔄 Обновить', 'stats').text('🏠 Меню', 'menu'),
    });
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    console.error('[AdminBot] stats callback error:', msg);
    await ctx.reply(`❌ Ошибка статистики: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery('server_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('🔧 <b>Управление сервером</b>', {
    parse_mode: 'HTML', reply_markup: serverKb(),
  });
});

bot.callbackQuery('health', async (ctx) => {
  await ctx.answerCallbackQuery('Проверяю...');
  const statuses = await allContainerStatuses();
  await ctx.editMessageText(fmtHealth(statuses), {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('🔄 Обновить', 'health')
      .text('⬅ Сервер', 'server_menu'),
  });
});

bot.callbackQuery('sys', async (ctx) => {
  await ctx.answerCallbackQuery('Считаю...');
  const svcs  = LOGGABLE_SERVICES;
  const lines = await Promise.all(
    svcs.map(async svc => {
      const s = await containerStats(svc);
      return s
        ? `📦 <b>${svc}</b>: CPU ${s.cpu}% | RAM ${s.memMb}MB (${s.memPct}%)`
        : `📦 <b>${svc}</b>: недоступен`;
    }),
  );
  await ctx.editMessageText(
    `📊 <b>Ресурсы контейнеров</b>\n\n${lines.join('\n')}\n\n🕐 ${new Date().toLocaleTimeString('ru')}`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔄 Обновить', 'sys').text('⬅ Сервер', 'server_menu'),
    },
  );
});

bot.callbackQuery(/^ul:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1]);
  try {
    const { data } = await api.get(`/users?page=${page}&limit=8`);
    await ctx.editMessageText(fmtUserList(data, page), {
      parse_mode: 'HTML',
      reply_markup: userListKb(data, page),
    });
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    console.error('[AdminBot] ul callback error:', msg);
    await ctx.reply(`❌ Ошибка загрузки пользователей: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^pl:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1]);
  try {
    const { data } = await api.get(`/promo/list?page=${page}&limit=10`);
    const text = data.promos.length
      ? `🎟 <b>Промокоды</b> (стр. ${page}, всего: ${data.total})\n\n` + data.promos.map(fmtPromoShort).join('\n')
      : '🎟 Промокодов пока нет. Создай через /newpromo';
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: promoListKb(data, page) });
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    await ctx.reply(`❌ Ошибка: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^p:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const code = ctx.match[1];
  try {
    const { data } = await api.get(`/promo/${encodeURIComponent(code)}`);
    await ctx.editMessageText(fmtPromoDetail(data.promo, data.redemptions), {
      parse_mode: 'HTML', reply_markup: promoDetailKb(data.promo.code),
    });
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    await ctx.reply(`❌ Ошибка: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^dp:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const code = ctx.match[1];
  await ctx.editMessageText(
    `⚠️ <b>Удалить промокод?</b>\n\n<code>${esc(code)}</code>\n\nЕсли его уже использовали — вместо удаления он будет деактивирован (история сохранится).`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Да', `dp_yes:${code}`)
        .text('❌ Отмена', `p:${code}`),
    },
  );
});

bot.callbackQuery(/^dp_yes:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Удаляю...');
  const code = ctx.match[1];
  try {
    const { data } = await api.delete(`/promo/${encodeURIComponent(code)}`);
    await ctx.editMessageText(
      data.deleted
        ? `✅ Промокод <code>${esc(code)}</code> удалён (не использовался)`
        : `✅ Промокод <code>${esc(code)}</code> деактивирован (уже использовался — история сохранена)`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅ Список', 'pl:1') },
    );
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${apiErrorMessage(err)}`);
  }
});

bot.callbackQuery('search_hint', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    '🔍 <b>Поиск пользователя</b>\n\n' +
    'Используй команду:\n' +
    '/find <i>&lt;запрос&gt;</i>\n\n' +
    'Поиск по:\n' +
    '• Имени\n• Email\n• Telegram ID\n• UUID\n• Yandex / Google ID',
    { parse_mode: 'HTML' },
  );
});

bot.callbackQuery(/^u:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await replyUserCard(ctx, ctx.match[1], true);
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    console.error('[AdminBot] user card error:', msg);
    await ctx.reply(`❌ Ошибка: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^plan_menu:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.match[1];
  await ctx.editMessageText(`📦 Выберите план для <code>${userId}</code>:`, {
    parse_mode: 'HTML', reply_markup: planKb(userId),
  });
});

bot.callbackQuery(/^sp:(.+):([A-Z]+)$/, async (ctx) => {
  const [, userId, plan] = ctx.match;
  await ctx.answerCallbackQuery(`Устанавливаю ${plan}...`);
  try {
    await api.post('/setplan', { userId, plan });
    await replyUserCard(ctx, userId, true);
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    await ctx.reply(`❌ Ошибка установки плана: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^rl:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Сбрасываю...');
  const userId = ctx.match[1];
  try {
    await api.post('/resetlimits', { userId });
    await replyUserCard(ctx, userId, true);
  } catch (err: any) {
    const msg = apiErrorMessage(err);
    await ctx.reply(`❌ Ошибка сброса: ${String(msg).slice(0, 300)}`);
  }
});

bot.callbackQuery(/^ban:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.match[1];
  await ctx.editMessageText(
    `⚠️ <b>Подтвердить бан?</b>\n\n<code>${userId}</code>\n\nВсе лимиты будут обнулены.`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Забанить', `ban_yes:${userId}`)
        .text('❌ Отмена', `u:${userId}`),
    },
  );
});

bot.callbackQuery(/^ban_yes:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Баню...');
  const userId = ctx.match[1];
  try {
    await api.post('/ban', { userId });
    await replyUserCard(ctx, userId, true);
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${(err?.message ?? '').slice(0, 200)}`);
  }
});

bot.callbackQuery(/^unban:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Разбаниваю...');
  const userId = ctx.match[1];
  try {
    await api.post('/ban', { userId, unban: true });
    await replyUserCard(ctx, userId, true);
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${(err?.message ?? '').slice(0, 200)}`);
  }
});

// caspers_add:<userId> — запрос на добавление caspers
bot.callbackQuery(/^caspers_add:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.match[1];
  await ctx.reply(
    `➕ <b>Добавить Caspers</b>\n\nПользователь: <code>${userId}</code>\n\nВведи команду:\n/addcaspers ${userId} <кол-во>`,
    { parse_mode: 'HTML' },
  );
});

// caspers_sub:<userId> — запрос на списание caspers
bot.callbackQuery(/^caspers_sub:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.match[1];
  await ctx.reply(
    `➖ <b>Списать Caspers</b>\n\nПользователь: <code>${userId}</code>\n\nВведи команду (отрицательное значение):\n/addcaspers ${userId} -<кол-во>`,
    { parse_mode: 'HTML' },
  );
});

bot.callbackQuery(/^restart:(.+)$/, async (ctx) => {
  const allowed = RESTARTABLE_SERVICES;
  const svc = ctx.match[1];
  if (!allowed.includes(svc)) {
    await ctx.answerCallbackQuery('⛔ Недопустимый сервис');
    return;
  }
  await ctx.answerCallbackQuery(`Перезапускаю ${svc}...`);
  try {
    await containerRestart(svc);
    await ctx.editMessageText(
      `✅ <b>${svc}</b> перезапущен в ${new Date().toLocaleTimeString('ru')}`,
      { parse_mode: 'HTML', reply_markup: serverKb() },
    );
  } catch (err: any) {
    await ctx.editMessageText(
      `❌ Не удалось перезапустить <b>${svc}</b>: ${esc(apiErrorMessage(err))}`,
      { parse_mode: 'HTML', reply_markup: serverKb() },
    );
  }
});

bot.callbackQuery(/^logs:([^:]+):(\d+)$/, async (ctx) => {
  const allowedSvcs = LOGGABLE_SERVICES;
  const svc = ctx.match[1];
  if (!allowedSvcs.includes(svc)) {
    await ctx.answerCallbackQuery('⛔ Недопустимый сервис');
    return;
  }
  const n   = parseInt(ctx.match[2]);
  await ctx.answerCallbackQuery('Получаю логи...');
  try {
    const logs = await containerLogs(svc, n);
    const text = logs ? esc(logs).slice(-3800) : 'Логи пусты.';
    await ctx.reply(`📋 <b>${svc}</b> (${n} строк):\n<pre>${text}</pre>`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('🔄 Обновить', `logs:${svc}:${n}`)
        .text('⬅ Сервер', 'server_menu'),
    });
  } catch (e: any) {
    await ctx.reply(`❌ ${apiErrorMessage(e)}`);
  }
});

// ─── Кнопки постоянного нижнего меню ────────────────────────────────────────
// Обычные текстовые сообщения (не команды) — срабатывает, только если текст
// совпал с одной из подписей ADMIN_KEYBOARD, иначе просто игнорируем.

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text === KB_START)  { await sendMainMenu(ctx);      return; }
  if (text === KB_USERS)  { await sendUsersPage(ctx, 1);  return; }
  if (text === KB_STATS)  { await sendStatsMsg(ctx);      return; }
  if (text === KB_PROMOS) { await sendPromosPage(ctx, 1); return; }
  if (text === KB_HEALTH) { await sendHealthMsg(ctx);     return; }
  if (text === KB_SERVER) { await sendServerMenu(ctx);    return; }
});

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch(async (err) => {
  // Игнорируем ошибки просроченных / уже отвеченных callback query — безобидная гонка
  if (err.message.includes('query is too old') || err.message.includes('query ID is invalid')) return;
  console.error('[AdminBot] Error:', err.message);
  try {
    await err.ctx.reply(`❌ Ошибка: ${err.message.slice(0, 200)}`);
  } catch { /* игнорируем */ }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[AdminBot] Starting GhostLine Admin Bot...');
  await bot.start({
    onStart: (info) => console.log(`[AdminBot] Running as @${info.username}`),
  });
}

main().catch(err => {
  console.error('[AdminBot] Fatal:', err);
  process.exit(1);
});
