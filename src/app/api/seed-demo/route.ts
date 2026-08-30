import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const results = { clients: 0, codebases: 0, scans: 0, patches: 0, findings: 0, targets: 0, engagements: 0, skipped: 0, errors: [] as string[] };

  try {
    const clientSpecs = [
      { name: "Acme Corp", description: "Finance sector client", status: "active" },
      { name: "TechStart Inc", description: "SaaS platform client", status: "active" },
      { name: "CloudNine Ltd", description: "Healthcare sector client", status: "onboarding" },
    ];
    const clientIds: Record<string, string> = {};
    for (const spec of clientSpecs) {
      const existing = await db.client.findFirst({ where: { name: spec.name } });
      if (existing) { results.skipped++; clientIds[spec.name] = existing.id; continue; }
      const c = await db.client.create({ data: { id: randomUUID(), name: spec.name, description: spec.description, status: spec.status, authorized: true } });
      clientIds[spec.name] = c.id;
      results.clients++;
    }

    const codebaseSpecs = [
      { name: "auth-service.js", language: "javascript", description: "Login module with SQL injection vulnerability", client: "Acme Corp" },
      { name: "payment-api.js", language: "javascript", description: "Payment processing with XSS vulnerability", client: "TechStart Inc" },
      { name: "user-portal.js", language: "javascript", description: "User portal with path traversal", client: "Acme Corp" },
      { name: "admin-panel.js", language: "javascript", description: "Admin panel with hardcoded secrets", client: "TechStart Inc" },
    ];
    const codebaseIds: Record<string, string> = {};
    for (const spec of codebaseSpecs) {
      const existing = await db.codebase.findFirst({ where: { name: spec.name } });
      if (existing) { results.skipped++; codebaseIds[spec.name] = existing.id; continue; }
      const cb = await db.codebase.create({
        data: {
          id: randomUUID(),
          name: spec.name,
          language: spec.language,
          description: spec.description,
          sourceCode: "// Vulnerable code sample\nconst db = require('./db');\nasync function login(email, password) {\n  const query = \"SELECT * FROM users WHERE email = '\" + email + \"' AND password = '\" + password + \"'\";\n  return db.query(query);\n}",
          clientId: clientIds[spec.client],
        },
      });
      codebaseIds[spec.name] = cb.id;
      results.codebases++;
    }

    const scanIds: Record<string, string> = {};
    for (const spec of codebaseSpecs) {
      const cbId = codebaseIds[spec.name];
      const existing = await db.scan.findFirst({ where: { codebaseId: cbId } });
      if (existing) { results.skipped++; scanIds[spec.name] = existing.id; continue; }
      const s = await db.scan.create({ data: { id: randomUUID(), codebaseId: cbId, status: "completed", stageLabel: "Scan complete", completedAt: new Date() } });
      scanIds[spec.name] = s.id;
      results.scans++;
    }

    const targetSpecs = [
      { name: "Acme Prod", baseUrl: "https://acme.example.com", client: "Acme Corp" },
      { name: "TechStart API", baseUrl: "https://api.techstart.example.com", client: "TechStart Inc" },
    ];
    const engIds: string[] = [];
    for (const spec of targetSpecs) {
      const existing = await db.target.findFirst({ where: { name: spec.name } });
      let targetId: string;
      if (existing) { results.skipped++; targetId = existing.id; }
      else {
        const t = await db.target.create({ data: { id: randomUUID(), name: spec.name, baseUrl: spec.baseUrl, authorized: true, clientId: clientIds[spec.client] } });
        targetId = t.id;
        results.targets++;
      }
      const eng = await db.engagement.create({ data: { id: randomUUID(), targetId, status: "completed" } });
      engIds.push(eng.id);
      results.engagements++;
    }

    const patchSpecs = [
      { patchId: "SP-ACM-001", title: "SQL Injection in auth-service.js", severity: "critical", status: "pending", codebase: "auth-service.js" },
      { patchId: "SP-TSI-001", title: "XSS in payment-api.js", severity: "high", status: "pending", codebase: "payment-api.js" },
      { patchId: "SP-ACM-002", title: "Missing HSTS header", severity: "medium", status: "pending", codebase: "user-portal.js" },
      { patchId: "SP-ACM-003", title: "Path traversal in user-portal.js", severity: "high", status: "approved", codebase: "user-portal.js" },
      { patchId: "SP-TSI-002", title: "Hardcoded secrets in admin-panel.js", severity: "critical", status: "approved", codebase: "admin-panel.js" },
    ];
    for (const spec of patchSpecs) {
      const existing = await db.patch.findFirst({ where: { patchId: spec.patchId } });
      if (existing) { results.skipped++; continue; }
      await db.patch.create({
        data: {
          id: randomUUID(),
          patchId: spec.patchId,
          codebaseId: codebaseIds[spec.codebase],
          scanId: scanIds[spec.codebase],
          title: spec.title,
          severity: spec.severity,
          status: spec.status,
          affectedFile: spec.codebase,
          originalCode: "const query = \"SELECT * FROM users WHERE email = '\" + email + \"'\";",
          patchedCode: "const query = \"SELECT * FROM users WHERE email = $1\";\ndb.query(query, [email]);",
          diffPayload: "--- original\n+++ patched\n@@ -1 +1,2 @@\n-const query = \"SELECT * FROM users WHERE email = '\" + email + \"'\";\n+const query = \"SELECT * FROM users WHERE email = $1\";\n+db.query(query, [email]);",
          aiExplanation: "User input is concatenated directly into the SQL query string, enabling SQL injection. Fixed by using parameterized queries.",
          aiReasoning: "AI identified unsanitized input flowing into SQL query.",
          testCode: "assert.equal(login(1,1).ok, true);", sandboxLogs: "[]", exploitCode: "null", exploitOriginalResult: "null", exploitPatchedResult: "null", adversarialTranscript: "[]",
          confidence: 0.95,
          sandboxPassed: spec.status === "approved",
          approvedAt: spec.status === "approved" ? new Date() : null,
        },
      });
      results.patches++;
    }

    const findingSpecs = [
      { title: "SQL Injection in login endpoint", severity: "critical", owasp: "A03:2021", idx: 0 },
      { title: "SSRF via webhook URL", severity: "critical", owasp: "A10:2021", idx: 1 },
      { title: "Reflected XSS in search", severity: "high", owasp: "A03:2021", idx: 0 },
      { title: "IDOR in /api/orders/:id", severity: "high", owasp: "A01:2021", idx: 1 },
      { title: "Missing HSTS header", severity: "medium", owasp: "A05:2021", idx: 0 },
      { title: "Verbose error messages", severity: "medium", owasp: "A05:2021", idx: 1 },
    ];
    for (const spec of findingSpecs) {
      const existing = await db.finding.findFirst({ where: { title: spec.title } });
      if (existing) { results.skipped++; continue; }
      await db.finding.create({
        data: {
          id: randomUUID(),
          engagementId: engIds[spec.idx],
          title: spec.title,
          severity: spec.severity,
          owasp: spec.owasp,
          category: "injection", proofRequest: "GET /api/login?email=test@test.com", proofResponse: "HTTP 200 OK",
          description: spec.title + " — detected during automated VAPT scan.",
          endpoint: "/api/login",
          method: "GET",
        },
      });
      results.findings++;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ ok: false, ...results }, { status: 500 });
  }
}
