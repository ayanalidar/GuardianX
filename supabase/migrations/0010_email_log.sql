-- GuardianX — EmailLog delivery-monitoring table (Task #14-email-monitoring)
--
-- Records every outgoing email's outcome (sent | failed) so the admin can
-- see SMTP delivery health at a glance from Settings → Email (SMTP) →
-- Email Delivery. Written fire-and-forget from src/lib/email.ts after each
-- `sendEmail` / `sendEmailWithConfig` attempt completes.
--
-- Only metadata is stored — NEVER the email body, password, or any other
-- SMTP credential. The `template` column is a short label identifying the
-- kind of email (welcomeAdmin, passwordReset, smtpTest, dailyDigest, …) so
-- the operator can correlate failures with the code path that produced them.
--
-- Idempotent: safe to re-run on existing Supabase projects. The same
-- CREATE TABLE + INDEX + GRANT + RLS statements are embedded in
-- /api/db-init's SCHEMA_SQL constant so POST /api/db-init will also
-- provision them on a fresh project.

-- ---------- EmailLog ----------
CREATE TABLE IF NOT EXISTS "EmailLog" (
  id           TEXT PRIMARY KEY,
  "to"         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  status       TEXT NOT NULL,           -- 'sent' | 'failed'
  "messageId"  TEXT,                    -- nodemailer's message id (null on dev / failure)
  error        TEXT,                    -- human-readable error explanation (null on success)
  template     TEXT,                    -- e.g. 'welcomeAdmin', 'passwordReset', 'smtpTest'
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the admin "Email Delivery" panel queries.
CREATE INDEX IF NOT EXISTS idx_emaillog_timestamp ON "EmailLog"(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emaillog_status    ON "EmailLog"(status);
CREATE INDEX IF NOT EXISTS idx_emaillog_template  ON "EmailLog"(template);

-- Permissions (same pattern as the other audit-style tables).
GRANT ALL ON "EmailLog" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailLog" TO anon, authenticated;

-- RLS disabled — the backend uses the service_role key (which bypasses RLS)
-- and admin-only access is enforced in /api/email-logs via `requireAdmin`.
ALTER TABLE IF EXISTS "EmailLog" DISABLE ROW LEVEL SECURITY;
