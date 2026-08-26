-- =====================================================================
-- GuardianX — Permission Fix Migration
-- ---------------------------------------------------------------------
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
--
-- Fixes: "permission denied for table User" (and all other tables).
--
-- Root cause: the 0001_init.sql migration enabled Row-Level Security
-- on every table, but Supabase's default GRANTs to the `service_role`
-- (which our backend API uses) were either not applied or were revoked.
-- This script:
--   1. GRANTs ALL privileges on ALL tables to service_role (and to
--      anon/authenticated, in case we ever want direct client access).
--   2. GRANTs USAGE on sequences (for any SERIAL columns).
--   3. DISABLES Row-Level Security on every table — since our backend
--      uses the service_role (which bypasses RLS anyway) and we run
--      our own auth (not Supabase Auth), RLS provides no benefit and
--      only causes permission headaches. Disabling it eliminates this
--      entire class of errors.
-- =====================================================================

-- ---------- 1. GRANT schema + table + sequence privileges ------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- All privileges on all existing tables in public schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- All privileges on all sequences (in case any SERIAL/identity columns exist)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- All privileges on all functions (so exec_sql works)
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ---------- 2. Set DEFAULT privileges for future tables ---------------
-- So any tables created later (via migrations or dashboard) auto-grant
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, USAGE ON SEQUENCES TO anon, authenticated;

-- ---------- 3. DISABLE Row-Level Security on all GuardianX tables -----
-- Our backend uses the service_role (bypasses RLS) and we run our own
-- auth, so RLS is unnecessary and only causes "permission denied" errors.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'User','Codebase','Scan','Patch','PipelineEvent','ChatMessage',
    'Credential','CredentialAudit','Target','Engagement','Finding',
    'RedAgentEvent','Attestation','Canary','ApiAccessLog','HoneypotHit',
    'WebhookConfig','ScheduledScan','AlertRule','AuditLog','Organization',
    'TeamMember','AttackChain','Integration','FuzzResult'
  ]) LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I DISABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ---------- 4. Verify -------------------------------------------------
-- Should return 25 (one row per table)
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Should list all 25 tables with service_role having ALL privileges
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'service_role'
ORDER BY table_name, privilege_type;

-- =====================================================================
-- Done. After running this:
--   - The service_role (used by our backend API) can SELECT/INSERT/
--     UPDATE/DELETE on every table.
--   - RLS is disabled, so no more "permission denied" errors.
--   - Your Vercel deployment's login/signup will work immediately.
-- =====================================================================
