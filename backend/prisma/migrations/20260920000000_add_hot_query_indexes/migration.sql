-- Индексы под тяжёлые запросы, найденные аудитом перед запуском (сейчас таблицы маленькие,
-- на сотнях тысяч строк без них были бы seq scan'ы):
--  * Message(createdAt)        — суточная очистка по TTL и счётчики /admin/stats
--  * GenerateJob(createdAt)    — очистка по TTL
--  * GenerateJob(userId,mode,status) — findActiveJob на КАЖДУЮ генерацию
--  * Payment(status,createdAt) — агрегаты выручки
--  * CasperTransaction(createdAt) — статистика/очистка
--  * GalleryItem(status,createdAt) — сортировка «новые» (индекс [status,likesCount] её не покрывает)
-- IF NOT EXISTS — миграция безопасна при повторном применении.

CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
CREATE INDEX IF NOT EXISTS "GenerateJob_createdAt_idx" ON "GenerateJob"("createdAt");
CREATE INDEX IF NOT EXISTS "GenerateJob_userId_mode_status_idx" ON "GenerateJob"("userId", "mode", "status");
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CasperTransaction_createdAt_idx" ON "CasperTransaction"("createdAt");
CREATE INDEX IF NOT EXISTS "GalleryItem_status_createdAt_idx" ON "GalleryItem"("status", "createdAt");
