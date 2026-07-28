-- Migration: track user acceptance of Terms of Use / Privacy Policy

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
