-- Migration: Promo codes (Caspers grants + plan discounts)

-- ─── Step 1: Reward type enum ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PromoRewardType" AS ENUM ('CASPERS', 'DISCOUNT_PERCENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Step 2: PromoCode ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PromoCode" (
  "id"              TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "rewardType"      "PromoRewardType" NOT NULL,
  "casperAmount"    INTEGER,
  "discountPercent" INTEGER,
  "applicablePlans" "Plan"[] NOT NULL DEFAULT ARRAY[]::"Plan"[],
  "maxUses"         INTEGER,
  "usesCount"       INTEGER NOT NULL DEFAULT 0,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"       TIMESTAMP(3),
  "createdBy"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX IF NOT EXISTS "PromoCode_code_idx" ON "PromoCode"("code");

-- ─── Step 3: PromoRedemption ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PromoRedemption" (
  "id"              TEXT NOT NULL,
  "promoCodeId"     TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "codeSnapshot"    TEXT NOT NULL,
  "rewardType"      "PromoRewardType" NOT NULL,
  "casperAmount"    INTEGER,
  "discountPercent" INTEGER,
  "paymentId"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoRedemption_promoCodeId_userId_key" ON "PromoRedemption"("promoCodeId", "userId");
CREATE INDEX IF NOT EXISTS "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");
CREATE INDEX IF NOT EXISTS "PromoRedemption_paymentId_idx" ON "PromoRedemption"("paymentId");

DO $$ BEGIN
  ALTER TABLE "PromoRedemption"
    ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PromoRedemption"
    ADD CONSTRAINT "PromoRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
