-- GuardianX — Add 2FA + Portal columns to User table
-- Run in Supabase SQL Editor

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twofaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twofaEnabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "backupCodes" TEXT;

-- Grant permissions
GRANT ALL ON "User" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO anon, authenticated;
