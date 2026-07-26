// Форматирование текстовых сообщений админ-бота — вынесено из admin-bot.ts,
// чтобы файл с командами не смешивал регистрацию хендлеров с версткой текста.
import { api } from './admin-api.js';

export const PLAN_ICON: Record<string, string> = {
  FREE: '🆓', BASIC: '⭐', PRO: '🚀', VIP: '💎', ULTRA: '🔥',
};

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtUser(u: any): string {
  const plan    = `${PLAN_ICON[u.plan] ?? '?'} <b>${u.plan}</b>`;
  const expires = u.planExpiresAt
    ? `\n⏰ Подписка до: ${new Date(u.planExpiresAt).toLocaleDateString('ru')}`
    : '';
  const tg      = u.telegramId ? `\n📱 TG ID: <code>${u.telegramId}</code>` : '';
  const email   = u.email ? `\n📧 ${u.email}` : '';
  const banned  = u.isBanned ? '\n🚫 <b>ЗАБАНЕН</b>' : '';
  const billing = u.billing ? ` (${u.billing})` : '';

  return (
    `👤 <b>${esc(u.name ?? 'Без имени')}</b>${banned}\n` +
    `🆔 <code>${u.id}</code>${tg}${email}\n` +
    `📅 Зарегистрирован: ${new Date(u.createdAt).toLocaleDateString('ru')}\n` +
    `📦 План: ${plan}${billing}${expires}\n\n` +
    `👻 <b>Caspers:</b> ${u.caspers_balance ?? 0} (месячных: ${u.caspers_monthly ?? 0})\n\n` +
    `📊 <b>Активность сегодня:</b>\n` +
    `💬 Чат (стд): ${u.std_messages_today ?? 0}\n` +
    `🧠 Чат (про): ${u.pro_messages_today ?? 0}\n` +
    `🖼 Картинки (нед): ${u.images_this_week ?? 0}\n` +
    `🎵 Музыка (нед): ${u.music_this_week ?? 0}\n` +
    `🎬 Видео (мес): ${u.videos_this_month ?? 0}`
  );
}

export function fmtUserList(data: any, page: number): string {
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

export function fmtStats(s: any): string {
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

export async function quickStats(): Promise<string> {
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

export function fmtHealth(statuses: Record<string, string>): string {
  const icon = (s: string) => s === 'running' ? '🟢' : s === 'missing' ? '⚫' : '🔴';
  const lines = Object.entries(statuses)
    .map(([svc, s]) => `${icon(s)} <b>${svc}</b>: ${s}`);
  return `🏥 <b>Состояние сервисов</b>\n\n${lines.join('\n')}`;
}

// ─── Промокоды ────────────────────────────────────────────────────────────────

export function fmtPromoShort(p: any): string {
  const reward = p.rewardType === 'CASPERS'
    ? `👻 ${p.casperAmount} Caspers`
    : `🎟 −${p.discountPercent}%`;
  const uses = `${p.usesCount}/${p.maxUses ?? '∞'}`;
  const status = !p.active ? '🚫' : (p.expiresAt && new Date(p.expiresAt) < new Date()) ? '⏰' : '🟢';
  return `${status} <code>${esc(p.code)}</code> — ${reward} · исп: ${uses}`;
}

export function fmtPromoDetail(p: any, redemptions: any[]): string {
  const reward = p.rewardType === 'CASPERS'
    ? `👻 <b>${p.casperAmount} Caspers</b> за активацию`
    : `🎟 <b>Скидка ${p.discountPercent}%</b> на ${p.applicablePlans.length ? p.applicablePlans.join(', ') : 'все тарифы'}`;
  const status = !p.active ? '🚫 Деактивирован' : (p.expiresAt && new Date(p.expiresAt) < new Date()) ? '⏰ Истёк' : '🟢 Активен';
  const expires = p.expiresAt ? `\n⏰ До: ${new Date(p.expiresAt).toLocaleDateString('ru')}` : '';
  const creator = p.createdBy ? `\n👤 Создал: <code>${esc(p.createdBy)}</code>` : '';

  let text =
    `🎫 <b>${esc(p.code)}</b>\n\n` +
    `${reward}\n` +
    `${status}\n` +
    `📊 Использований: <b>${p.usesCount}${p.maxUses ? `/${p.maxUses}` : ' (без лимита)'}</b>${expires}${creator}\n\n`;

  if (redemptions.length === 0) {
    text += '<i>Пока никто не использовал.</i>';
  } else {
    text += `👥 <b>Кто использовал (${redemptions.length}):</b>\n`;
    text += redemptions.slice(0, 20).map((r: any) => {
      const u = r.user;
      const name = esc(u?.name ?? 'Без имени');
      const tg = u?.telegramId ? ` · TG:${u.telegramId}` : '';
      const date = new Date(r.createdAt).toLocaleDateString('ru');
      return `• ${name}${tg} — ${date}`;
    }).join('\n');
    if (redemptions.length > 20) text += `\n<i>...и ещё ${redemptions.length - 20}</i>`;
  }
  return text;
}
