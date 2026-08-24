-- =====================================================================
-- GuardianX — Support Tickets + Billing Subscriptions
-- ---------------------------------------------------------------------
-- Two new tables backing the floating SupportChat widget and the
-- BillingPanel pricing UI. Both are intentionally lightweight; the
-- SupportTicket table records the initial message + admin reply status
-- and the Subscription table caches the user's plan + Stripe IDs.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal',
  status      TEXT NOT NULL DEFAULT 'open',
  reply       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_user_created
  ON "SupportTicket"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_support_status
  ON "SupportTicket"(status, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "Subscription" (
  id                    TEXT PRIMARY KEY,
  "userId"              TEXT NOT NULL UNIQUE,
  plan                  TEXT NOT NULL DEFAULT 'free',
  status                TEXT NOT NULL DEFAULT 'active',
  "stripeCustomerId"    TEXT,
  "stripeSubscriptionId" TEXT,
  "currentPeriodEnd"    TIMESTAMPTZ,
  "cancelAtPeriodEnd"   BOOLEAN NOT NULL DEFAULT FALSE,
  "clientsUsed"         INTEGER NOT NULL DEFAULT 0,
  "scansUsed"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_user
  ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS idx_sub_status
  ON "Subscription"(status);

GRANT ALL ON "SupportTicket" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO anon, authenticated;
ALTER TABLE IF EXISTS "SupportTicket" DISABLE ROW LEVEL SECURITY;

GRANT ALL ON "Subscription" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Subscription" TO anon, authenticated;
ALTER TABLE IF EXISTS "Subscription" DISABLE ROW LEVEL SECURITY;
