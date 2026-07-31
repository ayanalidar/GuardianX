-- =====================================================================
-- GuardianX — Autonomous Security Operations Platform
-- Supabase Schema Initialization (PostgreSQL)
-- ---------------------------------------------------------------------
-- Run this entire script ONCE in:
--   Supabase Dashboard → SQL Editor → New Query → paste → Run
--
-- This creates all 25 tables used by GuardianX, plus an `exec_sql`
-- helper function (so the /api/db-init endpoint can seed demo data),
-- and disables RLS for the service_role (which has bypass privileges
-- by default in Supabase — this is intentional for our backend API).
-- =====================================================================

-- ---------- 0. Helper function: exec_sql(text) ------------------------
-- Allows the backend (via service_role) to run arbitrary DDL/DML.
-- SECURITY: Only the service_role bypasses RLS, so this function is
-- safe to expose via PostgREST. anon/authenticated keys cannot call it
-- because we wrap it in SECURITY DEFINER + grant only to service_role.
CREATE OR REPLACE FUNCTION public.exec_sql(sql_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

-- ---------- 1. User --------------------------------------------------
CREATE TABLE IF NOT EXISTS "User" (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer',
  avatar      TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 2. Codebase ---------------------------------------------
CREATE TABLE IF NOT EXISTS "Codebase" (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'javascript',
  description TEXT,
  "sourceCode" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. Scan --------------------------------------------------
CREATE TABLE IF NOT EXISTS "Scan" (
  id           TEXT PRIMARY KEY,
  "codebaseId" TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  "stageLabel" TEXT,
  "startedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);

-- ---------- 4. Patch -------------------------------------------------
CREATE TABLE IF NOT EXISTS "Patch" (
  id                     TEXT PRIMARY KEY,
  "patchId"              TEXT UNIQUE NOT NULL,
  "codebaseId"           TEXT NOT NULL,
  "scanId"               TEXT NOT NULL,
  title                  TEXT NOT NULL,
  severity               TEXT,
  cve                    TEXT,
  "affectedFile"         TEXT,
  "aiExplanation"        TEXT,
  "aiReasoning"          TEXT,
  confidence             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "originalCode"         TEXT,
  "patchedCode"          TEXT,
  "diffPayload"          TEXT,
  "testCode"             TEXT,
  "sandboxLogs"          TEXT,
  "sandboxPassed"        BOOLEAN NOT NULL DEFAULT FALSE,
  "exploitCode"          TEXT,
  "exploitOriginalResult" TEXT,
  "exploitPatchedResult"  TEXT,
  "adversarialRounds"    INTEGER NOT NULL DEFAULT 0,
  "adversarialWon"       BOOLEAN NOT NULL DEFAULT FALSE,
  "adversarialTranscript" TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "approvedAt"           TIMESTAMPTZ
);

-- ---------- 5. PipelineEvent ----------------------------------------
CREATE TABLE IF NOT EXISTS "PipelineEvent" (
  id         TEXT PRIMARY KEY,
  "scanId"   TEXT NOT NULL,
  stage      TEXT,
  message    TEXT,
  level      TEXT NOT NULL DEFAULT 'info',
  meta       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 6. ChatMessage ------------------------------------------
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  id         TEXT PRIMARY KEY,
  "patchId"  TEXT NOT NULL,
  role       TEXT,
  content    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 7. Credential -------------------------------------------
CREATE TABLE IF NOT EXISTS "Credential" (
  id            TEXT PRIMARY KEY,
  label         TEXT,
  kind          TEXT,
  target        TEXT,
  username      TEXT,
  "secretCipher" TEXT,
  "secretIv"    TEXT,
  "secretTag"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastUsedAt"  TIMESTAMPTZ
);

-- ---------- 8. CredentialAudit -------------------------------------
CREATE TABLE IF NOT EXISTS "CredentialAudit" (
  id            TEXT PRIMARY KEY,
  "credentialId" TEXT NOT NULL,
  action        TEXT,
  context       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 9. Target ----------------------------------------------
CREATE TABLE IF NOT EXISTS "Target" (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  "baseUrl"  TEXT,
  "authHeader" TEXT,
  notes      TEXT,
  authorized BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 10. Engagement -----------------------------------------
CREATE TABLE IF NOT EXISTS "Engagement" (
  id          TEXT PRIMARY KEY,
  "targetId"  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  "stageLabel" TEXT,
  "crawlSummary" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);

-- ---------- 11. Finding --------------------------------------------
CREATE TABLE IF NOT EXISTS "Finding" (
  id             TEXT PRIMARY KEY,
  "engagementId" TEXT NOT NULL,
  title          TEXT,
  severity       TEXT,
  category       TEXT,
  owasp          TEXT,
  endpoint       TEXT,
  method         TEXT,
  description    TEXT,
  "proofRequest" TEXT,
  "proofResponse" TEXT,
  payload        TEXT,
  confidence     DOUBLE PRECISION NOT NULL DEFAULT 0,
  remediation    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 12. RedAgentEvent --------------------------------------
CREATE TABLE IF NOT EXISTS "RedAgentEvent" (
  id             TEXT PRIMARY KEY,
  "engagementId" TEXT NOT NULL,
  stage          TEXT,
  message        TEXT,
  level          TEXT NOT NULL DEFAULT 'info',
  meta           TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 13. Attestation ----------------------------------------
CREATE TABLE IF NOT EXISTS "Attestation" (
  id         TEXT PRIMARY KEY,
  "patchId"  TEXT UNIQUE NOT NULL,
  "prevHash" TEXT,
  hash       TEXT,
  data       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 14. Canary ---------------------------------------------
CREATE TABLE IF NOT EXISTS "Canary" (
  id                TEXT PRIMARY KEY,
  "targetId"        TEXT,
  label             TEXT,
  "canaryType"      TEXT,
  "canaryValue"     TEXT UNIQUE,
  "injectedEndpoint" TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  detected          BOOLEAN NOT NULL DEFAULT FALSE,
  "detectedAt"      TIMESTAMPTZ,
  "detectedOn"      TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 15. ApiAccessLog ---------------------------------------
CREATE TABLE IF NOT EXISTS "ApiAccessLog" (
  id            TEXT PRIMARY KEY,
  "targetId"    TEXT,
  "ipAddress"   TEXT,
  method        TEXT,
  endpoint      TEXT,
  "statusCode"  INTEGER,
  "userAgent"   TEXT,
  "responseSize" INTEGER,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 16. HoneypotHit ----------------------------------------
CREATE TABLE IF NOT EXISTS "HoneypotHit" (
  id         TEXT PRIMARY KEY,
  "targetId" TEXT,
  endpoint   TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  method     TEXT,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 17. WebhookConfig --------------------------------------
CREATE TABLE IF NOT EXISTS "WebhookConfig" (
  id        TEXT PRIMARY KEY,
  name      TEXT,
  url       TEXT,
  events    TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  secret    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 18. ScheduledScan --------------------------------------
CREATE TABLE IF NOT EXISTS "ScheduledScan" (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  "scanType"  TEXT,
  "targetId"  TEXT,
  "codebaseId" TEXT,
  "cronExpr"  TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "lastRunAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 19. AlertRule ------------------------------------------
CREATE TABLE IF NOT EXISTS "AlertRule" (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  condition       TEXT,
  channel         TEXT,
  "channelConfig" TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "lastTriggered" TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 20. AuditLog -------------------------------------------
CREATE TABLE IF NOT EXISTS "AuditLog" (
  id         TEXT PRIMARY KEY,
  action     TEXT,
  entity     TEXT,
  actor      TEXT NOT NULL DEFAULT 'system',
  details    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 21. Organization ---------------------------------------
CREATE TABLE IF NOT EXISTS "Organization" (
  id        TEXT PRIMARY KEY,
  name      TEXT,
  slug      TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 22. TeamMember -----------------------------------------
CREATE TABLE IF NOT EXISTS "TeamMember" (
  id         TEXT PRIMARY KEY,
  "orgId"    TEXT NOT NULL,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'viewer',
  "invitedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "joinedAt" TIMESTAMPTZ
);

-- ---------- 23. AttackChain ----------------------------------------
CREATE TABLE IF NOT EXISTS "AttackChain" (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  description TEXT,
  severity    TEXT,
  steps       TEXT,
  "findingIds" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 24. Integration ----------------------------------------
CREATE TABLE IF NOT EXISTS "Integration" (
  id        TEXT PRIMARY KEY,
  type      TEXT,
  config    TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 25. FuzzResult -----------------------------------------
CREATE TABLE IF NOT EXISTS "FuzzResult" (
  id              TEXT PRIMARY KEY,
  "targetUrl"     TEXT,
  endpoint        TEXT,
  method          TEXT,
  "totalRequests" INTEGER,
  crashes         INTEGER,
  errors          INTEGER,
  anomalies       TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Indexes for common lookups ------------------------------
CREATE INDEX IF NOT EXISTS idx_user_email        ON "User"(email);
CREATE INDEX IF NOT EXISTS idx_scan_codebase     ON "Scan"("codebaseId");
CREATE INDEX IF NOT EXISTS idx_patch_codebase    ON "Patch"("codebaseId");
CREATE INDEX IF NOT EXISTS idx_patch_scan        ON "Patch"("scanId");
CREATE INDEX IF NOT EXISTS idx_patch_status      ON "Patch"(status);
CREATE INDEX IF NOT EXISTS idx_pe_scan           ON "PipelineEvent"("scanId");
CREATE INDEX IF NOT EXISTS idx_chat_patch        ON "ChatMessage"("patchId");
CREATE INDEX IF NOT EXISTS idx_cred_target       ON "Credential"(target);
CREATE INDEX IF NOT EXISTS idx_ca_cred           ON "CredentialAudit"("credentialId");
CREATE INDEX IF NOT EXISTS idx_eng_target        ON "Engagement"("targetId");
CREATE INDEX IF NOT EXISTS idx_find_eng          ON "Finding"("engagementId");
CREATE INDEX IF NOT EXISTS idx_rae_eng           ON "RedAgentEvent"("engagementId");
CREATE INDEX IF NOT EXISTS idx_att_patch         ON "Attestation"("patchId");
CREATE INDEX IF NOT EXISTS idx_canary_target     ON "Canary"("targetId");
CREATE INDEX IF NOT EXISTS idx_al_target         ON "ApiAccessLog"("targetId");
CREATE INDEX IF NOT EXISTS idx_hp_target         ON "HoneypotHit"("targetId");
CREATE INDEX IF NOT EXISTS idx_ss_next           ON "ScheduledScan"("nextRunAt");
CREATE INDEX IF NOT EXISTS idx_alog_created      ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS idx_tm_org            ON "TeamMember"("orgId");

-- ---------- Row-Level Security -------------------------------------
-- Service role bypasses RLS automatically, so all backend API calls
-- (which use the service_role key) have full access without policies.
-- We still enable RLS so anon/authenticated keys are blocked from
-- direct table access — forcing all reads/writes through our API.
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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Done. Verify with:
--   SELECT count(*) FROM "User";  -- should return 0
-- =====================================================================
