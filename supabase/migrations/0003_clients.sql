-- =====================================================================
-- GuardianX — Client-Centric Pipeline Schema
-- ---------------------------------------------------------------------
-- Adds the Client model + clientId foreign keys to Codebase and Target
-- so every asset (codebase, target), scan, engagement, patch, finding,
-- canary, and credential can be grouped by client.
--
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
-- =====================================================================

-- ---------- 1. Client table ------------------------------------------
CREATE TABLE IF NOT EXISTS "Client" (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "targetUrl"   TEXT,
  "repoUrl"     TEXT,
  scope         TEXT,
  authorized    BOOLEAN NOT NULL DEFAULT FALSE,
  frameworks    TEXT,
  status        TEXT NOT NULL DEFAULT 'onboarding',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_name ON "Client"(name);
CREATE INDEX IF NOT EXISTS idx_client_status ON "Client"(status);

-- ---------- 2. Add clientId to Codebase + Target --------------------
ALTER TABLE "Codebase" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Target" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS idx_codebase_client ON "Codebase"("clientId");
CREATE INDEX IF NOT EXISTS idx_target_client ON "Target"("clientId");

-- ---------- 3. Grants + RLS (consistent with 0002_fix_permissions) --
GRANT ALL ON "Client" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Client" TO anon, authenticated;
ALTER TABLE "Client" DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Done. The /api/clients endpoints will auto-generate IDs (the db.ts
-- dispatcher's create() method handles this).
-- =====================================================================
