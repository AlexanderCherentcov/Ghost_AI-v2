-- Migration: id задачи у провайдера на GenerateJob (сейчас проставляется только
-- для Suno) — нужен для Audio Recovery API, если Suno снова начнёт отдавать
-- нерабочие/зашифрованные аудио-ссылки без явной HTTP-ошибки на генерации.

ALTER TABLE "GenerateJob" ADD COLUMN "providerTaskId" TEXT;
