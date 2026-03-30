-- Update video_daily_limit for existing paid users based on their current plan
-- Standard: 5 -> 1, Pro: 15 -> 3, Ultra: 40 -> 5

UPDATE "User" SET "videos_daily_limit" = 1 WHERE "plan" = 'STANDARD' AND "videos_daily_limit" = 5;
UPDATE "User" SET "videos_daily_limit" = 3 WHERE "plan" = 'PRO'      AND "videos_daily_limit" = 15;
UPDATE "User" SET "videos_daily_limit" = 5 WHERE "plan" = 'ULTRA'    AND "videos_daily_limit" = 40;
