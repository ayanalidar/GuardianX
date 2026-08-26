-- GuardianX — Add tokenVersion column to User for global session revocation.
--
-- DPDPA § 11 (Right to Erasure) requires revoking all sessions when an
-- account is deleted/anonymized. The tokenVersion column, embedded in the
-- JWT at login, lets the auth layer reject stale tokens after a password
-- reset, break-glass admin action, or account deletion.
--
-- Migration: 0008_token_version
-- Backward compatible: defaults to 0, existing tokens implicitly use v0.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER DEFAULT 0;

-- Grant permissions (consistent with prior migrations)
GRANT ALL ON "User" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO anon, authenticated;
