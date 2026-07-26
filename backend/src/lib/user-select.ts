// Общий фрагмент Prisma select для счётчиков использования/Caspers пользователя.
// Раньше этот набор полей был независимо продублирован в routes/admin.ts,
// routes/auth.ts (/me) и routes/support.ts — при добавлении нового счётчика
// (как уже было с month_start, который не попал в admin.ts/support.ts)
// приходилось вручную помнить обновить все места. Остальные поля (avatarUrl,
// telegramId, purposes и т.п.) у каждого эндпоинта свои — их сюда не тащим,
// это не общий контракт, а разный набор данных для разных потребителей.
export const USAGE_COUNTERS_SELECT = {
  caspers_balance:    true,
  caspers_monthly:    true,
  std_messages_today: true,
  pro_messages_today: true,
  images_this_week:   true,
  music_this_week:    true,
  videos_this_month:  true,
} as const;
