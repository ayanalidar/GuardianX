// GuardianX — Seed dummy clients with varied pipeline stages
// Run: bun run scripts/seed-clients.ts

const SUPABASE_URL = "https://ekjsieovspkuqdjhxwct.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER";

async function insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${table} insert failed: ${res.status} ${text.slice(0, 200)}`);
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  console.log("Seeding dummy clients...\n");

  // ── 6 dummy clients with varied pipeline stages ──────────────────────────
  const clients = [
    {
      id: "client-globex",
      name: "Globex Corporation",
      description: "Fortune 500 SaaS platform with multi-tenant architecture. Payment processing + user data.",
      contactName: "Sarah Chen",
      contactEmail: "sarah@globex.com",
      contactPhone: "+1 415 555 0142",
      targetUrl: "https://app.globex.com",
      repoUrl: "https://github.com/globex/platform",
      scope: "All endpoints under app.globex.com and api.globex.com. Exclude /internal/* and /health.",
      authorized: true,
      frameworks: "DPDPA,GDPR,PCI-DSS,SOC 2",
      status: "defending",
    },
    {
      id: "client-initech",
      name: "Initech LLC",
      description: "Enterprise ERP system with legacy PHP backend. Migrating to Node.js microservices.",
      contactName: "Peter Gibbons",
      contactEmail: "peter@initech.io",
      contactPhone: "+1 512 555 0199",
      targetUrl: "https://erp.initech.io",
      repoUrl: "https://github.com/initech/erp",
      scope: "Full ERP application + REST API. Include /api/v2/* in scope.",
      authorized: true,
      frameworks: "ISO 27001,SOC 2",
      status: "patching",
    },
    {
      id: "client-umbrella",
      name: "Umbrella Health",
      description: "Healthcare telemedicine platform. HIPAA compliance critical. Patient records + video calls.",
      contactName: "Dr. Alice Wells",
      contactEmail: "awells@umbrellahealth.com",
      contactPhone: "+1 617 555 0177",
      targetUrl: "https://portal.umbrellahealth.com",
      repoUrl: "https://github.com/umbrella/telemed",
      scope: "Patient portal + video service API. Exclude billing system.",
      authorized: true,
      frameworks: "HIPAA,GDPR,ISO 27001",
      status: "scanning",
    },
    {
      id: "client-stark",
      name: "Stark Industries",
      description: "Industrial IoT platform controlling manufacturing robots. Real-time data + OTA firmware updates.",
      contactName: "Tony Stark",
      contactEmail: "tony@starkindustries.com",
      contactPhone: "+1 212 555 0100",
      targetUrl: "https://iot.starkindustries.com",
      repoUrl: "https://github.com/stark/iot-platform",
      scope: "IoT control plane + device API. OTA firmware endpoint in scope.",
      authorized: true,
      frameworks: "ISO 27001,NIST",
      status: "testing",
    },
    {
      id: "client-wayne",
      name: "Wayne Enterprises",
      description: "Financial trading platform with real-time market data. High-frequency trading API.",
      contactName: "Bruce Wayne",
      contactEmail: "bruce@wayne-ent.com",
      contactPhone: "+1 212 555 0123",
      targetUrl: "https://trade.wayne-ent.com",
      repoUrl: "https://github.com/wayne/trading",
      scope: "Trading API + portfolio dashboard. Exclude market data feed (third-party).",
      authorized: false,
      frameworks: "PCI-DSS,SOC 2,NIST",
      status: "onboarding",
    },
    {
      id: "client-hooli",
      name: "Hooli Inc",
      description: "Social media platform with 50M users. User-generated content + real-time messaging.",
      contactName: "Gavin Belson",
      contactEmail: "gavin@hooli.com",
      contactPhone: "+1 650 555 0166",
      targetUrl: "https://hooli.com",
      repoUrl: "https://github.com/hooli/social",
      scope: "Full social platform + messaging API. Exclude ads infrastructure.",
      authorized: true,
      frameworks: "DPDPA,GDPR,CCPA",
      status: "compliant",
    },
  ];

  // Insert clients
  for (const c of clients) {
    await insert("Client", c);
    console.log(`✓ Client: ${c.name} [${c.status}]`);
  }

  // ── Codebases for each client ─────────────────────────────────────────────
  const codebases = [
    // Globex — 2 codebases (scanning/defending stage)
    { id: "cb-globex-api", clientId: "client-globex", name: "payment-api.js", language: "javascript", description: "Payment processing service with Stripe integration", sourceCode: "const stripe = require('stripe')(process.env.STRIPE_KEY);\nasync function charge(card, amount) {\n  return stripe.charges.create({ amount, source: card });\n}\nmodule.exports = { charge };" },
    { id: "cb-globex-auth", clientId: "client-globex", name: "auth-service.js", language: "javascript", description: "JWT authentication with SQL injection vuln", sourceCode: "const db = require('./db');\nasync function login(email, password) {\n  const q = \"SELECT * FROM users WHERE email='\" + email + \"' AND password='\" + password + \"'\";\n  return db.query(q);\n}\nmodule.exports = { login };" },

    // Initech — 1 codebase (patching stage)
    { id: "cb-initech-erp", clientId: "client-initech", name: "erp-controller.js", language: "javascript", description: "ERP controller with path traversal + XSS", sourceCode: "const fs = require('fs');\nfunction getFile(name) {\n  return fs.readFileSync('/data/' + name);\n}\nmodule.exports = { getFile };" },

    // Umbrella — 1 codebase (scanning stage)
    { id: "cb-umbrella-portal", clientId: "client-umbrella", name: "patient-portal.js", language: "javascript", description: "Patient portal with insecure deserialization", sourceCode: "const unserialize = require('node-serialize');\nfunction parseSession(data) {\n  return unserialize.unserialize(data);\n}\nmodule.exports = { parseSession };" },

    // Stark — 1 codebase (testing stage)
    { id: "cb-stark-iot", clientId: "client-stark", name: "device-control.js", language: "javascript", description: "IoT device control with command injection", sourceCode: "const { exec } = require('child_process');\nfunction reboot(deviceId) {\n  exec('reboot ' + deviceId, (err) => {});\n}\nmodule.exports = { reboot };" },

    // Hooli — 1 codebase (compliant)
    { id: "cb-hooli-feed", clientId: "client-hooli", name: "feed-service.js", language: "javascript", description: "Social feed service — patched and verified", sourceCode: "const db = require('./db');\nasync function getFeed(userId) {\n  return db.query('SELECT * FROM posts WHERE user_id = ?', [userId]);\n}\nmodule.exports = { getFeed };" },
  ];

  for (const cb of codebases) {
    await insert("Codebase", cb);
    console.log(`  ✓ Codebase: ${cb.name} → ${cb.clientId}`);
  }

  // ── Targets for each client ───────────────────────────────────────────────
  const targets = [
    { id: "tgt-globex", clientId: "client-globex", name: "Globex Production", baseUrl: "https://app.globex.com", authorized: true },
    { id: "tgt-initech", clientId: "client-initech", name: "Initech ERP", baseUrl: "https://erp.initech.io", authorized: true },
    { id: "tgt-umbrella", clientId: "client-umbrella", name: "Umbrella Portal", baseUrl: "https://portal.umbrellahealth.com", authorized: true },
    { id: "tgt-stark", clientId: "client-stark", name: "Stark IoT", baseUrl: "https://iot.starkindustries.com", authorized: true },
    { id: "tgt-hooli", clientId: "client-hooli", name: "Hooli Social", baseUrl: "https://hooli.com", authorized: true },
  ];

  for (const t of targets) {
    await insert("Target", t);
    console.log(`  ✓ Target: ${t.name} → ${t.clientId}`);
  }

  // ── Scans (for clients in scanning+ stages) ──────────────────────────────
  const scans = [
    { id: "scan-globex-1", codebaseId: "cb-globex-api", status: "completed", stageLabel: "Completed — 3 patches", startedAt: "2026-07-28T10:00:00Z", completedAt: "2026-07-28T10:02:30Z" },
    { id: "scan-globex-2", codebaseId: "cb-globex-auth", status: "completed", stageLabel: "Completed — 2 patches", startedAt: "2026-07-29T14:00:00Z", completedAt: "2026-07-29T14:01:45Z" },
    { id: "scan-initech-1", codebaseId: "cb-initech-erp", status: "completed", stageLabel: "Completed — 2 patches", startedAt: "2026-07-30T09:00:00Z", completedAt: "2026-07-30T09:02:10Z" },
    { id: "scan-umbrella-1", codebaseId: "cb-umbrella-portal", status: "completed", stageLabel: "Completed — 1 patch", startedAt: "2026-07-31T08:00:00Z", completedAt: "2026-07-31T08:01:30Z" },
    { id: "scan-stark-1", codebaseId: "cb-stark-iot", status: "completed", stageLabel: "Completed — 2 patches", startedAt: "2026-07-31T11:00:00Z", completedAt: "2026-07-31T11:02:00Z" },
    { id: "scan-hooli-1", codebaseId: "cb-hooli-feed", status: "completed", stageLabel: "Completed — 0 patches (clean)", startedAt: "2026-07-25T10:00:00Z", completedAt: "2026-07-25T10:01:00Z" },
  ];

  for (const s of scans) {
    await insert("Scan", s);
    console.log(`  ✓ Scan: ${s.id} [${s.status}]`);
  }

  // ── Patches ──────────────────────────────────────────────────────────────
  const patches = [
    // Globex — patches approved (defending stage)
    { id: "patch-globex-1", patchId: "SP-2026-GLO-001", codebaseId: "cb-globex-api", scanId: "scan-globex-1", title: "Stripe Key Exposure in Error Logs", severity: "critical", cve: "CWE-532", affectedFile: "payment-api.js", aiExplanation: "Stripe secret key logged in error responses", aiReasoning: "AI detected logging of full Stripe key", confidence: 0.95, originalCode: "return stripe.charges.create({ amount, source: card });", patchedCode: "return stripe.charges.create({ amount, source: card }).catch(e => { throw new Error('Payment failed'); });", diffPayload: "--- a/payment-api.js\n+++ b/payment-api.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, exploitCode: "// exploit", status: "approved", approvedAt: "2026-07-28T11:00:00Z" },
    { id: "patch-globex-2", patchId: "SP-2026-GLO-002", codebaseId: "cb-globex-auth", scanId: "scan-globex-2", title: "SQL Injection in Login", severity: "critical", cve: "CWE-89", affectedFile: "auth-service.js", aiExplanation: "SQL injection via string concatenation in login query", aiReasoning: "AI detected unsanitized email/password in SQL", confidence: 1.0, originalCode: "const q = \"SELECT * FROM users WHERE email='\" + email + \"'\";", patchedCode: "const q = \"SELECT * FROM users WHERE email=?\";\nreturn db.query(q, [email]);", diffPayload: "--- a/auth-service.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, exploitCode: "// exploit", status: "approved", approvedAt: "2026-07-29T15:00:00Z" },
    { id: "patch-globex-3", patchId: "SP-2026-GLO-003", codebaseId: "cb-globex-api", scanId: "scan-globex-1", title: "Missing Rate Limiting on Charge Endpoint", severity: "medium", cve: "CWE-770", affectedFile: "payment-api.js", aiExplanation: "No rate limiting allows brute-force card testing", aiReasoning: "AI detected no rate limiter on charge()", confidence: 0.85, originalCode: "async function charge(card, amount) {", patchedCode: "const rateLimit = require('express-rate-limit');\nasync function charge(card, amount) {", diffPayload: "--- a/payment-api.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, status: "approved", approvedAt: "2026-07-28T11:30:00Z" },

    // Initech — patches pending (patching stage)
    { id: "patch-initech-1", patchId: "SP-2026-INI-001", codebaseId: "cb-initech-erp", scanId: "scan-initech-1", title: "Path Traversal in File Loader", severity: "critical", cve: "CWE-22", affectedFile: "erp-controller.js", aiExplanation: "Path traversal via unsanitized filename", aiReasoning: "AI detected direct file path concatenation", confidence: 0.98, originalCode: "return fs.readFileSync('/data/' + name);", patchedCode: "const path = require('path');\nconst safe = path.resolve('/data/', name);\nif (!safe.startsWith('/data/')) throw new Error('Invalid path');\nreturn fs.readFileSync(safe);", diffPayload: "--- a/erp-controller.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, status: "pending" },
    { id: "patch-initech-2", patchId: "SP-2026-INI-002", codebaseId: "cb-initech-erp", scanId: "scan-initech-1", title: "XSS in ERP Dashboard", severity: "high", cve: "CWE-79", affectedFile: "erp-controller.js", aiExplanation: "Reflected XSS via unsanitized query param", aiReasoning: "AI detected unescaped output", confidence: 0.92, originalCode: "res.send('<h1>' + req.query.name + '</h1>');", patchedCode: "res.send('<h1>' + escapeHtml(req.query.name) + '</h1>');", diffPayload: "--- a/erp-controller.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, status: "pending" },

    // Umbrella — 1 patch pending (scanning → patching)
    { id: "patch-umbrella-1", patchId: "SP-2026-UMB-001", codebaseId: "cb-umbrella-portal", scanId: "scan-umbrella-1", title: "Insecure Deserialization", severity: "critical", cve: "CWE-502", affectedFile: "patient-portal.js", aiExplanation: "node-serialize.unserialize allows RCE", aiReasoning: "AI detected unsafe deserialization of user input", confidence: 1.0, originalCode: "return unserialize.unserialize(data);", patchedCode: "const Joi = require('joi');\n// Use JSON.parse with schema validation instead\nreturn JSON.parse(data);", diffPayload: "--- a/patient-portal.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, status: "pending" },

    // Stark — 2 patches (testing stage)
    { id: "patch-stark-1", patchId: "SP-2026-STR-001", codebaseId: "cb-stark-iot", scanId: "scan-stark-1", title: "Command Injection in Device Reboot", severity: "critical", cve: "CWE-78", affectedFile: "device-control.js", aiExplanation: "exec() with unsanitized deviceId allows shell injection", aiReasoning: "AI detected exec() with string concatenation", confidence: 1.0, originalCode: "exec('reboot ' + deviceId, (err) => {});", patchedCode: "const { execFile } = require('child_process');\nexecFile('reboot', [deviceId], (err) => {});", diffPayload: "--- a/device-control.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, exploitCode: "// exploit", status: "pending" },
    { id: "patch-stark-2", patchId: "SP-2026-STR-002", codebaseId: "cb-stark-iot", scanId: "scan-stark-1", title: "Missing Authentication on IoT Control", severity: "high", cve: "CWE-306", affectedFile: "device-control.js", aiExplanation: "No auth check before device reboot", aiReasoning: "AI detected no middleware", confidence: 0.88, originalCode: "function reboot(deviceId) {", patchedCode: "function reboot(deviceId, user) {\n  if (!user.canControlDevices) throw new Error('Unauthorized');", diffPayload: "--- a/device-control.js", testCode: "// test", sandboxLogs: "[sandbox] PASSED", sandboxPassed: true, status: "pending" },
  ];

  for (const p of patches) {
    await insert("Patch", p);
    console.log(`  ✓ Patch: ${p.patchId} [${p.severity}] [${p.status}]`);
  }

  // ── Engagements (DAST) for clients with targets ──────────────────────────
  const engagements = [
    { id: "eng-globex-1", targetId: "tgt-globex", status: "completed", stageLabel: "Completed — 3 findings", startedAt: "2026-07-28T12:00:00Z", completedAt: "2026-07-28T12:03:00Z" },
    { id: "eng-initech-1", targetId: "tgt-initech", status: "completed", stageLabel: "Completed — 2 findings", startedAt: "2026-07-30T10:00:00Z", completedAt: "2026-07-30T10:02:30Z" },
    { id: "eng-umbrella-1", targetId: "tgt-umbrella", status: "queued", stageLabel: "Queued — waiting for engine", startedAt: "2026-07-31T12:00:00Z" },
    { id: "eng-stark-1", targetId: "tgt-stark", status: "completed", stageLabel: "Completed — 2 findings", startedAt: "2026-07-31T11:30:00Z", completedAt: "2026-07-31T11:33:00Z" },
    { id: "eng-hooli-1", targetId: "tgt-hooli", status: "completed", stageLabel: "Completed — 0 findings (clean)", startedAt: "2026-07-25T11:00:00Z", completedAt: "2026-07-25T11:02:00Z" },
  ];

  for (const e of engagements) {
    await insert("Engagement", e);
    console.log(`  ✓ Engagement: ${e.id} [${e.status}]`);
  }

  // ── Findings (DAST results) ───────────────────────────────────────────────
  const findings = [
    // Globex — 3 findings
    { id: "find-globex-1", engagementId: "eng-globex-1", title: "Exposed .env File", severity: "critical", category: "Sensitive Data Exposure", owasp: "A05:2021", endpoint: "/.env", method: "GET", description: "Environment file exposed containing DB credentials", proofRequest: "GET /.env HTTP/1.1", proofResponse: "HTTP/1.1 200 OK\nDB_PASSWORD=...", payload: null, confidence: 1.0, remediation: "Block .env access via web server config" },
    { id: "find-globex-2", engagementId: "eng-globex-1", title: "Reflected XSS in Search", severity: "high", category: "XSS", owasp: "A03:2021", endpoint: "/search?q=<script>", method: "GET", description: "Search query reflected without encoding", proofRequest: "GET /search?q=<script>alert(1)</script>", proofResponse: "HTTP/1.1 200 OK\n<script>alert(1)</script>", payload: "<script>alert(1)</script>", confidence: 0.95, remediation: "Encode all user input in HTML output" },
    { id: "find-globex-3", engagementId: "eng-globex-1", title: "Open Redirect", severity: "medium", category: "Open Redirect", owasp: "A01:2021", endpoint: "/redirect?url=https://evil.com", method: "GET", description: "Redirect endpoint allows arbitrary URLs", proofRequest: "GET /redirect?url=https://evil.com", proofResponse: "HTTP/1.1 302 Found\nLocation: https://evil.com", payload: "https://evil.com", confidence: 0.9, remediation: "Validate redirect URLs against allowlist" },

    // Initech — 2 findings
    { id: "find-initech-1", engagementId: "eng-initech-1", title: "SQL Injection in Login", severity: "critical", category: "SQL Injection", owasp: "A03:2021", endpoint: "/api/login", method: "POST", description: "SQL injection in email parameter", proofRequest: "POST /api/login {\"email\":\"' OR 1=1--\"}", proofResponse: "HTTP/1.1 200 OK\n{\"admin\":true}", payload: "' OR 1=1--", confidence: 1.0, remediation: "Use parameterized queries" },
    { id: "find-initech-2", engagementId: "eng-initech-1", title: "Path Traversal in File Download", severity: "critical", category: "Path Traversal", owasp: "A01:2021", endpoint: "/file?name=../../../etc/passwd", method: "GET", description: "File download allows directory traversal", proofRequest: "GET /file?name=../../../etc/passwd", proofResponse: "HTTP/1.1 200 OK\nroot:x:0:0:root:/root:/bin/bash", payload: "../../../etc/passwd", confidence: 1.0, remediation: "Validate and sanitize file paths" },

    // Stark — 2 findings
    { id: "find-stark-1", engagementId: "eng-stark-1", title: "Command Injection in Reboot API", severity: "critical", category: "Command Injection", owasp: "A03:2021", endpoint: "/api/device/reboot", method: "POST", description: "Device ID allows shell command injection", proofRequest: "POST /api/device/reboot {\"id\":\";id\"}", proofResponse: "HTTP/1.1 200 OK\nuid=0(root)", payload: ";id", confidence: 1.0, remediation: "Use execFile instead of exec" },
    { id: "find-stark-2", engagementId: "eng-stark-1", title: "Missing Authentication on Control API", severity: "high", category: "Broken Access Control", owasp: "A01:2021", endpoint: "/api/device/reboot", method: "POST", description: "No auth required to reboot devices", proofRequest: "POST /api/device/reboot (no auth header)", proofResponse: "HTTP/1.1 200 OK", payload: null, confidence: 0.95, remediation: "Require authentication on all control endpoints" },
  ];

  for (const f of findings) {
    await insert("Finding", f);
    console.log(`  ✓ Finding: ${f.title} [${f.severity}]`);
  }

  // ── Canaries (for defending client) ───────────────────────────────────────
  const canaries = [
    { id: "canary-globex-1", targetId: "tgt-globex", label: "DB Honey Token", canaryType: "database", canaryValue: "canary-token-glx-db-2026", injectedEndpoint: "/.env", isActive: true, detected: false },
    { id: "canary-globex-2", targetId: "tgt-globex", label: "API Key Canary", canaryType: "api_key", canaryValue: "canary-key-glx-api-2026", injectedEndpoint: "/config", isActive: true, detected: false },
  ];

  for (const c of canaries) {
    await insert("Canary", c);
    console.log(`  ✓ Canary: ${c.label} → ${c.targetId}`);
  }

  console.log("\n✅ Done! 6 clients seeded with varied pipeline stages:");
  console.log("   • Globex Corporation  → defending (3 patches approved, 3 findings, 2 canaries)");
  console.log("   • Initech LLC         → patching (2 patches pending, 2 findings)");
  console.log("   • Umbrella Health     → scanning (1 patch pending, 1 engagement queued)");
  console.log("   • Stark Industries    → testing (2 patches pending, 2 findings)");
  console.log("   • Wayne Enterprises   → onboarding (not authorized yet)");
  console.log("   • Hooli Inc           → compliant (clean scan, 0 findings)");
}

main().catch(console.error);
