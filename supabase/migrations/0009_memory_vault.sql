-- =====================================================================
-- GuardianX — AI Memory Vault
-- ---------------------------------------------------------------------
-- Stores structured "memories" for the Guardian AI assistant so it can
-- recall recent scans, findings, patches, user preferences, and
-- conversations when composing replies in the chat.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "MemoryEntry" (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot lookups: a user's recent memories + per-category slices.
CREATE INDEX IF NOT EXISTS idx_mem_user_created ON "MemoryEntry"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_mem_user_category ON "MemoryEntry"("userId", category, "createdAt" DESC);

GRANT ALL ON "MemoryEntry" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemoryEntry" TO anon, authenticated;
ALTER TABLE IF EXISTS "MemoryEntry" DISABLE ROW LEVEL SECURITY;
