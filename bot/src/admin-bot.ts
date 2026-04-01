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
 *   /setlimits <userId> [chat=N] [pro=N] [img=N] [video=N] [files=N]
 *   /addlimits <userId> [chat=N] [pro=N] [img=N] [video=N] [files=N]
 *   /resetlimits <userId>
 *   /ban   <userId>
 *   /stats          — сводная статистика
 *   /health         — состояние сервисов
 *   /restart <svc>  — перезапуск контейнера
 *   /logs [svc] [n] — последние N строк логов
 *   /sys            — CPU / RAM контейнеров
 */

import { Bot, InlineKeyboard } from 'grammy';
import axios from 'axios';

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('ADMIN_BOT_TOKEN is required');

const API_URL         = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const BOT_SECRET      = process.env.BOT_SECRET ?? '';
const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT ?? 'infra';

const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
);

// ─── HTTP clients ─────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: { 'x-bot-secret': BOT_SECRET },
  timeout: 15_000,
});

const docker = axios.create({
  socketPath: '/var/run/docker.sock',
  baseURL: 'http://localhost',
  timeout: 30_000,
});

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

// ─── Docker helpers ───────────────────────────────────────────────────────────

function cname(svc: string): string {
  return `${COMPOSE_PROJECT}-${svc}-1`;
}

/** Parse Docker multiplexed log stream (8-byte header per chunk). */
function parseDockerLogs(buf: Buffer): string {
  const lines: string[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    if (size === 0) { i += 8; continue; }
    const end = i + 8 + size;
    if (end > buf.length) break;
    lines.push(buf.slice(i + 8, end).toString('utf8').trimEnd());
    i = end;
  }
  return lines.join('\n');
}

async function containerLogs(svc: string, tail = 60): Promise<string> {
  const res = await docker.get(
    `/containers/${cname(svc)}/logs?tail=${tail}&stdout=1&stderr=1&timestamps=1`,
    { responseType: 'arraybuffer' },
  );
  return parseDockerLogs(Buffer.from(res.data as ArrayBuffer));
}

async function containerRestart(svc: string): Promise<void> {
  await docker.post(`/containers/${cname(svc)}/restart`);
}

async function allContainerStatuses(): Promise<Record<string, string>> {
  const res  = await docker.get<any[]>('/containers/json?all=1');
  const svcs = ['postgres', 'redis', 'backend', 'bot', 'admin-bot', 'nginx', 'certbot'];
  const out: Record<string, string> = {};
  for (const svc of svcs) {
    const needle = `/${cname(svc)}`;
    const c      = res.data.find((x: any) => (x.Names as string[])?.includes(needle));
    out[svc]     = c?.State ?? 'missing';
  }
  return out;
}

async function containerStats(svc: string): Promise<{ cpu: string; memMb: string; memPct: string } | null> {
  try {
    const res = await docker.get<any>(`/containers/${cname(svc)}/stats?stream=false`);
    const s   = res.data;
    const cpuDelta    = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
    const systemDelta = s.cpu_stats.system_cpu_usage     - s.precpu_stats.system_cpu_usage;
    const cpus        = s.cpu_stats.online_cpus ?? 1;
    const cpu         = systemDelta > 0 ? ((cpuDelta / systemDelta) * cpus * 100).toFixed(1) : '0.0';
    const memMb  = ((s.memory_stats.usage ?? 0) / 1024 / 1024).toFixed(0);
    const memPct = s.memory_stats.limit > 0
      ? (((s.memory_stats.usage ?? 0) / s.memory_stats.limit) * 100).toFixed(1)
      : '?';
    return { cpu, memMb, memPct };
  } catch {
    return null;
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const PLAN_ICON: Record<string, string> = {
  FREE: '🆓', BASIC: '⭐', STANDARD: '💫', PRO: '🚀', ULTRA: '💎', TEAM: '👥',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function lim(used: number, max: number): string {
  return `${used}/${max === -1 ? '∞' : max}`;
}

function fmtUser(u: any): string {
  const plan    = `${PLAN_ICON[u.plan] ?? '?'} <b>${u.plan}</b>`;
  const expires = u.planExpiresAt
    ? `\n⏰ Подписка до: ${new Date(u.planExpiresAt).toLocaleDateString('ru')}`
    : '';
  const tg      = u.telegramId ? `\n📱 TG ID: <code>${u.telegramId}</code>` : '';
  const email   = u.email ? `\n📧 ${u.email}` : '';
  const banned  = u.isBanned ? '\n🚫 <b>ЗАБАНЕН</b>' : '';

  return (
    `👤 <b>${esc(u.name ?? 'Без имени')}</b>${banned}\n` +
    `🆔 <code>${u.id}</code>${tg}${email}\n` +
    `📅 Зарегистрирован: ${new Date(u.createdAt).toLocaleDateString('ru')}\n` +
    `📦 План: ${plan}${expires}\n\n` +
    `📊 <b>Лимиты сегодня:</b>\n` +
    `💬 Чат (стд): ${lim(u.std_messages_today, u.std_messages_daily_limit)}\n` +
    `🧠 Чат (про): ${lim(u.pro_messages_today, u.pro_messages_daily_limit)}\n` +
    `🖼 Картинки:  ${lim(u.images_today, u.images_daily_limit)}\n` +
    `🎬 Видео:     ${lim(u.videos_today, u.videos_daily_limit)}\n` +
    `📁 Файлы:     ${lim(u.files_used, u.files_monthly_limit)}`
  );
}

function fmtUserList(data: any, page: number): string {
  const users: any[]   = data.users ?? [];
  const total: number  = data.total ?? 0;
  const limit          = data.limit ?? 8;
  const totalPages     = Math.max(1, Math.ceil(total / limit));
  let text = `👥 <b>Пользователи</b> (стр. ${page}/${totalPages}, всего: ${total})\n\n`;
  users.forEach((u: any, i: number) => {
    const n      = (page - 1) * limit + i + 1;
    const banned = u.isBanned ? ' 🚫' : '';
    const tg     = u.telegramId ? ` · TG:${u.telegramId}` : '';
    text += `${n}. <b>${esc(u.name ?? 'Без имени')}</b>${banned} — ${PLAN_ICON[u.plan] ?? ''} ${u.plan}${tg}\n`;
  });
  return text;
}

function fmtStats(s: any): string {
  const planLines = Object.entries(s.planCounts ?? {})
    .map(([k, v]) => `  ${PLAN_ICON[k] ?? '?'} ${k}: <b>${v}</b>`)
    .join('\n');
  return (
    `📊 <b>Статистика GhostLine</b>\n\n` +
    `👥 Всего пользователей: <b>${s.totalUsers}</b>\n` +
    `🆕 Новых сегодня: <b>${s.newToday}</b>\n` +
    `💬 Сообщений сегодня: <b>${s.messagesToday}</b>\n` +
    `🖼 Генераций сегодня: <b>${s.genToday}</b>\n\n` +
    `💰 <b>Платежи сегодня:</b>\n` +
    `  Успешных: <b>${s.paymentsToday}</b>\n` +
    `  Выручка сегодня: <b>${(s.revenueToday ?? 0).toLocaleString('ru')} ₽</b>\n` +
    `  Выручка всего: <b>${(s.revenueTotal ?? 0).toLocaleString('ru')} ₽</b>\n\n` +
    `📦 <b>Распределение планов:</b>\n${planLines}\n\n` +
    `🕐 ${new Date().toLocaleTimeString('ru')}`
  );
}

async function quickStats(): Promise<string> {
  try {
    const { data: s } = await api.get('/stats');
    const planLines = Object.entries(s.planCounts ?? {})
      .filter(([, v]) => (v as number) > 0)
      .map(([k, v]) => `${PLAN_ICON[k] ?? '?'}${k}: ${v}`)
      .join(' · ');
    return (
      `👻 <b>GhostLine Admin Panel</b>\n\n` +
      `👥 Пользователей: <b>${s.totalUsers}</b>` +
      (s.newToday > 0 ? ` <i>(+${s.newToday} сегодня)</i>` : '') + '\n' +
      `💰 Сегодня: <b>${(s.revenueToday ?? 0).toLocaleString('ru')} ₽</b>\n` +
      `💵 Всего: <b>${(s.revenueTotal ?? 0).toLocaleString('ru')} ₽</b>\n\n` +
      `<i>${planLines}</i>`
    );
  } catch {
    return '👻 <b>GhostLine Admin Panel</b>';
  }
}

function fmtHealth(statuses: Record<string, string>): string {
  const icon = (s: string) => s === 'running' ? '🟢' : s === 'missing' ? '⚫' : '🔴';
  const lines = Object.entries(statuses)
    .map(([svc, s]) => `${icon(s)} <b>${svc}</b>: ${s}`);
  return `🏥 <b>Состояние сервисов</b>\n\n${lines.join('\n')}`;
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

function mainKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 Пользователи', 'ul:1')
    .text('📊 Статистика', 'stats')
    .row()
    .text('🔧 Сервер', 'server_menu')
    .text('🏥 Здоровье', 'health');
}

function userKb(userId: string, u?: any): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('📦 Изменить план', `plan_menu:${userId}`)
    .text('🔄 Сбросить лимиты', `rl:${userId}`)
    .row();

  // Feature on/off toggles based on current limits
  if (u) {
    const vidOff = u.videos_daily_limit === 0;
    const imgOff = u.images_daily_limit === 0;
    const proOff = u.pro_messages_daily_limit === 0;
    const chatOff = u.std_messages_daily_limit === 0;
    kb.text(vidOff  ? '✅ Вкл видео'     : '📵 Откл видео',     vidOff  ? `ena:${userId}:video` : `dis:${userId}:video`)
      .text(imgOff  ? '✅ Вкл картинки'  : '📵 Откл картинки',  imgOff  ? `ena:${userId}:image` : `dis:${userId}:image`)
      .row()
      .text(proOff  ? '✅ Вкл про-чат'   : '📵 Откл про-чат',   proOff  ? `ena:${userId}:pro`   : `dis:${userId}:pro`)
      .text(chatOff ? '✅ Вкл чат'       : '📵 Откл чат',       chatOff ? `ena:${userId}:chat`  : `dis:${userId}:chat`)
      .row();
  }

  return kb
    .text('🚫 Бан', `ban:${userId}`)
    .text('✅ Разбан', `unban:${userId}`)
    .row()
    .text('⬅ Список', 'ul:1')
    .text('🏠 Меню', 'menu');
}

function planKb(userId: string): InlineKeyboard {
  const plans = ['FREE', 'BASIC', 'STANDARD', 'PRO', 'ULTRA'] as const;
  const kb    = new InlineKeyboard();
  plans.forEach((p, i) => {
    kb.text(`${PLAN_ICON[p]} ${p}`, `sp:${userId}:${p}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text('⬅ Назад', `u:${userId}`);
}

function userListKb(data: any, page: number): InlineKeyboard {
  const users: any[] = data.users ?? [];
  const total        = data.total ?? 0;
  const limit        = data.limit ?? 8;
  const totalPages   = Math.max(1, Math.ceil(total / limit));
  const kb           = new InlineKeyboard();

  // 2-column grid
  users.forEach((u: any, i: number) => {
    const banned = u.isBanned ? '🚫 ' : '';
    const label  = banned + (u.name ?? 'Без имени').slice(0, 13);
    kb.text(label, `u:${u.id}`);
    if (i % 2 === 1) kb.row();
  });
  if (users.length % 2 !== 0) kb.row();

  // Navigation + search hint
  const nav: Array<[string, string]> = [];
  if (page > 1)          nav.push(['⬅', `ul:${page - 1}`]);
  nav.push([`${page}/${totalPages}`, `ul:${page}`]);
  if (page < totalPages) nav.push(['➡', `ul:${page + 1}`]);
  kb.text(nav[0][0], nav[0][1]);
  if (nav[1]) kb.text(nav[1][0], nav[1][1]);
  if (nav[2]) kb.text(nav[2][0], nav[2][1]);
  kb.row();

  return kb
    .text('🔍 Найти (/find)', 'search_hint')
    .text('🏠 Меню', 'menu');
}

function serverKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🏥 Здоровье', 'health')
    .text('📊 Ресурсы', 'sys')
    .row()
    .text('🔄 backend', 'restart:backend')
    .text('🔄 bot', 'restart:bot')
    .text('🔄 nginx', 'restart:nginx')
    .row()
    .text('📋 Логи backend', 'logs:backend:60')
    .text('📋 Логи bot', 'logs:bot:60')
    .row()
    .text('⬅ Меню', 'menu');
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchUser(id: string): Promise<any> {
  const { data } = await api.get(`/users/${encodeURIComponent(id)}`);
  return data;
}

async function replyUserCard(ctx: any, userId: string, edit = false): Promise<void> {
  const u  = await fetchUser(userId);
  const text = fmtUser(u);
  const kb   = userKb(u.id, u);
  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const text = await quickStats();
  await ctx.reply(text + '\n\nВыберите раздел:', { parse_mode: 'HTML', reply_markup: mainKb() });
});

bot.command('users', async (ctx) => {
  const page     = Math.max(1, parseInt((ctx.match ?? '1').trim()) || 1);
  const { data } = await api.get(`/users?page=${page}&limit=8`);
  await ctx.reply(fmtUserList(data, page), {
    parse_mode: 'HTML',
    reply_markup: userListKb(data, page),
  });
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
});

bot.command('setplan', async (ctx) => {
  const [userId, plan] = (ctx.match ?? '').trim().split(/\s+/);
  const valid = ['FREE', 'BASIC', 'STANDARD', 'PRO', 'ULTRA'];
  if (!userId || !plan || !valid.includes(plan.toUpperCase())) {
    await ctx.reply(`❌ /setplan <userId> <план>\nПланы: ${valid.join(', ')}`);
    return;
  }
  await api.post('/setplan', { userId, plan: plan.toUpperCase() });
  await ctx.reply(`✅ <code>${userId}</code> → план <b>${plan.toUpperCase()}</b>`, { parse_mode: 'HTML' });
});

bot.command('setlimits', async (ctx) => {
  const parts  = (ctx.match ?? '').trim().split(/\s+/);
  const userId = parts[0];
  if (!userId) { await ctx.reply('❌ /setlimits <userId> [chat=N] [pro=N] [img=N] [video=N] [files=N]\n(-1 = безлимит)'); return; }

  const body: Record<string, any> = { userId };
  for (const p of parts.slice(1)) {
    const [k, v] = p.split('=');
    if (k && v !== undefined) body[k] = parseInt(v);
  }

  const { data } = await api.post('/setlimits', body);
  const changed  = Object.entries(data.updated ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  await ctx.reply(`✅ Лимиты установлены для <code>${userId}</code>\n${changed}`, { parse_mode: 'HTML' });
});

bot.command('addlimits', async (ctx) => {
  const parts  = (ctx.match ?? '').trim().split(/\s+/);
  const userId = parts[0];
  if (!userId) { await ctx.reply('❌ /addlimits <userId> [chat=N] [pro=N] [img=N] [video=N] [files=N]'); return; }

  const body: Record<string, any> = { userId };
  for (const p of parts.slice(1)) {
    const [k, v] = p.split('=');
    if (k && v !== undefined) body[k] = parseInt(v);
  }

  const { data } = await api.post('/addlimits', body);
  const changed  = Object.entries(data.updated ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  await ctx.reply(`✅ Лимиты добавлены для <code>${userId}</code>\n${changed || (data.note ?? '')}`, { parse_mode: 'HTML' });
});

bot.command('resetlimits', async (ctx) => {
  const userId = (ctx.match ?? '').trim();
  if (!userId) { await ctx.reply('❌ /resetlimits <userId>'); return; }
  await api.post('/resetlimits', { userId });
  await ctx.reply(`✅ Лимиты сброшены для <code>${userId}</code>`, { parse_mode: 'HTML' });
});

bot.command('ban', async (ctx) => {
  const userId = (ctx.match ?? '').trim();
  if (!userId) { await ctx.reply('❌ /ban <userId>'); return; }
  await api.post('/ban', { userId });
  await ctx.reply(`🚫 Пользователь <code>${userId}</code> заблокирован`, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
  const { data } = await api.get('/stats');
  await ctx.reply(fmtStats(data), { parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('🔄 Обновить', 'stats').text('🏠 Меню', 'menu'),
  });
});

bot.command('health', async (ctx) => {
  const statuses = await allContainerStatuses();
  await ctx.reply(fmtHealth(statuses), { parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('🔄 Обновить', 'health').text('🏠 Меню', 'menu'),
  });
});

bot.command('restart', async (ctx) => {
  const svc     = (ctx.match ?? '').trim();
  const allowed = ['backend', 'bot', 'nginx', 'redis', 'admin-bot', 'certbot'];
  if (!allowed.includes(svc)) {
    await ctx.reply(`❌ /restart <сервис>\nДоступные: ${allowed.join(', ')}`);
    return;
  }
  const msg = await ctx.reply(`🔄 Перезапускаю <b>${svc}</b>...`, { parse_mode: 'HTML' });
  await containerRestart(svc);
  await ctx.api.editMessageText(
    ctx.chat!.id, msg.message_id,
    `✅ <b>${svc}</b> перезапущен в ${new Date().toLocaleTimeString('ru')}`,
    { parse_mode: 'HTML' },
  );
});

bot.command('logs', async (ctx) => {
  const parts = (ctx.match ?? 'backend 60').trim().split(/\s+/);
  const svc   = parts[0] || 'backend';
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
    await ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.command('sys', async (ctx) => {
  await ctx.reply('📊 Запрашиваю ресурсы...', { parse_mode: 'HTML' });
  const svcs  = ['backend', 'bot', 'admin-bot', 'nginx', 'redis', 'postgres'];
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
  const text = await quickStats();
  await ctx.editMessageText(text + '\n\nВыберите раздел:', {
    parse_mode: 'HTML', reply_markup: mainKb(),
  });
});

bot.callbackQuery('stats', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { data } = await api.get('/stats');
  await ctx.editMessageText(fmtStats(data), {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('🔄 Обновить', 'stats').text('🏠 Меню', 'menu'),
  });
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
  const svcs  = ['backend', 'bot', 'admin-bot', 'nginx', 'redis', 'postgres'];
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
  const page     = parseInt(ctx.match[1]);
  const { data } = await api.get(`/users?page=${page}&limit=8`);
  await ctx.editMessageText(fmtUserList(data, page), {
    parse_mode: 'HTML',
    reply_markup: userListKb(data, page),
  });
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
  await replyUserCard(ctx, ctx.match[1], true);
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
  await api.post('/setplan', { userId, plan });
  await replyUserCard(ctx, userId, true);
});

bot.callbackQuery(/^rl:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Сбрасываю...');
  const userId = ctx.match[1];
  await api.post('/resetlimits', { userId });
  await replyUserCard(ctx, userId, true);
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
  await api.post('/ban', { userId });
  await replyUserCard(ctx, userId, true);
});

bot.callbackQuery(/^unban:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Разбаниваю...');
  const userId = ctx.match[1];
  await api.post('/ban', { userId, unban: true });
  await replyUserCard(ctx, userId, true);
});

// dis:<userId>:<feature>  — disable a feature (set limit = 0)
bot.callbackQuery(/^dis:([^:]+):([a-z]+)$/, async (ctx) => {
  const userId  = ctx.match[1];
  const feature = ctx.match[2]; // video | image | pro | chat
  await ctx.answerCallbackQuery(`Отключаю ${feature}...`);
  const fieldMap: Record<string, string> = {
    video: 'video', image: 'img', pro: 'pro', chat: 'chat',
  };
  const field = fieldMap[feature];
  if (!field) return;
  await api.post('/setlimits', { userId, [field]: 0 });
  await replyUserCard(ctx, userId, true);
});

// ena:<userId>:<feature>  — re-enable by restoring plan default (full reset)
bot.callbackQuery(/^ena:([^:]+):([a-z]+)$/, async (ctx) => {
  const userId = ctx.match[1];
  await ctx.answerCallbackQuery('Восстанавливаю...');
  // Reset ALL limits to plan defaults — cleanest way to restore one disabled feature
  await api.post('/resetlimits', { userId });
  await replyUserCard(ctx, userId, true);
});

bot.callbackQuery(/^restart:(.+)$/, async (ctx) => {
  const svc = ctx.match[1];
  await ctx.answerCallbackQuery(`Перезапускаю ${svc}...`);
  await containerRestart(svc);
  await ctx.editMessageText(
    `✅ <b>${svc}</b> перезапущен в ${new Date().toLocaleTimeString('ru')}`,
    { parse_mode: 'HTML', reply_markup: serverKb() },
  );
});

bot.callbackQuery(/^logs:([^:]+):(\d+)$/, async (ctx) => {
  const svc = ctx.match[1];
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
    await ctx.reply(`❌ ${e.message}`);
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch(async (err) => {
  // Ignore expired / already-answered callback query errors — harmless race condition
  if (err.message.includes('query is too old') || err.message.includes('query ID is invalid')) return;
  console.error('[AdminBot] Error:', err.message);
  try {
    await err.ctx.reply(`❌ Ошибка: ${err.message.slice(0, 200)}`);
  } catch { /* ignore */ }
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
