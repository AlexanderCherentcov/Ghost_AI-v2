-- Migration: фиксируем billing/promoCode на Payment в момент создания платежа,
-- а не читаем их из тела вебхука ЮKassa (не подписано, подделываемо клиентом).

ALTER TABLE "Payment" ADD COLUMN "billing" "Billing";
ALTER TABLE "Payment" ADD COLUMN "promoCode" TEXT;
