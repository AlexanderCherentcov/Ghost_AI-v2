-- Migration: new_counter_schema
-- Replaces monthly/daily mixed counter system with unified daily counters.
-- Adds separate std/pro message counters, daily images/videos, Billing enum.

-- ─── Create Billing enum ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "Billing" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Add new User columns ─────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "billing"                  "Billing"    NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "std_messages_today"       INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pro_messages_today"       INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "images_today"             INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "videos_today"             INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "files_used"               INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "std_messages_daily_limit" INTEGER      NOT NULL DEFAULT 10;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pro_messages_daily_limit" INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "images_daily_limit"       INTEGER      NOT NULL DEFAULT 3;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "videos_daily_limit"       INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "files_monthly_limit"      INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "day_start"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "period_start"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── Migrate data from old columns ───────────────────────────────────────────
-- Copy daily counters: messagesToday → std_messages_today
UPDATE "User" SET "std_messages_today" = COALESCE("messagesToday", 0) WHERE "messagesToday" IS NOT NULL;
-- Copy day/period start timestamps
UPDATE "User" SET "day_start"    = COALESCE("dayStart",     CURRENT_TIMESTAMP);
UPDATE "User" SET "period_start" = COALESCE("periodStart",  CURRENT_TIMESTAMP);
-- Copy file counter
UPDATE "User" SET "files_used"          = COALESCE("filesUsed",   0);
-- Migrate image counter: imagesUsed → images_today (now daily)
UPDATE "User" SET "images_today"        = COALESCE("imagesUsed",  0);
-- Migrate video counter: videoUsed → videos_today (now daily)
UPDATE "User" SET "videos_today"        = COALESCE("videoUsed",   0);
-- Migrate limits
UPDATE "User" SET "images_daily_limit"  = COALESCE("imagesLimit", 3);
UPDATE "User" SET "videos_daily_limit"  = COALESCE("videoLimit",  0);
UPDATE "User" SET "files_monthly_limit" = COALESCE("filesLimit",  0);
-- Migrate message limits:
--   messagesLimit = -1 (daily mode) → std_messages_daily_limit stays at 10 (FREE default)
--   messagesLimit > 0 (monthly mode, BASIC/STANDARD) → treat as daily unlimited (-1)
UPDATE "User"
  SET "std_messages_daily_limit" = CASE
    WHEN "messagesLimit" > 0 THEN -1
    ELSE 10
  END;

-- ─── Drop old User columns ────────────────────────────────────────────────────
ALTER TABLE "User" DROP COLUMN IF EXISTS "messagesUsed";
ALTER TABLE "User" DROP COLUMN IF EXISTS "filesUsed";
ALTER TABLE "User" DROP COLUMN IF EXISTS "imagesUsed";
ALTER TABLE "User" DROP COLUMN IF EXISTS "videoUsed";
ALTER TABLE "User" DROP COLUMN IF EXISTS "messagesToday";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dayStart";
ALTER TABLE "User" DROP COLUMN IF EXISTS "messagesLimit";
ALTER TABLE "User" DROP COLUMN IF EXISTS "filesLimit";
ALTER TABLE "User" DROP COLUMN IF EXISTS "imagesLimit";
ALTER TABLE "User" DROP COLUMN IF EXISTS "videoLimit";
ALTER TABLE "User" DROP COLUMN IF EXISTS "periodStart";
