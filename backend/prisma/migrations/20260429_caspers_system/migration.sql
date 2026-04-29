-- Migration: Caspers token system
-- Replaces old limit-based system with Caspers balance system
-- Migrates plan enum: TRIAL→FREE, STANDARD→PRO, TEAM→ULTRA

-- ─── Step 1: Add new Plan enum values ─────────────────────────────────────────
-- PostgreSQL enums require ALTER TYPE to add values

ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'VIP';

-- ─── Step 2: Migrate existing users to new plan names ─────────────────────────
-- TRIAL → FREE (trial users become free)
UPDATE "User" SET plan = 'FREE'::"Plan" WHERE plan = 'TRIAL'::"Plan";
-- STANDARD → PRO
UPDATE "User" SET plan = 'PRO'::"Plan" WHERE plan = 'STANDARD'::"Plan";
-- TEAM → ULTRA
UPDATE "User" SET plan = 'ULTRA'::"Plan" WHERE plan = 'TEAM'::"Plan";

-- Also migrate Payment table plan references
UPDATE "Payment" SET plan = 'FREE'::"Plan" WHERE plan = 'TRIAL'::"Plan";
UPDATE "Payment" SET plan = 'PRO'::"Plan" WHERE plan = 'STANDARD'::"Plan";
UPDATE "Payment" SET plan = 'ULTRA'::"Plan" WHERE plan = 'TEAM'::"Plan";

-- ─── Step 3: Add new columns to User ─────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "caspers_balance"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "caspers_monthly"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "images_this_week" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "music_this_week"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "videos_this_week" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "week_start"       TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- ─── Step 4: Drop old limit/counter columns from User ─────────────────────────
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "std_messages_daily_limit",
  DROP COLUMN IF EXISTS "pro_messages_daily_limit",
  DROP COLUMN IF EXISTS "images_daily_limit",
  DROP COLUMN IF EXISTS "videos_daily_limit",
  DROP COLUMN IF EXISTS "music_daily_limit",
  DROP COLUMN IF EXISTS "files_monthly_limit",
  DROP COLUMN IF EXISTS "images_today",
  DROP COLUMN IF EXISTS "videos_today",
  DROP COLUMN IF EXISTS "music_today",
  DROP COLUMN IF EXISTS "files_used";

-- ─── Step 5: Add new columns to Payment ──────────────────────────────────────
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "paymentType"  TEXT NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS "casperAmount" INTEGER;

-- ─── Step 6: Create CasperTransaction table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "CasperTransaction" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "amount"    INTEGER NOT NULL,
  "reason"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CasperTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CasperTransaction_userId_createdAt_idx"
  ON "CasperTransaction"("userId", "createdAt");

ALTER TABLE "CasperTransaction"
  ADD CONSTRAINT "CasperTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Step 7: Remove old Plan enum values (requires recreating the type) ────────
-- PostgreSQL doesn't support DROP VALUE from enum, so we recreate it:

-- Create new enum type
CREATE TYPE "Plan_new" AS ENUM ('FREE', 'BASIC', 'PRO', 'VIP', 'ULTRA');

-- Update User column
ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "plan" TYPE "Plan_new" USING (plan::text::"Plan_new");
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE'::"Plan_new";

-- Update Payment column
ALTER TABLE "Payment" ALTER COLUMN "plan" TYPE "Plan_new" USING (plan::text::"Plan_new");

-- Drop old type and rename new
DROP TYPE "Plan";
ALTER TYPE "Plan_new" RENAME TO "Plan";
