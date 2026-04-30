-- Rename videos_this_week → videos_this_month (FREE tier now monthly, not weekly)
-- Add month_start timestamp for monthly video counter reset

ALTER TABLE "User"
  RENAME COLUMN "videos_this_week" TO "videos_this_month";

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "month_start" TIMESTAMP(3) NOT NULL DEFAULT NOW();
