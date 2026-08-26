-- GuardianX — TOTP 2FA columns on User table (Task #6-2fa-totp)
--
-- These are the canonical column names used by the new /api/auth/2fa/*
-- endpoints (setup / verify / disable / login). An earlier migration
-- (0004_2fa_columns.sql) added `twofaSecret` / `twofaEnabled` / `backupCodes`
-- for the legacy `/api/2fa` route; those columns are left in place for
-- backward compatibility but the new TOTP flow uses the camelCased names
-- below so they line up with the Prisma schema (`twoFactorSecret`,
-- `twoFactorEnabled`).
--
-- Run in Supabase SQL Editor (or via POST /api/db-init which embeds the same
-- ALTER TABLE statements).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

-- Permissions (User table is already public-by-default from 0001_init.sql,
-- but re-stating here keeps this migration idempotent / self-contained).
GRANT ALL ON "User" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO anon, authenticated;
