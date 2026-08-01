-- GuardianX — Add approval workflow column
-- Run in Supabase SQL Editor

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN DEFAULT FALSE;

-- Grant permissions
GRANT ALL ON "User" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO anon, authenticated;
