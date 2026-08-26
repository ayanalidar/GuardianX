-- GuardianX — Email verification on signup
-- Run in Supabase SQL Editor

-- Email verification token table (same pattern as PasswordReset)
CREATE TABLE IF NOT EXISTS "EmailVerification" (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt"    TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- emailVerified flag on User (default false; must verify before login)
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes for token + user lookup
CREATE INDEX IF NOT EXISTS idx_emailverification_userid ON "EmailVerification"("userId");
CREATE INDEX IF NOT EXISTS idx_emailverification_token ON "EmailVerification"(token);

-- Grants + disable RLS (service_role full, anon/authenticated CRUD)
GRANT ALL ON "EmailVerification" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailVerification" TO anon, authenticated;
ALTER TABLE IF EXISTS "EmailVerification" DISABLE ROW LEVEL SECURITY;
