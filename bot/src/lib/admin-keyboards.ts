// Клавиатуры админ-бота — вынесены из admin-bot.ts, чтобы файл с командами
// не смешивал регистрацию хендлеров со сборкой клавиатур.
import { InlineKeyboard, Keyboard } from 'grammy';
import { PLAN_KEYS } from './plan-keys.js';
import { PLAN_ICON } from './admin-format.js';

// ─── Постоянное нижнее меню ─────────────────────────────────────────────────
// В отличие от инлайн-клавиатур (привязаны к конкретному сообщению и пропадают
// из вида, если проскроллить чат), это меню остаётся под полем ввода после
// любого сообщения — админу не нужно каждый раз писать /start заново.

export const KB_START    = '🏠 Старт';
export const KB_USERS    = '👥 Пользователи';
export const KB_STATS    = '📊 Статистика';
export const KB_PROMOS   = '🎟 Промокоды';
export const KB_HEALTH   = '🏥 Здоровье';
export const KB_SERVER   = '🔧 Сервер';
export const KB_MAINT    = '🚧 Тех.работы';

export const ADMIN_KEYBOARD = new Keyboard()
  .text(KB_START).text(KB_STATS).row()
  .text(KB_USERS).text(KB_PROMOS).row()
  .text(KB_HEALTH).text(KB_SERVER).row()
  .text(KB_MAINT)
  .resized()
  .persistent();

export function mainKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 Пользователи', 'ul:1')
    .text('📊 Статистика', 'stats')
    .row()
    .text('🎟 Промокоды', 'pl:1')
    .text('🏥 Здоровье', 'health')
    .row()
    .text('🔧 Сервер', 'server_menu')
    .text('🚧 Тех.работы', 'maint_menu');
}

// ─── Тех.работы ──────────────────────────────────────────────────────────────
// until — ISO-строка окончания или null ("до отмены"), нужна только когда
// работы уже активны (кнопка "выключить" + быстрая смена времени).
export function maintenanceKb(active: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (active) {
    kb.text('🟢 Выключить', 'maint_off').row();
  } else {
    kb.text('+30 мин', 'maint_on:30')
      .text('+1 час', 'maint_on:60')
      .text('+2 часа', 'maint_on:120')
      .row()
      .text('+4 часа', 'maint_on:240')
      .text('До отмены', 'maint_on:0')
      .row();
  }
  return kb.text('⬅ Меню', 'menu');
}

export function promoListKb(data: any, page: number): InlineKeyboard {
  const promos: any[] = data.promos ?? [];
  const total       = data.total ?? 0;
  const limit       = data.limit ?? 10;
  const totalPages  = Math.max(1, Math.ceil(total / limit));
  const kb          = new InlineKeyboard();

  promos.forEach((p: any) => {
    kb.text(`${p.active ? '🟢' : '🚫'} ${p.code}`, `p:${p.code}`).row();
  });

  const nav: Array<[string, string]> = [];
  if (page > 1)          nav.push(['⬅', `pl:${page - 1}`]);
  nav.push([`${page}/${totalPages}`, `pl:${page}`]);
  if (page < totalPages) nav.push(['➡', `pl:${page + 1}`]);
  nav.forEach(([label, cb]) => kb.text(label, cb));
  kb.row();

  return kb.text('🏠 Меню', 'menu');
}

export function promoDetailKb(code: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗑 Удалить', `dp:${code}`)
    .text('⬅ Список', 'pl:1');
}

export function userKb(userId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📦 Изменить план', `plan_menu:${userId}`)
    .text('🔄 Сбросить лимиты', `rl:${userId}`)
    .row()
    .text('➕ Caspers', `caspers_add:${userId}`)
    .text('➖ Caspers', `caspers_sub:${userId}`)
    .row()
    .text('🚫 Бан', `ban:${userId}`)
    .text('✅ Разбан', `unban:${userId}`)
    .row()
    .text('⬅ Список', 'ul:1')
    .text('🏠 Меню', 'menu');
}

export function planKb(userId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  PLAN_KEYS.forEach((p, i) => {
    kb.text(`${PLAN_ICON[p]} ${p}`, `sp:${userId}:${p}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text('⬅ Назад', `u:${userId}`);
}

export function userListKb(data: any, page: number): InlineKeyboard {
  const users: any[] = data.users ?? [];
  const total        = data.total ?? 0;
  const limit        = data.limit ?? 8;
  const totalPages   = Math.max(1, Math.ceil(total / limit));
  const kb           = new InlineKeyboard();

  // сетка в 2 колонки
  users.forEach((u: any, i: number) => {
    const banned = u.isBanned ? '🚫 ' : '';
    const label  = banned + (u.name ?? 'Без имени').slice(0, 13);
    kb.text(label, `u:${u.id}`);
    if (i % 2 === 1) kb.row();
  });
  if (users.length % 2 !== 0) kb.row();

  // Навигация + подсказка поиска
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

export function serverKb(): InlineKeyboard {
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
