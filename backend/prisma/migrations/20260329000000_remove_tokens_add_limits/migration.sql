-- Migration: remove_tokens_add_limits
-- Replaces token/addon system with simple counter-based limit system

-- ─── Add new Plan enum values (BASIC, STANDARD) ──────────────────────────────
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'BASIC';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'STANDARD';

-- ─── Drop old User columns ────────────────────────────────────────────────────
ALTER TABLE "User" DROP COLUMN IF EXISTS "tokenBalance";
ALTER TABLE "User" DROP COLUMN IF EXISTS "balanceMessages";
ALTER TABLE "User" DROP COLUMN IF EXISTS "balanceImages";
ALTER TABLE "User" DROP COLUMN IF EXISTS "addonMessages";
ALTER TABLE "User" DROP COLUMN IF EXISTS "addonImages";
ALTER TABLE "User" DROP COLUMN IF EXISTS "trialExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "freeDailyMsgsReset";
ALTER TABLE "User" DROP COLUMN IF EXISTS "freeMonthlyImgsReset";

-- ─── Add new User counter/limit columns ──────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "messagesUsed"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "filesUsed"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imagesUsed"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "videoUsed"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "messagesToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dayStart"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "messagesLimit" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "filesLimit"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imagesLimit"   INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "videoLimit"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "periodStart"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── Add fileName to Message ──────────────────────────────────────────────────
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "fileName" TEXT;

-- ─── Drop old Payment columns ─────────────────────────────────────────────────
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "tokensGranted";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "addonType";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "addonAmount";

-- ─── Drop type column from Payment (replace with plan-only) ──────────────────
-- The old "type" column used PaymentType enum; new schema only has plan
-- We can't drop the column if there are NOT NULL constraints, so alter first
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "type";

-- ─── Drop old enums ───────────────────────────────────────────────────────────
DROP TYPE IF EXISTS "TxType";
DROP TYPE IF EXISTS "PaymentType";

-- ─── Drop TokenTransaction table ─────────────────────────────────────────────
DROP TABLE IF EXISTS "TokenTransaction";

-- ─── Create UserImageRequest table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserImageRequest" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserImageRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserImageRequest_userId_promptHash_key"
    ON "UserImageRequest"("userId", "promptHash");
CREATE INDEX IF NOT EXISTS "UserImageRequest_promptHash_idx"
    ON "UserImageRequest"("promptHash");

ALTER TABLE "UserImageRequest"
    ADD CONSTRAINT "UserImageRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
