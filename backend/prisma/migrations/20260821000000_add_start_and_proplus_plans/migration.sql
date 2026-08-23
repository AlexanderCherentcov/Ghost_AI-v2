-- ─── Add new Plan enum values (START, PRO_PLUS) ───────────────────────────────
-- Заполняют дыры в лестнице тарифов: START — дешёвый вход между FREE и BASIC
-- (у конкурентов есть варианты за 138-990₽, у нас раньше был скачок 0₽→790₽);
-- PRO_PLUS — сглаживает самый большой относительный скачок в линейке (PRO→VIP,
-- 1690₽→3990₽, почти ×2.4). PostgreSQL enum требует ALTER TYPE для добавления
-- значений — тот же паттерн, что уже использовался для BASIC/STANDARD/VIP.

ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'START';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'PRO_PLUS';
