-- GuardianX — DFIR (Digital Forensics & Incident Response) tables
-- Run in Supabase SQL Editor

-- ---------- Incident ----------
CREATE TABLE IF NOT EXISTS "Incident" (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium',
  status          TEXT NOT NULL DEFAULT 'open',
  category        TEXT NOT NULL DEFAULT 'other',
  source          TEXT NOT NULL DEFAULT 'manual',
  "sourceId"      TEXT,
  "clientId"      TEXT,
  "targetId"      TEXT,
  assignee        TEXT,
  "detectedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "containedAt"   TIMESTAMPTZ,
  "eradicatedAt"  TIMESTAMPTZ,
  "closedAt"      TIMESTAMPTZ,
  "rootCause"     TEXT,
  "lessonsLearned" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- IncidentEvent ----------
CREATE TABLE IF NOT EXISTS "IncidentEvent" (
  id          TEXT PRIMARY KEY,
  "incidentId" TEXT NOT NULL,
  "eventType"  TEXT NOT NULL,
  source       TEXT NOT NULL,
  "sourceId"   TEXT,
  title        TEXT NOT NULL,
  description  TEXT,
  severity     TEXT NOT NULL DEFAULT 'info',
  metadata     TEXT,
  actor        TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- IOC (Indicator of Compromise) ----------
CREATE TABLE IF NOT EXISTS "IOC" (
  id          TEXT PRIMARY KEY,
  "iocType"   TEXT NOT NULL,
  value       TEXT UNIQUE NOT NULL,
  confidence  TEXT NOT NULL DEFAULT 'medium',
  source      TEXT NOT NULL DEFAULT 'internal',
  tags        TEXT,
  "firstSeen" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSeen"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "hitCount"  INTEGER NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Evidence ----------
CREATE TABLE IF NOT EXISTS "Evidence" (
  id                 TEXT PRIMARY KEY,
  "incidentId"       TEXT NOT NULL,
  "evidenceType"     TEXT NOT NULL,
  filename           TEXT NOT NULL,
  sha256             TEXT NOT NULL,
  "collectedBy"      TEXT NOT NULL,
  "collectedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description        TEXT,
  "storagePath"      TEXT,
  "fileSize"         INTEGER NOT NULL DEFAULT 0,
  "chainOfCustody"   TEXT NOT NULL DEFAULT '[]',
  "isImmutable"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Playbook ----------
CREATE TABLE IF NOT EXISTS "Playbook" (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'incident_response',
  trigger     TEXT NOT NULL DEFAULT 'manual',
  steps       TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'high',
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS idx_inc_status    ON "Incident"(status);
CREATE INDEX IF NOT EXISTS idx_inc_severity  ON "Incident"(severity);
CREATE INDEX IF NOT EXISTS idx_inc_client    ON "Incident"("clientId");
CREATE INDEX IF NOT EXISTS idx_ie_incident   ON "IncidentEvent"("incidentId");
CREATE INDEX IF NOT EXISTS idx_ioc_value     ON "IOC"(value);
CREATE INDEX IF NOT EXISTS idx_ioc_active    ON "IOC"("isActive");
CREATE INDEX IF NOT EXISTS idx_ev_incident   ON "Evidence"("incidentId");
CREATE INDEX IF NOT EXISTS idx_pb_trigger    ON "Playbook"(trigger);

-- ---------- Privileges + RLS ----------
GRANT ALL ON "Incident" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Incident" TO anon, authenticated;
GRANT ALL ON "IncidentEvent" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "IncidentEvent" TO anon, authenticated;
GRANT ALL ON "IOC" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "IOC" TO anon, authenticated;
GRANT ALL ON "Evidence" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Evidence" TO anon, authenticated;
GRANT ALL ON "Playbook" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Playbook" TO anon, authenticated;

ALTER TABLE IF EXISTS "Incident" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "IncidentEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "IOC" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Evidence" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Playbook" DISABLE ROW LEVEL SECURITY;

-- ---------- Seed default playbooks ----------
INSERT INTO "Playbook" (id, name, description, category, trigger, steps, severity, "isActive") VALUES
(
  'pb-data-exfil-default',
  'Data Exfiltration Response',
  'Triggered when a canary token is triggered or honeypot data is accessed externally.',
  'incident_response',
  'data_exfiltration',
  '[{"order":1,"action":"Isolate Asset","description":"Revoke target authorization and block the source IP via virtual WAF patch","automated":true},{"order":2,"action":"Snapshot State","description":"Capture current system state as forensic evidence (logs, configs, canary triggers)","automated":true},{"order":3,"action":"Rotate Credentials","description":"Rotate all credentials associated with the affected target (API keys, tokens, passwords)","automated":false},{"order":4,"action":"Investigate Scope","description":"Determine what data was accessed and which users are affected","automated":false},{"order":5,"action":"Notify Stakeholders","description":"Draft DPDPA breach notification and alert the security team","automated":true},{"order":6,"action":"Remediate","description":"Apply patches and close the exfiltration vector","automated":false},{"order":7,"action":"Document Lessons","description":"Record root cause and lessons learned in the incident case","automated":false}]',
  'critical',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO "Playbook" (id, name, description, category, trigger, steps, severity, "isActive") VALUES
(
  'pb-intrusion-default',
  'Intrusion Detection Response',
  'Triggered when anomaly detection reports a critical finding spike or unauthorized access pattern.',
  'incident_response',
  'intrusion',
  '[{"order":1,"action":"Create Incident Case","description":"Auto-create an incident with severity based on the anomaly","automated":true},{"order":2,"action":"Correlate Events","description":"Build a forensic timeline from audit logs, API access logs, and honeypot hits","automated":true},{"order":3,"action":"Identify Attack Vector","description":"Determine how the attacker gained access","automated":false},{"order":4,"action":"Block Attacker","description":"Add attacker IP to IOC list and generate WAF block rule","automated":true},{"order":5,"action":"Contain","description":"Isolate affected systems and revoke compromised sessions","automated":false},{"order":6,"action":"Eradicate","description":"Remove malware, close backdoors, patch vulnerabilities","automated":false},{"order":7,"action":"Recover","description":"Restore systems from known-good state and verify integrity","automated":false}]',
  'high',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO "Playbook" (id, name, description, category, trigger, steps, severity, "isActive") VALUES
(
  'pb-misconfig-default',
  'Security Misconfiguration Response',
  'Triggered when a critical misconfiguration or exposure is detected (e.g., /.env exposed, .git leaked).',
  'containment',
  'misconfiguration',
  '[{"order":1,"action":"Block Exposure","description":"Generate virtual WAF rule to block access to the exposed path","automated":true},{"order":2,"action":"Rotate Secrets","description":"If secrets are exposed, flag for immediate rotation","automated":false},{"order":3,"action":"Fix Configuration","description":"Apply the AI-generated patch to close the exposure","automated":false},{"order":4,"action":"Verify Fix","description":"Re-scan to confirm the exposure is closed","automated":true}]',
  'high',
  true
) ON CONFLICT (id) DO NOTHING;
