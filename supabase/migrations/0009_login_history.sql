-- GuardianX — LoginHistory audit table (Task #12-login-activity)
--
-- Records every login attempt against a known user account (success OR
-- failure) so the user can review recent login activity on Settings →
-- Security. Written fire-and-forget from /api/auth/login.
--
-- Idempotent: safe to re-run on existing Supabase projects. The same
-- CREATE TABLE + INDEX + GRANT + RLS statements are embedded in
-- /api/db-init's SCHEMA_SQL constant so POST /api/db-init will also
-- provision them on a fresh project.

-- ---------- LoginHistory ----------
CREATE TABLE IF NOT EXISTS "LoginHistory" (
  id              TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "ipAddress"     TEXT NOT NULL,
  "userAgent"     TEXT NOT NULL DEFAULT '',
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  "failureReason" TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the user-scoped "recent logins" query (sorted desc by time).
CREATE INDEX IF NOT EXISTS idx_loginhistory_userid   ON "LoginHistory"("userId");
CREATE INDEX IF NOT EXISTS idx_loginhistory_timestamp ON "LoginHistory"(timestamp DESC);

-- Permissions (same pattern as the other audit-style tables).
GRANT ALL ON "LoginHistory" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoginHistory" TO anon, authenticated;

-- Row-Level Security: the ONLY table in the GuardianX schema that has
-- RLS enabled. Defense-in-depth for the day someone accidentally exposes
-- the Supabase anon key to the client — anon/authenticated queries
-- against this table are filtered to rows whose `userId` matches the
-- caller's JWT `sub` claim. The service_role key (used by the backend)
-- bypasses RLS, so all rows are accessible from API routes regardless
-- of which user is calling.
ALTER TABLE IF EXISTS "LoginHistory" ENABLE ROW LEVEL SECURITY;

-- A user can SELECT only their own login history.
CREATE POLICY IF NOT EXISTS "users_select_own_login_history"
  ON "LoginHistory"
  FOR SELECT
  TO authenticated, anon
  USING ("userId" = current_setting('request.jwt.claims', true)::json->>'sub');

-- Inserts are allowed from any caller (the /api/auth/login route runs
-- with the service_role key, which bypasses RLS, so this policy is
-- effectively a no-op — but declaring it makes the intent explicit and
-- keeps the table usable if the service_role is ever temporarily
-- unavailable).
CREATE POLICY IF NOT EXISTS "service_insert_login_history"
  ON "LoginHistory"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);
