import { NextResponse } from "next/server";
import { randomUUID } from "@/lib/crypto";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The full schema SQL, also stored in /supabase/migrations/0001_init.sql.
// We embed it here so the db-init endpoint can (re)try to create tables
// via the exec_sql RPC function (which exists only AFTER the user has
// run the migration once in the Supabase SQL Editor).
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', avatar TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Codebase" (id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'javascript', description TEXT, "sourceCode" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Scan" (id TEXT PRIMARY KEY, "codebaseId" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', "stageLabel" TEXT, "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "completedAt" TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS "Patch" (id TEXT PRIMARY KEY, "patchId" TEXT UNIQUE NOT NULL, "codebaseId" TEXT NOT NULL, "scanId" TEXT NOT NULL, title TEXT NOT NULL, severity TEXT, cve TEXT, "affectedFile" TEXT, "aiExplanation" TEXT, "aiReasoning" TEXT, confidence DOUBLE PRECISION NOT NULL DEFAULT 0, "originalCode" TEXT, "patchedCode" TEXT, "diffPayload" TEXT, "testCode" TEXT, "sandboxLogs" TEXT, "sandboxPassed" BOOLEAN NOT NULL DEFAULT FALSE, "exploitCode" TEXT, "exploitOriginalResult" TEXT, "exploitPatchedResult" TEXT, "adversarialRounds" INTEGER NOT NULL DEFAULT 0, "adversarialWon" BOOLEAN NOT NULL DEFAULT FALSE, "adversarialTranscript" TEXT, status TEXT NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "approvedAt" TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS "PipelineEvent" (id TEXT PRIMARY KEY, "scanId" TEXT NOT NULL, stage TEXT, message TEXT, level TEXT NOT NULL DEFAULT 'info', meta TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "ChatMessage" (id TEXT PRIMARY KEY, "patchId" TEXT NOT NULL, role TEXT, content TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Credential" (id TEXT PRIMARY KEY, label TEXT, kind TEXT, target TEXT, username TEXT, "secretCipher" TEXT, "secretIv" TEXT, "secretTag" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "lastUsedAt" TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS "CredentialAudit" (id TEXT PRIMARY KEY, "credentialId" TEXT NOT NULL, action TEXT, context TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Target" (id TEXT PRIMARY KEY, name TEXT, "baseUrl" TEXT, "authHeader" TEXT, notes TEXT, authorized BOOLEAN NOT NULL DEFAULT FALSE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Engagement" (id TEXT PRIMARY KEY, "targetId" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', "stageLabel" TEXT, "crawlSummary" TEXT, "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "completedAt" TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS "Finding" (id TEXT PRIMARY KEY, "engagementId" TEXT NOT NULL, title TEXT, severity TEXT, category TEXT, owasp TEXT, endpoint TEXT, method TEXT, description TEXT, "proofRequest" TEXT, "proofResponse" TEXT, payload TEXT, confidence DOUBLE PRECISION NOT NULL DEFAULT 0, remediation TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "RedAgentEvent" (id TEXT PRIMARY KEY, "engagementId" TEXT NOT NULL, stage TEXT, message TEXT, level TEXT NOT NULL DEFAULT 'info', meta TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Attestation" (id TEXT PRIMARY KEY, "patchId" TEXT UNIQUE NOT NULL, "prevHash" TEXT, hash TEXT, data TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Canary" (id TEXT PRIMARY KEY, "targetId" TEXT, label TEXT, "canaryType" TEXT, "canaryValue" TEXT UNIQUE, "injectedEndpoint" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, detected BOOLEAN NOT NULL DEFAULT FALSE, "detectedAt" TIMESTAMPTZ, "detectedOn" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "ApiAccessLog" (id TEXT PRIMARY KEY, "targetId" TEXT, "ipAddress" TEXT, method TEXT, endpoint TEXT, "statusCode" INTEGER, "userAgent" TEXT, "responseSize" INTEGER, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "HoneypotHit" (id TEXT PRIMARY KEY, "targetId" TEXT, endpoint TEXT, "ipAddress" TEXT, "userAgent" TEXT, method TEXT, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "WebhookConfig" (id TEXT PRIMARY KEY, name TEXT, url TEXT, events TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, secret TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "ScheduledScan" (id TEXT PRIMARY KEY, name TEXT, "scanType" TEXT, "targetId" TEXT, "codebaseId" TEXT, "cronExpr" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "lastRunAt" TIMESTAMPTZ, "nextRunAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "AlertRule" (id TEXT PRIMARY KEY, name TEXT, condition TEXT, channel TEXT, "channelConfig" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "lastTriggered" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "AuditLog" (id TEXT PRIMARY KEY, action TEXT, entity TEXT, actor TEXT NOT NULL DEFAULT 'system', details TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "TeamMember" (id TEXT PRIMARY KEY, "orgId" TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'viewer', "invitedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "joinedAt" TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS "AttackChain" (id TEXT PRIMARY KEY, title TEXT, description TEXT, severity TEXT, steps TEXT, "findingIds" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Integration" (id TEXT PRIMARY KEY, type TEXT, config TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "FuzzResult" (id TEXT PRIMARY KEY, "targetUrl" TEXT, endpoint TEXT, method TEXT, "totalRequests" INTEGER, crashes INTEGER, errors INTEGER, anomalies TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Incident" (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, severity TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', category TEXT NOT NULL DEFAULT 'other', source TEXT NOT NULL DEFAULT 'manual', "sourceId" TEXT, "clientId" TEXT, "targetId" TEXT, assignee TEXT, "detectedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "containedAt" TIMESTAMPTZ, "eradicatedAt" TIMESTAMPTZ, "closedAt" TIMESTAMPTZ, "rootCause" TEXT, "lessonsLearned" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "IncidentEvent" (id TEXT PRIMARY KEY, "incidentId" TEXT NOT NULL, "eventType" TEXT NOT NULL, source TEXT NOT NULL, "sourceId" TEXT, title TEXT NOT NULL, description TEXT, severity TEXT NOT NULL DEFAULT 'info', metadata TEXT, actor TEXT, "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "IOC" (id TEXT PRIMARY KEY, "iocType" TEXT NOT NULL, value TEXT UNIQUE NOT NULL, confidence TEXT NOT NULL DEFAULT 'medium', source TEXT NOT NULL DEFAULT 'internal', tags TEXT, "firstSeen" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "lastSeen" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "hitCount" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Evidence" (id TEXT PRIMARY KEY, "incidentId" TEXT NOT NULL, "evidenceType" TEXT NOT NULL, filename TEXT NOT NULL, sha256 TEXT NOT NULL, "collectedBy" TEXT NOT NULL, "collectedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), description TEXT, "storagePath" TEXT, "fileSize" INTEGER NOT NULL DEFAULT 0, "chainOfCustody" TEXT NOT NULL DEFAULT '[]', "isImmutable" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Playbook" (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL DEFAULT 'incident_response', trigger TEXT NOT NULL DEFAULT 'manual', steps TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'high', "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_inc_status ON "Incident"(status);
CREATE INDEX IF NOT EXISTS idx_inc_severity ON "Incident"(severity);
CREATE INDEX IF NOT EXISTS idx_ie_incident ON "IncidentEvent"("incidentId");
CREATE INDEX IF NOT EXISTS idx_ioc_value ON "IOC"(value);
CREATE INDEX IF NOT EXISTS idx_ev_incident ON "Evidence"("incidentId");
GRANT ALL ON "Incident" TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON "Incident" TO anon, authenticated;
GRANT ALL ON "IncidentEvent" TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON "IncidentEvent" TO anon, authenticated;
GRANT ALL ON "IOC" TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON "IOC" TO anon, authenticated;
GRANT ALL ON "Evidence" TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON "Evidence" TO anon, authenticated;
GRANT ALL ON "Playbook" TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON "Playbook" TO anon, authenticated;
ALTER TABLE IF EXISTS "Incident" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "IncidentEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "IOC" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Evidence" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Playbook" DISABLE ROW LEVEL SECURITY;
`;

const DEMO_CODEBASES = [
  {
    id: randomUUID(),
    name: "auth-service.js",
    language: "javascript",
    description: "Login module with SQL injection and weak hashing.",
    sourceCode:
      "const db = require('./db');\nasync function login(email, password) {\n  const query = \"SELECT * FROM users WHERE email = '\" + email + \"' AND password = '\" + password + \"'\";\n  const rows = await db.rawQuery(query);\n  return rows.length > 0 ? { ok: true } : { ok: false };\n}\nmodule.exports = { login };",
  },
  {
    id: randomUUID(),
    name: "file-server.js",
    language: "javascript",
    description: "Path traversal + eval vulnerability.",
    sourceCode:
      "const fs = require('fs');\nconst path = require('path');\nfunction downloadFile(filename, res) {\n  const filePath = path.join('/var/app/uploads', filename);\n  res.end(fs.readFileSync(filePath));\n}\nmodule.exports = { downloadFile };",
  },
  {
    id: randomUUID(),
    name: "user-api.js",
    language: "javascript",
    description: "NoSQL injection + plaintext passwords.",
    sourceCode:
      "const express = require('express');\nconst app = express();\napp.post('/login', (req, res) => {\n  const query = req.body;\n  const found = users.filter(u => Object.keys(query).every(k => u[k] === query[k]));\n  res.json(found);\n});",
  },
];

// POST /api/db-init, creates all database tables (via exec_sql RPC) and seeds demo data.
export async function POST() {
  const results: string[] = [];
  let tablesReady = false;

  // Step 1: Check if User table already exists (read-only probe).
  const probe = await supabase.from("User").select("id").limit(1);
  if (!probe.error) {
    results.push("✓ User table already exists");
    tablesReady = true;
  } else {
    results.push(`✗ User table missing: ${probe.error.message}`);
    // Step 2: Try to create tables via exec_sql RPC.
    // This only works AFTER the user has run /supabase/migrations/0001_init.sql
    // in their Supabase Dashboard SQL Editor (which creates the exec_sql function).
    const { error: rpcErr } = await supabase.rpc("exec_sql", { sql_text: SCHEMA_SQL });
    if (rpcErr) {
      results.push(`✗ exec_sql RPC unavailable: ${rpcErr.message}`);
      results.push(
        "ACTION REQUIRED: Open Supabase Dashboard → SQL Editor → New Query, " +
          "paste the contents of /supabase/migrations/0001_init.sql, then click Run. " +
          "After that, POST /api/db-init again to seed demo data."
      );
    } else {
      results.push("✓ All 25 tables created via exec_sql RPC");
      tablesReady = true;
    }
  }

  if (!tablesReady) {
    return NextResponse.json(
      {
        ok: false,
        initialized: false,
        message:
          "Database not initialized. Run /supabase/migrations/0001_init.sql in your Supabase SQL Editor, then retry.",
        steps: [
          "1. Go to https://supabase.com/dashboard → your project (ekjsieovspkuqdjhxwct)",
          "2. Click 'SQL Editor' in the left sidebar → 'New Query'",
          "3. Open the file supabase/migrations/0001_init.sql from this repo, copy ALL of it",
          "4. Paste into the SQL Editor and click 'Run' (Ctrl+Enter)",
          "5. Wait for 'Success. No rows returned' message",
          "6. Re-POST to /api/db-init to seed demo data",
        ],
        details: results,
      },
      { status: 503 }
    );
  }

  // Step 3: Seed demo codebases if empty.
  const { data: codebases } = await supabase.from("Codebase").select("id").limit(1);
  if (!codebases || codebases.length === 0) {
    const { error: seedErr } = await supabase.from("Codebase").insert(DEMO_CODEBASES);
    if (seedErr) {
      results.push(`⚠️ Seed failed: ${seedErr.message}`);
    } else {
      results.push("✓ Seeded 3 demo codebases (auth-service.js, file-server.js, user-api.js)");
    }
  } else {
    results.push("✓ Codebases already seeded");
  }

  // Step 4: Final status report.
  const { count: userCount } = await supabase
    .from("User")
    .select("*", { count: "exact", head: true });
  const { count: cbCount } = await supabase
    .from("Codebase")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    initialized: true,
    message: "Database initialized successfully! You can now sign up / log in.",
    stats: {
      users: userCount || 0,
      codebases: cbCount || 0,
    },
    details: results,
  });
}

// GET /api/db-init, reports whether the database is ready.
export async function GET() {
  const probe = await supabase.from("User").select("id").limit(1);
  if (probe.error) {
    return NextResponse.json(
      {
        initialized: false,
        ready: false,
        error: probe.error.message,
        message:
          "Database not initialized. POST /api/db-init to attempt auto-init, or run /supabase/migrations/0001_init.sql in your Supabase SQL Editor.",
      },
      { status: 200 }
    );
  }
  const { count } = await supabase
    .from("User")
    .select("*", { count: "exact", head: true });
  return NextResponse.json({
    initialized: true,
    ready: true,
    user_count: count || 0,
    message: count === 0 ? "Ready, no users yet (first signup becomes admin)" : "Ready",
  });
}
