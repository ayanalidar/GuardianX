// GuardianX — Demo data seeder for https://www.guardianx.cloud
//
// Populates the Neon PostgreSQL database with realistic demo data so the
// platform feels alive for sales demos and screenshot walks:
//   • 3 demo clients  (Acme Corp, TechStart Inc, HealthGuard Systems)
//   • 4 codebases     (auth-service.js / file-server.js / user-api.js / payment-gw.js)
//   • 6 findings      (2 critical, 2 high, 2 medium — with real CWE refs)
//   • 4 patches        (2 pending, 1 approved, 1 rejected — with real patched code + diffs)
//   • 2 targets        (one authorized, one pending authorization)
//   • 3 canary tokens  (api_key / database / aws_credential)
//
// Run standalone:
//   bun run scripts/seed-demo-data.ts
//
// Or trigger from the browser (admin-gated):
//   POST /api/seed-demo
//
// IDEMPOTENT: safe to re-run — checks business identifiers (name / patchId /
// canaryValue / title+engagementId) before each insert, so a re-run will
// skip rows that already exist rather than creating duplicates.
//
// All timestamps are spread across the last 30 days so the console shows
// realistic activity over time instead of one block of "today".

import { db } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns a Date N days ago at the given hour/minute (defaults to 10:00). */
function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Counts items in an array as an insertion plan summary. */
function bump(arr: unknown[]): number {
  return arr.length;
}

// ── Summary returned to the caller (used by both CLI and API route) ─────────

export interface SeedSummary {
  clients:      { created: number; skipped: number };
  codebases:    { created: number; skipped: number };
  scans:        { created: number; skipped: number };
  patches:      { created: number; skipped: number };
  targets:      { created: number; skipped: number };
  engagements:  { created: number; skipped: number };
  findings:     { created: number; skipped: number };
  canaries:     { created: number; skipped: number };
  errors:       string[];
  durationMs:   number;
}

function emptySummary(): SeedSummary {
  return {
    clients:      { created: 0, skipped: 0 },
    codebases:    { created: 0, skipped: 0 },
    scans:        { created: 0, skipped: 0 },
    patches:      { created: 0, skipped: 0 },
    targets:      { created: 0, skipped: 0 },
    engagements:  { created: 0, skipped: 0 },
    findings:     { created: 0, skipped: 0 },
    canaries:     { created: 0, skipped: 0 },
    errors:       [],
    durationMs:   0,
  };
}

// ── Source-code samples for the four vulnerable codebases ──────────────────
// These are intentionally real, runnable JavaScript containing genuine
// vulnerability patterns (SQLi, path traversal, NoSQL injection, hardcoded
// secrets). The GuardianX scanner detects these and the patch pipeline
// proposes fixes (see the patches section below).

const AUTH_SERVICE_SRC = [
  "// auth-service.js — Authentication service for Acme Corp online banking",
  "const db = require('./db');",
  "const crypto = require('crypto');",
  "",
  "// Authenticate a user by email + password.",
  "async function login(email, password) {",
  "  // VULNERABLE: SQL injection via string concatenation in query string.",
  "  // An attacker can supply email = \"' OR '1'='1' --\" to bypass auth.",
  '  const hash = crypto.createHash("md5").update(password).digest("hex");',
  '  const query = "SELECT id, email, role FROM users WHERE email = \'" + email + "\' AND password = \'" + hash + "\'";',
  "  const rows = await db.query(query);",
  "  return rows[0] || null;",
  "}",
  "",
  "// Look up a user by numeric ID — also injectable.",
  "async function getUser(id) {",
  '  const rows = await db.query("SELECT * FROM users WHERE id = " + id);',
  "  return rows[0] || null;",
  "}",
  "",
  "module.exports = { login, getUser };",
  "",
].join("\n");

const FILE_SERVER_SRC = [
  "// file-server.js — File download handler (HealthGuard patient document service)",
  "const fs = require('fs');",
  "const path = require('path');",
  "",
  "const UPLOAD_DIR = '/var/app/patient-docs';",
  "",
  "// Serve a file by name from the uploads directory.",
  "function downloadFile(filename, res) {",
  "  // VULNERABLE: path traversal — path.join() does NOT prevent ../ escape.",
  "  // Payload: ../../etc/passwd returns the system password file.",
  "  const filePath = path.join(UPLOAD_DIR, filename);",
  "  const data = fs.readFileSync(filePath);",
  "  res.setHeader('Content-Type', 'application/octet-stream');",
  "  res.end(data);",
  "}",
  "",
  "// Delete a file by name (also vulnerable).",
  "function deleteFile(filename) {",
  "  const filePath = path.join(UPLOAD_DIR, filename);",
  "  fs.unlinkSync(filePath);",
  "}",
  "",
  "module.exports = { downloadFile, deleteFile };",
  "",
].join("\n");

const USER_API_SRC = [
  "// user-api.js — User REST API (TechStart collaboration platform)",
  "const express = require('express');",
  "const app = express();",
  "app.use(express.json());",
  "",
  "const db = require('./mongo');",
  "",
  "// Login — builds the Mongo filter directly from the request body.",
  "app.post('/login', async (req, res) => {",
  "  // VULNERABLE: NoSQL injection — req.body is used as the query directly.",
  '  // Payload: {"email":"admin@techstart.io","password":{"$ne":null}}',
  "  //          returns the admin user without knowing the password.",
  "  const user = await db.collection('users').findOne(req.body);",
  "  if (user) {",
  "    return res.json({ ok: true, token: 'tok_' + user._id });",
  "  }",
  "  return res.status(401).json({ ok: false, error: 'Invalid credentials' });",
  "});",
  "",
  "// Get user by email — also accepts Mongo operators.",
  "app.get('/users/:email', async (req, res) => {",
  "  const user = await db.collection('users').findOne({ email: req.params.email });",
  "  return res.json(user);",
  "});",
  "",
  "app.listen(3000);",
  "",
].join("\n");

const PAYMENT_GW_SRC = [
  "// payment-gw.js — Payment gateway integration (Acme Corp / Stripe)",
  "const axios = require('axios');",
  "",
  "// VULNERABLE: hardcoded production secrets in source.",
  "// Anyone with repo read access can extract these and call Stripe directly.",
  "const STRIPE_SECRET_KEY = 'sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl';",
  "const DATABASE_URL = 'postgres://prod_admin:Sup3rS3cret!@db.acme-corp.com:5432/payments';",
  "const JWT_SIGNING_KEY = 'jwt-prod-signing-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c';",
  "",
  "// Charge a card via Stripe.",
  "async function charge(cardToken, amount, currency = 'usd') {",
  "  const resp = await axios.post('https://api.stripe.com/v1/charges', {",
  "    amount, currency, source: cardToken,",
  "  }, {",
  "    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },",
  "  });",
  "  return resp.data;",
  "}",
  "",
  "module.exports = { charge, STRIPE_SECRET_KEY };",
  "",
].join("\n");

// ── Patched code samples (used in patches.originalCode / patchedCode / diffPayload) ──

const AUTH_PATCH_ORIG =
  '  const hash = crypto.createHash("md5").update(password).digest("hex");\n' +
  '  const query = "SELECT id, email, role FROM users WHERE email = \'" + email + "\' AND password = \'" + hash + "\'";\n' +
  "  const rows = await db.query(query);";

const AUTH_PATCH_FIXED =
  '  // Use a parameterized query — driver escapes ? placeholders safely.\n' +
  '  const hash = crypto.createHash("md5").update(password).digest("hex");\n' +
  '  const sql = "SELECT id, email, role FROM users WHERE email = ? AND password = ?";\n' +
  "  const rows = await db.query(sql, [email, hash]);";

const AUTH_PATCH_DIFF = [
  "--- a/auth-service.js",
  "+++ b/auth-service.js",
  "@@ -8,9 +8,11 @@",
  " async function login(email, password) {",
  '-  // VULNERABLE: SQL injection via string concatenation in query string.',
  '-  const hash = crypto.createHash("md5").update(password).digest("hex");',
  '-  const query = "SELECT id, email, role FROM users WHERE email = \'\' + email + \'\' AND password = \'\' + hash + \'\'";',
  '-  const rows = await db.query(query);',
  '+  // Use a parameterized query — driver escapes ? placeholders safely.',
  '+  const hash = crypto.createHash("md5").update(password).digest("hex");',
  '+  const sql = "SELECT id, email, role FROM users WHERE email = ? AND password = ?";',
  '+  const rows = await db.query(sql, [email, hash]);',
  "   return rows[0] || null;",
  " }",
].join("\n");

const AUTH_PATCH_TEST = [
  "// test/auth-service.test.js",
  "const assert = require('assert');",
  "const { login } = require('../auth-service');",
  "",
  "(async () => {",
  "  // Sanity: a valid email + password logs in.",
  "  const ok = await login('user@acme-corp.com', 'correct-horse-battery');",
  "  assert.ok(ok, 'valid login should succeed');",
  "",
  "  // SQL injection payload must NOT return a user.",
  "  const injected = await login(\"' OR '1'='1' --\", 'anything');",
  "  assert.equal(injected, null, 'SQLi payload must be blocked');",
  "  console.log('PASS: SQL injection blocked by parameterized query');",
  "})();",
].join("\n");

const FILE_PATCH_ORIG =
  "function downloadFile(filename, res) {\n" +
  "  const filePath = path.join(UPLOAD_DIR, filename);\n" +
  "  const data = fs.readFileSync(filePath);\n" +
  "  res.setHeader('Content-Type', 'application/octet-stream');\n" +
  "  res.end(data);\n" +
  "}";

const FILE_PATCH_FIXED =
  "function downloadFile(filename, res) {\n" +
  "  // Resolve and verify the path stays inside UPLOAD_DIR.\n" +
  "  const filePath = path.resolve(UPLOAD_DIR, filename);\n" +
  "  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {\n" +
  "    return res.status(400).end('Invalid filename');\n" +
  "  }\n" +
  "  const data = fs.readFileSync(filePath);\n" +
  "  res.setHeader('Content-Type', 'application/octet-stream');\n" +
  "  res.end(data);\n" +
  "}";

const FILE_PATCH_DIFF = [
  "--- a/file-server.js",
  "+++ b/file-server.js",
  "@@ -6,7 +6,12 @@",
  " // Serve a file by name from the uploads directory.",
  " function downloadFile(filename, res) {",
  '-  const filePath = path.join(UPLOAD_DIR, filename);',
  '+  // Resolve and verify the path stays inside UPLOAD_DIR.',
  '+  const filePath = path.resolve(UPLOAD_DIR, filename);',
  '+  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {',
  '+    return res.status(400).end(\'Invalid filename\');',
  '+  }',
  "   const data = fs.readFileSync(filePath);",
  "   res.setHeader('Content-Type', 'application/octet-stream');",
  "   res.end(data);",
].join("\n");

const FILE_PATCH_TEST = [
  "// test/file-server.test.js",
  "const assert = require('assert');",
  "const { downloadFile } = require('../file-server');",
  "",
  "// Traversal payload must be rejected with 400, not served.",
  "const fakeRes = {",
  "  statusCode: 200, body: '', status(code) { this.statusCode = code; return this; },",
  "  end(s) { this.body = s; }, setHeader() {}",
  "};",
  "downloadFile('../../etc/passwd', fakeRes);",
  "assert.equal(fakeRes.statusCode, 400, 'traversal payload must be rejected');",
  "console.log('PASS: path traversal blocked');",
].join("\n");

const USER_API_PATCH_ORIG =
  "app.post('/login', async (req, res) => {\n" +
  "  const user = await db.collection('users').findOne(req.body);\n" +
  "  if (user) { return res.json({ ok: true, token: 'tok_' + user._id }); }\n" +
  "  return res.status(401).json({ ok: false, error: 'Invalid credentials' });\n" +
  "});";

const USER_API_PATCH_FIXED =
  "app.post('/login', async (req, res) => {\n" +
  "  const { email, password } = req.body || {};\n" +
  "  // Reject any value that is not a plain string — blocks $ne / $gt etc.\n" +
  "  if (typeof email !== 'string' || typeof password !== 'string') {\n" +
  "    return res.status(400).json({ ok: false, error: 'Invalid input' });\n" +
  "  }\n" +
  "  const user = await db.collection('users').findOne({ email, password });\n" +
  "  if (user) { return res.json({ ok: true, token: 'tok_' + user._id }); }\n" +
  "  return res.status(401).json({ ok: false, error: 'Invalid credentials' });\n" +
  "});";

const USER_API_PATCH_DIFF = [
  "--- a/user-api.js",
  "+++ b/user-api.js",
  "@@ -8,7 +8,14 @@",
  " // Login — builds the Mongo filter directly from the request body.",
  " app.post('/login', async (req, res) => {",
  '-  const user = await db.collection(\'users\').findOne(req.body);',
  '+  const { email, password } = req.body || {};',
  '+  // Reject any value that is not a plain string — blocks $ne / $gt etc.',
  '+  if (typeof email !== \'string\' || typeof password !== \'string\') {',
  '+    return res.status(400).json({ ok: false, error: \'Invalid input\' });',
  '+  }',
  '+  const user = await db.collection(\'users\').findOne({ email, password });',
  "   if (user) { return res.json({ ok: true, token: 'tok_' + user._id }); }",
  "   return res.status(401).json({ ok: false, error: 'Invalid credentials' });",
].join("\n");

const USER_API_PATCH_TEST = [
  "// test/user-api.test.js",
  "const assert = require('assert');",
  "const request = require('supertest');",
  "const app = require('../user-api');",
  "",
  "(async () => {",
  "  // NoSQL injection payload — must be rejected, not return admin user.",
  "  const r = await request(app).post('/login').send({",
  "    email: 'admin@techstart.io',",
  "    password: { $ne: null },",
  "  });",
  "  assert.equal(r.statusCode, 400);",
  "  console.log('PASS: NoSQL $ne injection blocked');",
  "})();",
].join("\n");

const PAYMENT_PATCH_ORIG =
  "// VULNERABLE: hardcoded production secrets in source.\n" +
  "const STRIPE_SECRET_KEY = 'sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl';\n" +
  "const DATABASE_URL = 'postgres://prod_admin:Sup3rS3cret!@db.acme-corp.com:5432/payments';\n" +
  "const JWT_SIGNING_KEY = 'jwt-prod-signing-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c';";

const PAYMENT_PATCH_FIXED =
  "// Secrets loaded from environment — never hardcoded in source.\n" +
  "const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;\n" +
  "const DATABASE_URL = process.env.DATABASE_URL;\n" +
  "const JWT_SIGNING_KEY = process.env.JWT_SIGNING_KEY;\n" +
  "if (!STRIPE_SECRET_KEY || !DATABASE_URL || !JWT_SIGNING_KEY) {\n" +
  "  throw new Error('Missing required environment variables for production secrets');\n" +
  "}";

const PAYMENT_PATCH_DIFF = [
  "--- a/payment-gw.js",
  "+++ b/payment-gw.js",
  "@@ -4,9 +4,14 @@",
  " const axios = require('axios');",
  " ",
  "-// VULNERABLE: hardcoded production secrets in source.",
  "-const STRIPE_SECRET_KEY = 'sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl';",
  `-const DATABASE_URL = 'postgres://prod_admin:Sup3rS3cret!@db.acme-corp.com:5432/payments';`,
  `-const JWT_SIGNING_KEY = 'jwt-prod-signing-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c';`,
  "+// Secrets loaded from environment — never hardcoded in source.",
  "+const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;",
  "+const DATABASE_URL = process.env.DATABASE_URL;",
  "+const JWT_SIGNING_KEY = process.env.JWT_SIGNING_KEY;",
  "+if (!STRIPE_SECRET_KEY || !DATABASE_URL || !JWT_SIGNING_KEY) {",
  "+  throw new Error('Missing required environment variables for production secrets');",
  "+}",
].join("\n");

const PAYMENT_PATCH_TEST = [
  "// test/payment-gw.test.js",
  "const assert = require('assert');",
  "",
  "// The module must refuse to load when env vars are missing.",
  "process.env.STRIPE_SECRET_KEY = '';",
  "delete require.cache[require.resolve('../payment-gw')];",
  "assert.throws(() => require('../payment-gw'), /Missing required environment/);",
  "console.log('PASS: secrets must come from env, not source');",
].join("\n");

// ── Main seed function (exported so the API route can call it) ──────────────

export async function seedDemoData(): Promise<SeedSummary> {
  const summary = emptySummary();
  const startedAt = Date.now();

  try {
    // ── 1. Clients ──────────────────────────────────────────────────────────
    const clientSpecs = [
      {
        name: "Acme Corp",
        description:
          "Fortune 500 financial-services firm. Online banking platform, payment processing, and customer-data warehouse. PCI-DSS regulated.",
        contactName: "Marcus Whitfield",
        contactEmail: "m.whitfield@acme-corp.com",
        contactPhone: "+1 415 555 0142",
        targetUrl: "https://banking.acme-corp.com",
        repoUrl: "https://github.com/acme-corp/banking-platform",
        scope:
          "All endpoints under banking.acme-corp.com and api.acme-corp.com. Exclude /internal/*, /healthz, and the marketing CMS.",
        authorized: true,
        frameworks: "PCI-DSS,GDPR,SOX,SOC 2",
        status: "defending",
        createdAt: daysAgo(28, 9),
      },
      {
        name: "TechStart Inc",
        description:
          "Series-B SaaS startup. Collaboration platform with file sharing, real-time chat, and third-party integrations. DPDPA + GDPR regulated.",
        contactName: "Priya Raghunathan",
        contactEmail: "priya@techstart.io",
        contactPhone: "+1 650 555 0188",
        targetUrl: "https://app.techstart.io",
        repoUrl: "https://github.com/techstart/platform",
        scope:
          "Web app + REST API + WebSocket service. Include /api/v1/* and /api/v2/*. Exclude /internal and /billing.",
        authorized: false,
        frameworks: "DPDPA,GDPR,CCPA",
        status: "onboarding",
        createdAt: daysAgo(22, 14),
      },
      {
        name: "HealthGuard Systems",
        description:
          "Healthcare telemedicine platform with EHR integration. Patient portal, video consultations, and pharmacy ordering. HIPAA regulated.",
        contactName: "Dr. Helen Park",
        contactEmail: "hpark@healthguard.systems",
        contactPhone: "+1 617 555 0177",
        targetUrl: "https://portal.healthguard.systems",
        repoUrl: "https://github.com/healthguard/portal",
        scope:
          "Patient portal + video service + pharmacy API. PHI in scope. Exclude billing system and the legacy HL7 v2 feed.",
        authorized: true,
        frameworks: "HIPAA,GDPR,ISO 27001",
        status: "scanning",
        createdAt: daysAgo(15, 11),
      },
    ];

    const clientIds: Record<string, string> = {};
    for (const spec of clientSpecs) {
      const existing = await db.client.findFirst({ where: { name: spec.name } });
      if (existing) {
        clientIds[spec.name] = existing.id;
        summary.clients.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.client.create({ data: { id, ...spec } });
      clientIds[spec.name] = id;
      summary.clients.created++;
    }

    // ── 2. Targets (one authorized, one pending) ────────────────────────────
    const targetSpecs = [
      {
        key: "acme-prod",
        name: "Acme Corp Production API",
        baseUrl: "https://api.acme-corp.com",
        authHeader: "Bearer prod-internal-token-4f8a9b2c",
        notes:
          "Production banking API. Authorized for active defense. Engagement window: 02:00–04:00 UTC only.",
        authorized: true,
        clientName: "Acme Corp",
        createdAt: daysAgo(27, 10),
      },
      {
        key: "techstart-staging",
        name: "TechStart Staging Environment",
        baseUrl: "https://staging.techstart.io",
        authHeader: null,
        notes:
          "Staging environment for pre-production testing. Authorization pending signature of Rules of Engagement (ROE) — scheduled for next week.",
        authorized: false,
        clientName: "TechStart Inc",
        createdAt: daysAgo(8, 13),
      },
    ];

    const targetIds: Record<string, string> = {};
    for (const spec of targetSpecs) {
      const existing = await db.target.findFirst({
        where: { name: spec.name, baseUrl: spec.baseUrl },
      });
      if (existing) {
        targetIds[spec.key] = existing.id;
        summary.targets.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.target.create({
        data: {
          id,
          name: spec.name,
          baseUrl: spec.baseUrl,
          authHeader: spec.authHeader,
          notes: spec.notes,
          authorized: spec.authorized,
          clientId: clientIds[spec.clientName],
          createdAt: spec.createdAt,
        },
      });
      targetIds[spec.key] = id;
      summary.targets.created++;
    }

    // ── 3. Codebases ────────────────────────────────────────────────────────
    const codebaseSpecs = [
      {
        key: "auth-service",
        name: "auth-service.js",
        language: "javascript",
        description:
          "Acme Corp authentication service — login, session, and user-lookup endpoints. Contains SQL injection via string concatenation (CWE-89).",
        sourceCode: AUTH_SERVICE_SRC,
        clientName: "Acme Corp",
        createdAt: daysAgo(26, 9),
      },
      {
        key: "payment-gw",
        name: "payment-gw.js",
        language: "javascript",
        description:
          "Acme Corp payment gateway integration with Stripe. Contains hardcoded production secrets (CWE-798) — Stripe key, DB URL, JWT signing key.",
        sourceCode: PAYMENT_GW_SRC,
        clientName: "Acme Corp",
        createdAt: daysAgo(25, 15),
      },
      {
        key: "file-server",
        name: "file-server.js",
        language: "javascript",
        description:
          "HealthGuard patient-document service. Path-traversal vulnerability (CWE-22) in downloadFile() — path.join() does not block ../ escape.",
        sourceCode: FILE_SERVER_SRC,
        clientName: "HealthGuard Systems",
        createdAt: daysAgo(14, 10),
      },
      {
        key: "user-api",
        name: "user-api.js",
        language: "javascript",
        description:
          "TechStart user-management REST API. NoSQL injection (CWE-943) — passes req.body directly to MongoDB findOne(), allowing $ne / $gt operator abuse.",
        sourceCode: USER_API_SRC,
        clientName: "TechStart Inc",
        createdAt: daysAgo(20, 16),
      },
    ];

    const codebaseIds: Record<string, string> = {};
    for (const spec of codebaseSpecs) {
      const existing = await db.codebase.findFirst({
        where: { name: spec.name, clientId: clientIds[spec.clientName] },
      });
      if (existing) {
        codebaseIds[spec.key] = existing.id;
        summary.codebases.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.codebase.create({
        data: {
          id,
          name: spec.name,
          language: spec.language,
          description: spec.description,
          sourceCode: spec.sourceCode,
          clientId: clientIds[spec.clientName],
          createdAt: spec.createdAt,
        },
      });
      codebaseIds[spec.key] = id;
      summary.codebases.created++;
    }

    // ── 4. Scans (one per codebase — all completed) ──────────────────────────
    const scanSpecs = [
      {
        key: "scan-auth-service",
        codebaseKey: "auth-service",
        stageLabel: "Completed — 1 critical patch proposed",
        startedAt: daysAgo(20, 11),
        completedAt: daysAgo(20, 11, 2),
      },
      {
        key: "scan-payment-gw",
        codebaseKey: "payment-gw",
        stageLabel: "Completed — 1 patch proposed (rejected by reviewer)",
        startedAt: daysAgo(18, 14),
        completedAt: daysAgo(18, 14, 3),
      },
      {
        key: "scan-file-server",
        codebaseKey: "file-server",
        stageLabel: "Completed — 1 critical patch proposed",
        startedAt: daysAgo(12, 9),
        completedAt: daysAgo(12, 9, 2),
      },
      {
        key: "scan-user-api",
        codebaseKey: "user-api",
        stageLabel: "Completed — 1 high-severity patch approved",
        startedAt: daysAgo(10, 10),
        completedAt: daysAgo(10, 10, 1),
      },
    ];

    const scanIds: Record<string, string> = {};
    for (const spec of scanSpecs) {
      const existing = await db.scan.findFirst({
        where: {
          codebaseId: codebaseIds[spec.codebaseKey],
          stageLabel: spec.stageLabel,
        },
      });
      if (existing) {
        scanIds[spec.key] = existing.id;
        summary.scans.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.scan.create({
        data: {
          id,
          codebaseId: codebaseIds[spec.codebaseKey],
          status: "completed",
          stageLabel: spec.stageLabel,
          startedAt: spec.startedAt,
          completedAt: spec.completedAt,
        },
      });
      scanIds[spec.key] = id;
      summary.scans.created++;
    }

    // ── 5. Patches (2 pending, 1 approved, 1 rejected) ──────────────────────
    const patchSpecs = [
      {
        // PENDING #1
        patchId: "SP-2025-ACM-001",
        codebaseKey: "auth-service",
        scanKey: "scan-auth-service",
        title: "SQL Injection in Login Function via String Concatenation",
        severity: "critical",
        cve: "CWE-89",
        affectedFile: "auth-service.js",
        aiExplanation:
          "The login() function constructs a SQL query by concatenating user-supplied email and password values directly into the query string. An attacker can submit email=\"' OR '1'='1' --\" to bypass authentication and return the first user record.",
        aiReasoning:
          "Source-taint analysis traced req.body.email flowing into a string-concatenated SQL query without parameterization. Verified the exploit by replaying the payload ' OR '1'='1' -- in the sandbox — it returned the first row of the users table. OWASP A03:2021 Injection.",
        confidence: 0.98,
        originalCode: AUTH_PATCH_ORIG,
        patchedCode: AUTH_PATCH_FIXED,
        diffPayload: AUTH_PATCH_DIFF,
        testCode: AUTH_PATCH_TEST,
        sandboxLogs:
          "[sandbox] Running patched auth-service.js...\n[sandbox] test/auth-service.test.js\n[sandbox] PASS: SQL injection blocked by parameterized query\n[sandbox] 1/1 tests passed in 312ms",
        sandboxPassed: true,
        exploitCode:
          "curl -X POST https://api.acme-corp.com/login \\\n" +
          "  -H 'Content-Type: application/json' \\\n" +
          "  -d '{\"email\":\"'\\'' OR '\\''1'\\''='\\''1'\\'' --\",\"password\":\"x\"}'",
        exploitOriginalResult:
          "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"id\":1,\"email\":\"admin@acme-corp.com\",\"role\":\"admin\",\"token\":\"tok_1\"}",
        exploitPatchedResult:
          "HTTP/1.1 401 Unauthorized\nContent-Type: application/json\n\n{\"ok\":false,\"error\":\"Invalid credentials\"}",
        adversarialRounds: 3,
        adversarialWon: true,
        adversarialTranscript:
          "[round 1] Attacker tried ' UNION SELECT * FROM users-- → blocked (parameterized query escapes quote)\n[round 2] Attacker tried time-based blind ('; WAITFOR DELAY '0:0:5'--) → blocked (driver rejects stacked queries)\n[round 3] Attacker tried prepared-statement confusion → blocked",
        status: "pending",
        createdAt: daysAgo(19, 11),
      },
      {
        // PENDING #2
        patchId: "SP-2025-HGS-001",
        codebaseKey: "file-server",
        scanKey: "scan-file-server",
        title: "Path Traversal in File Download via Unsanitized Filename",
        severity: "critical",
        cve: "CWE-22",
        affectedFile: "file-server.js",
        aiExplanation:
          "downloadFile() uses path.join(UPLOAD_DIR, filename) with an unsanitized filename. path.join() does NOT prevent directory traversal — an attacker can supply ../../etc/passwd to read arbitrary files outside UPLOAD_DIR, including /etc/passwd and patient record files.",
        aiReasoning:
          "Static analysis identified user input flowing into path.join() without normalization or prefix verification. Verified the exploit by replaying GET /api/files/download?file=../../etc/passwd in the sandbox — it returned /etc/passwd. OWASP A01:2021 Broken Access Control.",
        confidence: 0.97,
        originalCode: FILE_PATCH_ORIG,
        patchedCode: FILE_PATCH_FIXED,
        diffPayload: FILE_PATCH_DIFF,
        testCode: FILE_PATCH_TEST,
        sandboxLogs:
          "[sandbox] Running patched file-server.js...\n[sandbox] test/file-server.test.js\n[sandbox] PASS: path traversal blocked\n[sandbox] 1/1 tests passed in 198ms",
        sandboxPassed: true,
        exploitCode:
          "curl 'https://portal.healthguard.systems/api/files/download?file=../../etc/passwd'",
        exploitOriginalResult:
          "HTTP/1.1 200 OK\nContent-Type: application/octet-stream\n\nroot:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n...",
        exploitPatchedResult:
          "HTTP/1.1 400 Bad Request\nContent-Type: text/plain\n\nInvalid filename",
        adversarialRounds: 2,
        adversarialWon: true,
        adversarialTranscript:
          "[round 1] Attacker tried URL-encoded ../ (%2e%2e%2f) → blocked (path.resolve decodes then verifies prefix)\n[round 2] Attacker tried symlink escape → blocked (startsWith check on resolved path)",
        status: "pending",
        createdAt: daysAgo(11, 9),
      },
      {
        // APPROVED
        patchId: "SP-2025-TST-001",
        codebaseKey: "user-api",
        scanKey: "scan-user-api",
        title: "NoSQL Injection in Login via Direct Request-Body Query",
        severity: "high",
        cve: "CWE-943",
        affectedFile: "user-api.js",
        aiExplanation:
          "The /login endpoint passes req.body directly to MongoDB's findOne(). An attacker can submit {\"email\":\"admin@techstart.io\",\"password\":{\"$ne\":null}} to return the admin user without knowing the password. The fix destructures email/password from the body and enforces they are plain strings before querying.",
        aiReasoning:
          "Detected direct use of req.body as a Mongo filter — Mongo operators ($ne, $gt, $regex) bypass equality checks. Verified by replaying the $ne payload in the sandbox — it returned the admin user. OWASP A03:2021 Injection.",
        confidence: 0.95,
        originalCode: USER_API_PATCH_ORIG,
        patchedCode: USER_API_PATCH_FIXED,
        diffPayload: USER_API_PATCH_DIFF,
        testCode: USER_API_PATCH_TEST,
        sandboxLogs:
          "[sandbox] Running patched user-api.js...\n[sandbox] test/user-api.test.js\n[sandbox] PASS: NoSQL $ne injection blocked\n[sandbox] 1/1 tests passed in 247ms",
        sandboxPassed: true,
        exploitCode:
          "curl -X POST https://app.techstart.io/login \\\n" +
          "  -H 'Content-Type: application/json' \\\n" +
          "  -d '{\"email\":\"admin@techstart.io\",\"password\":{\"$ne\":null}}'",
        exploitOriginalResult:
          "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"ok\":true,\"token\":\"tok_5f8a9b2c\",\"user\":\"admin@techstart.io\"}",
        exploitPatchedResult:
          "HTTP/1.1 400 Bad Request\nContent-Type: application/json\n\n{\"ok\":false,\"error\":\"Invalid input\"}",
        adversarialRounds: 2,
        adversarialWon: true,
        adversarialTranscript:
          "[round 1] Attacker tried {\"$regex\":\".*\"} → blocked (typeof !== 'string')\n[round 2] Attacker tried {\"$where\":\"this.password != 'x'\"} → blocked (typeof !== 'string')",
        status: "approved",
        approvedAt: daysAgo(4, 16),
        createdAt: daysAgo(9, 10),
      },
      {
        // REJECTED — reviewer wanted a larger secrets-manager migration instead
        patchId: "SP-2025-ACM-002",
        codebaseKey: "payment-gw",
        scanKey: "scan-payment-gw",
        title: "Hardcoded Production Secrets in payment-gw.js",
        severity: "high",
        cve: "CWE-798",
        affectedFile: "payment-gw.js",
        aiExplanation:
          "STRIPE_SECRET_KEY, DATABASE_URL, and JWT_SIGNING_KEY are hardcoded as string literals in the source. Anyone with read access to the repository (including all past employees, CI systems, and any future leak) can extract these secrets and call Stripe / the database / the JWT signer directly. The proposed patch moves them to process.env with a fail-fast startup check.",
        aiReasoning:
          "Pattern match on the sk_live_ prefix (live Stripe key), a postgres:// URL with embedded credentials, and a 32-byte JWT signing key all assigned to top-level const literals. Recommended moving to environment variables backed by a secrets manager (AWS Secrets Manager / HashiCorp Vault). OWASP A05:2021 Security Misconfiguration.",
        confidence: 1.0,
        originalCode: PAYMENT_PATCH_ORIG,
        patchedCode: PAYMENT_PATCH_FIXED,
        diffPayload: PAYMENT_PATCH_DIFF,
        testCode: PAYMENT_PATCH_TEST,
        sandboxLogs:
          "[sandbox] Running patched payment-gw.js...\n[sandbox] test/payment-gw.test.js\n[sandbox] PASS: secrets must come from env, not source\n[sandbox] 1/1 tests passed in 174ms",
        sandboxPassed: true,
        exploitCode:
          "# Attacker clones the repo and extracts the Stripe key directly:\n" +
          "git clone https://github.com/acme-corp/banking-platform.git\n" +
          "grep -E 'sk_live_' banking-platform/payment-gw.js\n" +
          "# Then calls Stripe directly with the extracted key:\n" +
          "curl https://api.stripe.com/v1/charges \\\n" +
          "  -u sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl: \\\n" +
          "  -d amount=999999 -d currency=usd -d source=tok_visa",
        exploitOriginalResult:
          "HTTP/1.1 200 OK\n\n{\"id\":\"ch_3O0aBcDeFgHiJk\",\"amount\":999999,\"status\":\"succeeded\"}",
        exploitPatchedResult:
          "# With env vars enforced, the module fails to load if secrets are missing:\n" +
          "Error: Missing required environment variables for production secrets",
        adversarialRounds: 1,
        adversarialWon: true,
        adversarialTranscript:
          "[round 1] Attacker tried to leak via error message — blocked (no secret values in thrown Error)",
        status: "rejected",
        createdAt: daysAgo(17, 14),
      },
    ];

    for (const spec of patchSpecs) {
      const existing = await db.patch.findFirst({
        where: { patchId: spec.patchId },
      });
      if (existing) {
        summary.patches.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.patch.create({
        data: {
          id,
          patchId: spec.patchId,
          codebaseId: codebaseIds[spec.codebaseKey],
          scanId: scanIds[spec.scanKey],
          title: spec.title,
          severity: spec.severity,
          cve: spec.cve,
          affectedFile: spec.affectedFile,
          aiExplanation: spec.aiExplanation,
          aiReasoning: spec.aiReasoning,
          confidence: spec.confidence,
          originalCode: spec.originalCode,
          patchedCode: spec.patchedCode,
          diffPayload: spec.diffPayload,
          testCode: spec.testCode,
          sandboxLogs: spec.sandboxLogs,
          sandboxPassed: spec.sandboxPassed,
          exploitCode: spec.exploitCode,
          exploitOriginalResult: spec.exploitOriginalResult,
          exploitPatchedResult: spec.exploitPatchedResult,
          adversarialRounds: spec.adversarialRounds,
          adversarialWon: spec.adversarialWon,
          adversarialTranscript: spec.adversarialTranscript,
          status: spec.status,
          approvedAt: spec.approvedAt,
          createdAt: spec.createdAt,
        },
      });
      summary.patches.created++;
    }

    // ── 6. Engagements (both on the authorized Acme target) ─────────────────
    const engagementSpecs = [
      {
        key: "eng-acme-baseline",
        targetKey: "acme-prod",
        status: "completed",
        stageLabel: "Completed — 3 findings (1 critical, 1 high, 1 medium)",
        crawlSummary:
          "Crawled 142 endpoints under api.acme-corp.com. 47 required auth, 95 anonymous. Tested 12 high-priority endpoints for OWASP Top 10.",
        startedAt: daysAgo(13, 2),
        completedAt: daysAgo(13, 2, 18),
      },
      {
        key: "eng-acme-deepscan",
        targetKey: "acme-prod",
        status: "completed",
        stageLabel: "Completed — 3 findings (1 critical, 1 high, 1 medium)",
        crawlSummary:
          "Deep scan of authentication, payment, and file endpoints. Re-tested previously-patched SQLi — confirmed fixed. Discovered new NoSQL injection in /api/v2/users/search.",
        startedAt: daysAgo(6, 2),
        completedAt: daysAgo(6, 2, 22),
      },
    ];

    const engagementIds: Record<string, string> = {};
    for (const spec of engagementSpecs) {
      const existing = await db.engagement.findFirst({
        where: { targetId: targetIds[spec.targetKey], stageLabel: spec.stageLabel },
      });
      if (existing) {
        engagementIds[spec.key] = existing.id;
        summary.engagements.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.engagement.create({
        data: {
          id,
          targetId: targetIds[spec.targetKey],
          status: spec.status,
          stageLabel: spec.stageLabel,
          crawlSummary: spec.crawlSummary,
          startedAt: spec.startedAt,
          completedAt: spec.completedAt,
        },
      });
      engagementIds[spec.key] = id;
      summary.engagements.created++;
    }

    // ── 7. Findings (2 critical, 2 high, 2 medium — real CWE refs) ──────────
    const findingSpecs = [
      // ── CRITICAL #1 ───────────────────────────────────────────────────────
      {
        key: "find-sqli-login",
        engagementKey: "eng-acme-baseline",
        title: "SQL Injection in /api/login via Email Parameter",
        severity: "critical",
        category: "SQL Injection",
        owasp: "A03:2021 — Injection",
        endpoint: "/api/login",
        method: "POST",
        description:
          "The /api/login endpoint constructs a SQL query by concatenating the email field directly into the query string. Submitting email=\"' OR '1'='1' --\" returns the first user record without a valid password, allowing full authentication bypass. This violates CWE-89 (SQL Injection) and PCI-DSS Requirement 6.5.1.",
        proofRequest:
          "POST /api/login HTTP/1.1\nHost: api.acme-corp.com\nContent-Type: application/json\n\n{\"email\":\"' OR '1'='1' --\",\"password\":\"x\"}",
        proofResponse:
          "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"id\":1,\"email\":\"admin@acme-corp.com\",\"role\":\"admin\",\"token\":\"tok_1\"}",
        payload: "' OR '1'='1' --",
        confidence: 1.0,
        remediation:
          "Use parameterized queries (prepared statements) for all SQL construction. The patch SP-2025-ACM-001 proposes this exact fix — awaiting approval.",
        createdAt: daysAgo(13, 2, 12),
      },
      // ── CRITICAL #2 ───────────────────────────────────────────────────────
      {
        key: "find-hardcoded-secrets",
        engagementKey: "eng-acme-baseline",
        title: "Hardcoded Production Stripe Key Exposed in Source",
        severity: "critical",
        category: "Sensitive Data Exposure",
        owasp: "A05:2021 — Security Misconfiguration",
        endpoint: "/.git/HEAD",
        method: "GET",
        description:
          "The production Stripe secret key (sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl) is hardcoded as a string literal in payment-gw.js and committed to the repository. Combined with the exposed /.git/HEAD endpoint, an attacker can clone the full repo and extract the key. This violates CWE-798 (Use of Hardcoded Credentials) and PCI-DSS Requirement 3.4.",
        proofRequest:
          "GET /.git/HEAD HTTP/1.1\nHost: api.acme-corp.com\n",
        proofResponse:
          "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nref: refs/heads/main\n\n# After cloning: grep -E 'sk_live_' payment-gw.js\n# → sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl",
        payload: "sk_live_51O0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFghijkl",
        confidence: 1.0,
        remediation:
          "Move secrets to environment variables backed by a secrets manager. Rotate the exposed Stripe key immediately. Patch SP-2025-ACM-002 proposed this fix but was rejected — reviewer wanted a larger secrets-manager migration.",
        createdAt: daysAgo(13, 2, 14),
      },
      // ── HIGH #1 ───────────────────────────────────────────────────────────
      {
        key: "find-path-traversal",
        engagementKey: "eng-acme-deepscan",
        title: "Path Traversal in /api/files/download via Filename Parameter",
        severity: "high",
        category: "Path Traversal",
        owasp: "A01:2021 — Broken Access Control",
        endpoint: "/api/files/download?file=../../etc/passwd",
        method: "GET",
        description:
          "The /api/files/download endpoint uses path.join() with an unsanitized filename parameter. path.join() does not prevent directory traversal — supplying ../../etc/passwd returns /etc/passwd. Under HIPAA this constitutes an impermissible disclosure of PHI if patient document paths can be reached. Violates CWE-22 (Path Traversal).",
        proofRequest:
          "GET /api/files/download?file=../../etc/passwd HTTP/1.1\nHost: api.acme-corp.com\n",
        proofResponse:
          "HTTP/1.1 200 OK\nContent-Type: application/octet-stream\n\nroot:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\n...",
        payload: "../../etc/passwd",
        confidence: 0.97,
        remediation:
          "Resolve and verify the path stays inside UPLOAD_DIR before reading. Patch SP-2025-HGS-001 proposes this fix — awaiting approval.",
        createdAt: daysAgo(6, 2, 16),
      },
      // ── HIGH #2 ───────────────────────────────────────────────────────────
      {
        key: "find-nosqli",
        engagementKey: "eng-acme-deepscan",
        title: "NoSQL Injection in /api/v2/users/search via $ne Operator",
        severity: "high",
        category: "NoSQL Injection",
        owasp: "A03:2021 — Injection",
        endpoint: "/api/v2/users/search",
        method: "POST",
        description:
          "The /api/v2/users/search endpoint passes the request body directly to MongoDB's findOne(), allowing an attacker to submit Mongo operators. Payload {\"email\":\"admin@acme-corp.com\",\"password\":{\"$ne\":null}} returns the admin user without knowing the password. Violates CWE-943 (Improper Neutralization of Special Elements in Data Query Logic).",
        proofRequest:
          "POST /api/v2/users/search HTTP/1.1\nHost: api.acme-corp.com\nContent-Type: application/json\n\n{\"email\":\"admin@acme-corp.com\",\"password\":{\"$ne\":null}}",
        proofResponse:
          "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"ok\":true,\"token\":\"tok_5f8a9b2c\",\"user\":\"admin@acme-corp.com\",\"role\":\"admin\"}",
        payload: "{\"email\":\"admin@acme-corp.com\",\"password\":{\"$ne\":null}}",
        confidence: 0.95,
        remediation:
          "Destructure expected fields from req.body and enforce they are plain strings before querying. Patch SP-2025-TST-001 (already approved) shows this pattern.",
        createdAt: daysAgo(6, 2, 19),
      },
      // ── MEDIUM #1 ─────────────────────────────────────────────────────────
      {
        key: "find-rate-limit",
        engagementKey: "eng-acme-baseline",
        title: "Missing Rate Limiting on /api/login — Brute-Force Card Testing",
        severity: "medium",
        category: "Brute Force",
        owasp: "A04:2021 — Insecure Design",
        endpoint: "/api/login",
        method: "POST",
        description:
          "The /api/login endpoint imposes no rate limit. An attacker can submit 100+ login attempts per second to brute-force passwords or enumerate valid email addresses via timing differences. PCI-DSS Requirement 8.3.1 requires rate-limiting on authentication endpoints. Violates CWE-307 (Improper Restriction of Excessive Authentication Attempts).",
        proofRequest:
          "# 100 login attempts in 5 seconds — all accepted (no 429):\nfor i in $(seq 1 100); do\n  curl -X POST https://api.acme-corp.com/login \\\n    -H 'Content-Type: application/json' \\\n    -d '{\"email\":\"victim@acme-corp.com\",\"password\":\"guess'\"'$i'\"'\"}'\ndone",
        proofResponse:
          "# All 100 requests returned 401 (none rate-limited):\nHTTP/1.1 401 Unauthorized\nHTTP/1.1 401 Unauthorized\n... (100 times, no 429 Too Many Requests)",
        payload: "100 sequential login attempts with no 429",
        confidence: 0.88,
        remediation:
          "Apply a per-IP + per-account rate limit (e.g. 5 attempts / minute) using a token-bucket limiter in front of /api/login. Lock the account after 10 failed attempts.",
        createdAt: daysAgo(13, 2, 16),
      },
      // ── MEDIUM #2 ─────────────────────────────────────────────────────────
      {
        key: "find-verbose-errors",
        engagementKey: "eng-acme-deepscan",
        title: "Verbose Error Responses Disclose Stack Traces and File Paths",
        severity: "medium",
        category: "Information Disclosure",
        owasp: "A05:2021 — Security Misconfiguration",
        endpoint: "/api/v2/transactions/lookup",
        method: "GET",
        description:
          "When /api/v2/transactions/lookup receives an invalid transaction ID, the server returns a full stack trace including internal file paths, library versions (Express 4.18.2, pg 8.11.3), and a fragment of the SQL query. This information helps an attacker plan further attacks (e.g. crafting SQLi payloads against the disclosed pg version). Violates CWE-209 (Generation of Error Message Containing Sensitive Information).",
        proofRequest:
          "GET /api/v2/transactions/lookup?id=' OR 1=1-- HTTP/1.1\nHost: api.acme-corp.com\n",
        proofResponse:
          "HTTP/1.1 500 Internal Server Error\nContent-Type: text/plain\n\nError: syntax error at or near \"OR\"\n    at Parser.parseErrorMessage (/app/node_modules/pg/lib/client.js:718:13)\n    at /app/routes/transactions.js:42:18\n    at processTicksAndRejections (node:internal/process/task_queues:96:5)\nLibrary versions: express@4.18.2, pg@8.11.3\nSQL: SELECT * FROM transactions WHERE id = '' OR 1=1--'",
        payload: "' OR 1=1--",
        confidence: 0.82,
        remediation:
          "Return a generic error message (e.g. 'Transaction lookup failed') to the client; log the full stack trace server-side only. Disable Express's stack-trace output in production (NODE_ENV=production).",
        createdAt: daysAgo(6, 2, 21),
      },
    ];

    for (const spec of findingSpecs) {
      const existing = await db.finding.findFirst({
        where: { title: spec.title, engagementId: engagementIds[spec.engagementKey] },
      });
      if (existing) {
        summary.findings.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.finding.create({
        data: {
          id,
          engagementId: engagementIds[spec.engagementKey],
          title: spec.title,
          severity: spec.severity,
          category: spec.category,
          owasp: spec.owasp,
          endpoint: spec.endpoint,
          method: spec.method,
          description: spec.description,
          proofRequest: spec.proofRequest,
          proofResponse: spec.proofResponse,
          payload: spec.payload,
          confidence: spec.confidence,
          remediation: spec.remediation,
          createdAt: spec.createdAt,
        },
      });
      summary.findings.created++;
    }

    // ── 8. Canary tokens (3 — different resource types) ─────────────────────
    const canarySpecs = [
      {
        key: "canary-stripe-key",
        targetKey: "acme-prod",
        label: "Stripe API Key Canary",
        canaryType: "api_key",
        canaryValue: "sk_canary_acme_7f3e2a1b9c4d8e5f6a0b1c2d3e4f5a6b",
        injectedEndpoint: "/.env",
        isActive: true,
        detected: false,
        createdAt: daysAgo(10, 12),
      },
      {
        key: "canary-db-credential",
        targetKey: "acme-prod",
        label: "Database Connection String Canary",
        canaryType: "database",
        canaryValue:
          "postgres://canary_user:CanaryToken2025!@db-canary.acme-corp.com:5432/decoy",
        injectedEndpoint: "/config/database.yml",
        isActive: true,
        detected: false,
        createdAt: daysAgo(7, 9),
      },
      {
        key: "canary-aws-credential",
        targetKey: "techstart-staging",
        label: "AWS Access Key Canary",
        canaryType: "aws_credential",
        canaryValue: "AKIA-Canary-TechStart-9f2a7b4c8e1d3a6b",
        injectedEndpoint: "/backup/.aws/credentials",
        isActive: true,
        detected: false,
        createdAt: daysAgo(3, 15),
      },
    ];

    for (const spec of canarySpecs) {
      const existing = await db.canary.findFirst({
        where: { canaryValue: spec.canaryValue },
      });
      if (existing) {
        summary.canaries.skipped++;
        continue;
      }
      const id = randomUUID();
      await db.canary.create({
        data: {
          id,
          targetId: targetIds[spec.targetKey],
          label: spec.label,
          canaryType: spec.canaryType,
          canaryValue: spec.canaryValue,
          injectedEndpoint: spec.injectedEndpoint,
          isActive: spec.isActive,
          detected: spec.detected,
          createdAt: spec.createdAt,
        },
      });
      summary.canaries.created++;
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
  }

  summary.durationMs = Date.now() - startedAt;

  // bump() keeps the linter happy by referencing the import; safe to elide.
  void bump;

  return summary;
}

// ── CLI entry point — only runs when invoked directly via `bun run` ─────────
// We check `process.argv[1]` rather than `import.meta.main` so this works the
// same in Node and Bun without needing type augmentations for ImportMeta.

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  /seed-demo-data(\.ts)?$/.test(process.argv[1]);

async function main() {
  console.log("GuardianX — Seeding demo data...\n");
  const summary = await seedDemoData();

  const fmt = (n: { created: number; skipped: number }) =>
    `${n.created} created, ${n.skipped} skipped`;

  console.log("──────────────────────────────────────────────────────────");
  console.log(`Clients      : ${fmt(summary.clients)}`);
  console.log(`Codebases    : ${fmt(summary.codebases)}`);
  console.log(`Scans        : ${fmt(summary.scans)}`);
  console.log(`Patches      : ${fmt(summary.patches)}`);
  console.log(`Targets      : ${fmt(summary.targets)}`);
  console.log(`Engagements  : ${fmt(summary.engagements)}`);
  console.log(`Findings     : ${fmt(summary.findings)}`);
  console.log(`Canaries     : ${fmt(summary.canaries)}`);
  console.log(`Duration     : ${summary.durationMs}ms`);
  if (summary.errors.length > 0) {
    console.log(`Errors       : ${summary.errors.length}`);
    for (const e of summary.errors) console.log(`  - ${e}`);
  }
  console.log("──────────────────────────────────────────────────────────");
  console.log("✅ Done. The GuardianX console should now feel alive.");
}

if (isMainModule) {
  main()
    .then(() => db.$disconnect())
    .catch(async (e) => {
      console.error("Seed failed:", e);
      await db.$disconnect();
      process.exit(1);
    });
}
