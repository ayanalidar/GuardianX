-- GuardianX — Customer success tables (Task #10-customer-success)
--
-- Two new tables back the in-app support chat and the public feature-request
-- board:
--
--   SupportTicket  — one row per in-app support chat message. The chat widget
--                    creates a ticket via POST /api/support/ticket; the user's
--                    own tickets are listed via GET /api/support/tickets.
--                    Stored alongside enough user context (userId, userEmail,
--                    userName) so an admin triaging the queue does not need
--                    to join the User table.
--
--   FeatureRequest — public feature-request board. Users submit ideas via
--                    POST /api/feature-requests; anyone can upvote via
--                    POST /api/feature-requests/[id]/vote. The `upvotes`
--                    column is denormalized for fast reads; `voterIPs` is a
--                    JSON array used as the dedupe ledger (one vote per IP per
--                    request — see the caveat in prisma/schema.prisma about
--                    serverless per-instance state).
--
-- Both tables are owned by the backend (the service_role key does all writes;
-- the API routes filter by the caller's userId so viewers only see their own
-- rows). RLS is DISABLED for parity with every other service-owned table in
-- the schema. Idempotent: safe to re-run on existing Supabase projects. The
-- same CREATE TABLE / INDEX / GRANT / RLS statements are embedded in
-- /api/db-init's SCHEMA_SQL constant so POST /api/db-init will also provision
-- them on a fresh project.

-- ---------- SupportTicket ----------
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "userName"  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'in_progress' | 'resolved' | 'closed'
  priority    TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'high' | 'admin'
  "isAdmin"   BOOLEAN NOT NULL DEFAULT FALSE,  -- true when the ticket author is an admin
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supportticket_userid     ON "SupportTicket"("userId");
CREATE INDEX IF NOT EXISTS idx_supportticket_status     ON "SupportTicket"(status);
CREATE INDEX IF NOT EXISTS idx_supportticket_priority   ON "SupportTicket"(priority);
CREATE INDEX IF NOT EXISTS idx_supportticket_createdat  ON "SupportTicket"("createdAt" DESC);

GRANT ALL ON "SupportTicket" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO anon, authenticated;
ALTER TABLE IF EXISTS "SupportTicket" DISABLE ROW LEVEL SECURITY;

-- ---------- FeatureRequest ----------
CREATE TABLE IF NOT EXISTS "FeatureRequest" (
  id           TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "userEmail"  TEXT NOT NULL,
  "userName"   TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'planned' | 'in_progress' | 'completed' | 'declined'
  upvotes      INTEGER NOT NULL DEFAULT 0,
  "voterIPs"   TEXT NOT NULL DEFAULT '[]',    -- JSON array of IPs that have upvoted (dedupe ledger)
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featurerequest_status   ON "FeatureRequest"(status);
CREATE INDEX IF NOT EXISTS idx_featurerequest_upvotes  ON "FeatureRequest"(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_featurerequest_userid   ON "FeatureRequest"("userId");

GRANT ALL ON "FeatureRequest" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FeatureRequest" TO anon, authenticated;
ALTER TABLE IF EXISTS "FeatureRequest" DISABLE ROW LEVEL SECURITY;
