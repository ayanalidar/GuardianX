import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";

type AuthzTestType =
  | "vertical_privilege_escalation"
  | "horizontal_privilege_escalation"
  | "forced_browsing"
  | "function_level_access_control"
  | "idor"
  | "missing_authorization_header";

interface AuthzResult {
  testType: AuthzTestType;
  label: string;
  vulnerable: boolean;
  severity: Severity;
  cwe: string;
  attempts: {
    method: string;
    url: string;
    status: number;
    durationMs: number;
    responseSnippet: string;
    hadAuthHeader: boolean;
    accessible: boolean;
  }[];
  responseSnippet: string;
  description: string;
  remediation: string;
}

interface RawFinding {
  title: string;
  severity: Severity;
  category: string;
  cwe: string;
  endpoint: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  payload: string;
  remediation: string;
}

// ─── SSRF guard ─────────────────────────────────────────────────────────

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
  }
  if (/\.(local|internal|lan|home)$/.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL. Must include protocol (https://...)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http/https target protocols are allowed." };
  }
  if (isPrivateHost(url.hostname)) {
    return {
      ok: false,
      error: "SSRF guard: target resolves to a private/loopback address. Public targets only.",
    };
  }
  return { ok: true, url };
}

// ─── HTTP probe with 5s AbortController ──────────────────────────────────

interface ProbeResult {
  status: number;
  body: string;
  durationMs: number;
  headers: Record<string, string>;
  ok: boolean;
}

async function fetchWith(
  url: string,
  method: string,
  authToken?: string | null,
  body?: string,
  contentType?: string,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  const headers: Record<string, string> = {
    "User-Agent": "GuardianX-Authz-Tester/1.0",
    Accept: "application/json, text/html, */*",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (body && contentType) {
    headers["Content-Type"] = contentType;
  }
  try {
    const r = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const respBody = await r.text().catch(() => "");
    const respHeaders: Record<string, string> = {};
    r.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
    return {
      status: r.status,
      body: respBody,
      durationMs: Date.now() - start,
      headers: respHeaders,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      durationMs: Date.now() - start,
      headers: {},
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeTruncate(s: string, n = 2000): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} bytes truncated)`;
}

// Heuristic: does the response indicate the endpoint returned data
// (i.e. it was accessible) vs an auth/permission error?
function isAccessible(r: ProbeResult): boolean {
  if (r.status === 0) return false;
  // 200/201/30x (not 302 to /login) → accessible
  if (r.status >= 200 && r.status < 300) {
    // But: if the body looks like a login page, it's actually a redirect
    // to login, not a successful data response.
    if (/<form[^>]*login|please\s+log\s*in|sign\s*in|unauthor/i.test(r.body)) return false;
    return true;
  }
  // 30x to a non-login path → still accessible (server returned a redirect).
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers["location"] || "";
    if (/\/login|\/signin|\/auth/i.test(loc)) return false;
    return true;
  }
  // 401/403 → not accessible
  return false;
}

// ─── Test paths ───────────────────────────────────────────────────────────

const ADMIN_PATHS = [
  "/api/admin",
  "/api/admin/users",
  "/api/admin/settings",
  "/admin",
  "/admin/dashboard",
];

const FORCED_BROWSING_PATHS = [
  "/api/admin",
  "/api/internal",
  "/api/debug",
  "/api/config",
  "/.git/config",
  "/.env",
  "/backup",
  "/api/users/all",
];

const IDOR_PATHS = [
  "/api/users/1",
  "/api/users/2",
  "/api/users/3",
  "/api/orders/1",
  "/api/orders/2",
  "/api/profile/1",
  "/api/profile/2",
  "/api/account/1",
  "/api/account/2",
];

// ─── Test 1: Vertical privilege escalation ────────────────────────────────
// Access admin endpoints with a regular user token (or no token).

async function testVerticalPrivEsc(
  baseUrl: URL,
  authToken?: string,
): Promise<AuthzResult> {
  const attempts: AuthzResult["attempts"] = [];
  let vulnerable = false;
  for (const path of ADMIN_PATHS) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${path}`);
    const r = await fetchWith(u.toString(), "GET", authToken);
    const accessible = isAccessible(r);
    attempts.push({
      method: "GET",
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: !!authToken,
      accessible,
    });
    if (accessible) vulnerable = true;
  }
  return {
    testType: "vertical_privilege_escalation",
    label: "Vertical Privilege Escalation",
    vulnerable,
    severity: vulnerable ? "critical" : "info",
    cwe: "CWE-269",
    attempts,
    responseSnippet: vulnerable
      ? `Admin endpoint accessible with a regular-user token (or none). First accessible admin endpoint: ${attempts.find(a => a.accessible)?.url}`
      : `All ${attempts.length} admin endpoints returned 401/403. No vertical privilege escalation observed.`,
    description: vulnerable
      ? "A regular user can access admin-only endpoints. The server fails to enforce role-based access control."
      : "Admin endpoints are properly protected — they return 401/403 for regular users.",
    remediation:
      "Enforce role checks on every admin endpoint (server-side). Do not rely on UI hiding — verify the user's role on each request via a server-side session/JWT claim.",
  };
}

// ─── Test 2: Horizontal privilege escalation ────────────────────────────
// Access another user's resources with the same token.

async function testHorizontalPrivEsc(
  baseUrl: URL,
  authToken?: string,
): Promise<AuthzResult> {
  const attempts: AuthzResult["attempts"] = [];
  let accessibleCount = 0;

  // /api/users/1, /api/users/2 — if both are accessible, the user can read
  // other users' data (horizontal escalation).
  for (const path of IDOR_PATHS) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${path}`);
    const r = await fetchWith(u.toString(), "GET", authToken);
    const accessible = isAccessible(r);
    attempts.push({
      method: "GET",
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: !!authToken,
      accessible,
    });
    if (accessible) accessibleCount++;
  }

  // If >=2 different user/order/profile IDs are accessible, that's strong
  // evidence of horizontal escalation (one user shouldn't see another's data).
  const vulnerable = accessibleCount >= 2;
  return {
    testType: "horizontal_privilege_escalation",
    label: "Horizontal Privilege Escalation",
    vulnerable,
    severity: vulnerable ? "critical" : "info",
    cwe: "CWE-639",
    attempts,
    responseSnippet: vulnerable
      ? `${accessibleCount} of ${attempts.length} user/order/profile endpoints were accessible with the same token. The server fails to scope data to the requesting user.`
      : `Only ${accessibleCount} of ${attempts.length} user-resource endpoints were accessible (or none). No horizontal escalation observed.`,
    description: vulnerable
      ? "A user can access other users' resources by swapping the ID in the URL. The server does not verify that the requested resource belongs to the requesting user."
      : "User resources are properly scoped — ID swapping does not yield other users' data.",
    remediation:
      "On every object-access request, verify the requested resource's owner matches the requesting user's id (or that the requester has the right role). Use indirect references (UUIDs) and server-side ownership checks.",
  };
}

// ─── Test 3: Forced browsing (no auth) ───────────────────────────────────

async function testForcedBrowsing(
  baseUrl: URL,
): Promise<AuthzResult> {
  const attempts: AuthzResult["attempts"] = [];
  let vulnerable = false;
  for (const path of FORCED_BROWSING_PATHS) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${path}`);
    const r = await fetchWith(u.toString(), "GET", null);
    const accessible = isAccessible(r);
    attempts.push({
      method: "GET",
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: false,
      accessible,
    });
    if (accessible) vulnerable = true;
  }
  return {
    testType: "forced_browsing",
    label: "Forced Browsing",
    vulnerable,
    severity: vulnerable ? "high" : "info",
    cwe: "CWE-552",
    attempts,
    responseSnippet: vulnerable
      ? `Unauthenticated access succeeded for: ${attempts.filter(a => a.accessible).map(a => a.url).join(", ")}`
      : `All ${attempts.length} forced-browsing paths returned 401/403/404. No unauthenticated access observed.`,
    description: vulnerable
      ? "Sensitive endpoints / files (admin paths, .env, .git/config, /backup, /api/internal) are accessible without authentication."
      : "Sensitive paths are properly protected.",
    remediation:
      "Require authentication on every sensitive endpoint. Block access to dotfiles (.git, .env, .htaccess) at the web-server level. Use a deny-by-default middleware.",
  };
}

// ─── Test 4: Function-level access control ────────────────────────────────
// Try POST/DELETE/PUT on read-only endpoints with a regular-user token.

async function testFunctionLevelAccessControl(
  baseUrl: URL,
  authToken?: string,
): Promise<AuthzResult> {
  const attempts: AuthzResult["attempts"] = [];
  let vulnerable = false;

  const writeTests: { method: string; path: string; body?: string }[] = [
    { method: "DELETE", path: "/api/users" },
    { method: "DELETE", path: "/api/users/1" },
    { method: "POST", path: "/api/admin/users", body: JSON.stringify({ name: "gx-test", email: "gx@example.com", role: "admin" }) },
    { method: "PUT", path: "/api/users/1", body: JSON.stringify({ role: "admin" }) },
    { method: "PATCH", path: "/api/users/1", body: JSON.stringify({ role: "admin" }) },
    { method: "POST", path: "/api/admin/settings", body: JSON.stringify({ maintenanceMode: true }) },
  ];

  for (const t of writeTests) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${t.path}`);
    const r = await fetchWith(u.toString(), t.method, authToken, t.body, "application/json");
    // 200/201/204 → write succeeded → vulnerable
    // 405 Method Not Allowed → safe
    // 401/403 → safe
    const accessible = r.status >= 200 && r.status < 300;
    attempts.push({
      method: t.method,
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: !!authToken,
      accessible,
    });
    if (accessible) vulnerable = true;
  }

  return {
    testType: "function_level_access_control",
    label: "Function-Level Access Control",
    vulnerable,
    severity: vulnerable ? "high" : "info",
    cwe: "CWE-285",
    attempts,
    responseSnippet: vulnerable
      ? `Write operation succeeded with regular-user token: ${attempts.find(a => a.accessible)?.method} ${attempts.find(a => a.accessible)?.url}`
      : `All ${attempts.length} write attempts returned 401/403/405. Function-level access control is enforced.`,
    description: vulnerable
      ? "A regular user can perform write operations (POST/PUT/DELETE) on endpoints that should be admin-only."
      : "Write operations are properly protected.",
    remediation:
      "Enforce role checks on each route handler — do not rely on HTTP method alone. Centralize authorization in middleware so every handler is protected by default.",
  };
}

// ─── Test 5: IDOR (sequential ID enumeration) ────────────────────────────

async function testIdor(
  baseUrl: URL,
  authToken?: string,
): Promise<AuthzResult> {
  // Reuse the horizontal priv-esc attempts (IDOR_PATHS) but probe a few
  // sequential IDs explicitly. If 3+ sequential user IDs return data,
  // IDOR is confirmed.
  const attempts: AuthzResult["attempts"] = [];
  let accessibleCount = 0;

  for (const path of IDOR_PATHS) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${path}`);
    const r = await fetchWith(u.toString(), "GET", authToken);
    const accessible = isAccessible(r);
    attempts.push({
      method: "GET",
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: !!authToken,
      accessible,
    });
    if (accessible) accessibleCount++;
  }

  // IDOR is "high" severity per spec (vs horizontal priv-esc "critical").
  // We use the same observable but classify differently because IDOR
  // specifically refers to sequential-ID enumeration.
  const vulnerable = accessibleCount >= 3;
  return {
    testType: "idor",
    label: "Insecure Direct Object Reference (IDOR)",
    vulnerable,
    severity: vulnerable ? "high" : "info",
    cwe: "CWE-639",
    attempts,
    responseSnippet: vulnerable
      ? `${accessibleCount} of ${attempts.length} sequential-ID endpoints returned data — direct object references are not protected.`
      : `${accessibleCount} of ${attempts.length} endpoints were accessible — not enough to confirm IDOR via sequential enumeration.`,
    description: vulnerable
      ? "Sequential object IDs (1, 2, 3) can be enumerated to access other users' data without authorization."
      : "Sequential ID enumeration did not yield data.",
    remediation:
      "Use unpredictable object references (UUIDv4) instead of sequential IDs. Always verify ownership on the server before returning object data. Prefer capability-based tokens.",
  };
}

// ─── Test 6: Missing Authorization header ────────────────────────────────
// Access protected endpoints WITHOUT any Authorization header.

async function testMissingAuthzHeader(
  baseUrl: URL,
  authToken?: string,
): Promise<AuthzResult> {
  // We pick the protected-endpoint candidates (admin + a couple of user-resource
  // paths). For each, we access WITHOUT the Authorization header. If the
  // server returns data, missing-authz is confirmed.
  const candidates = [
    ...ADMIN_PATHS.slice(0, 2),
    "/api/users/1",
    "/api/profile",
    "/api/account",
    "/api/orders",
  ];
  const attempts: AuthzResult["attempts"] = [];
  let vulnerable = false;

  for (const path of candidates) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${path}`);
    const r = await fetchWith(u.toString(), "GET", null);
    const accessible = isAccessible(r);
    attempts.push({
      method: "GET",
      url: u.toString(),
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      hadAuthHeader: false,
      accessible,
    });
    if (accessible) vulnerable = true;
  }

  // Side check: if we have an authToken, also verify that supplying the
  // token changes the response (i.e. the endpoint is actually protected).
  let tokenMakesDifference = false;
  if (authToken && attempts.length > 0) {
    const u = new URL(`${baseUrl.protocol}//${baseUrl.host}${candidates[0]}`);
    const rWith = await fetchWith(u.toString(), "GET", authToken);
    tokenMakesDifference = isAccessible(rWith) && !attempts[0].accessible;
  }

  return {
    testType: "missing_authorization_header",
    label: "Missing Authorization Header",
    vulnerable,
    severity: vulnerable ? "critical" : "info",
    cwe: "CWE-862",
    attempts,
    responseSnippet: vulnerable
      ? `Endpoints accessible WITHOUT an Authorization header: ${attempts.filter(a => a.accessible).map(a => a.url).join(", ")}${tokenMakesDifference ? " (note: supplying a token DOES change the response — endpoint is otherwise protected)" : ""}`
      : `All ${attempts.length} endpoints returned 401/403 without an Authorization header.${tokenMakesDifference ? " Supplying a token DID grant access — endpoint is properly auth-gated." : ""}`,
    description: vulnerable
      ? "Protected endpoints can be accessed without an Authorization header — the server does not require auth on routes that should be auth-only."
      : "Endpoints correctly require an Authorization header.",
    remediation:
      "Set a global auth middleware that requires a valid Authorization header on every non-public route. Define a public-route allow-list (e.g. /login, /signup) and require auth on everything else by default.",
  };
}

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const rawTarget = typeof body?.targetUrl === "string" ? body.targetUrl : "";
  const authTokenRaw = typeof body?.authToken === "string" ? body.authToken : "";

  if (!rawTarget) {
    return NextResponse.json(
      { error: "targetUrl is required (e.g. https://app.example.com)." },
      { status: 400 },
    );
  }
  const v = validateUrl(rawTarget);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const targetUrl = v.url;

  try {
    // ── Create Target + Engagement ─────────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `authz:${targetUrl.host}`,
        baseUrl: targetUrl.toString(),
        authorized: true,
        // Stash the test auth-token on the Target (authHeader field) so the
        // Engagement is self-describing. We never log the token value in
        // Finding rows — only that one was supplied.
        ...(authTokenRaw ? { authHeader: "Bearer <redacted>" } : {}),
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id as string,
        status: "attacking",
        stageLabel: "Authz Testing — vertical + horizontal + forced browsing + function-level + IDOR + missing authz header",
      },
    });
    const engagementId = engagement.id as string;

    // ── Run all 6 authz tests in parallel ──────────────────────────────
    // Each test is internally sequential (with 5s AbortController per
    // request). Total budget: ~6 tests × ~6 requests × ~500ms = ~18s.
    const authToken = authTokenRaw.trim() || undefined;
    const [
      vertical,
      horizontal,
      forced,
      functionLevel,
      idor,
      missingAuthz,
    ] = await Promise.all([
      testVerticalPrivEsc(targetUrl, authToken),
      testHorizontalPrivEsc(targetUrl, authToken),
      testForcedBrowsing(targetUrl),
      testFunctionLevelAccessControl(targetUrl, authToken),
      testIdor(targetUrl, authToken),
      testMissingAuthzHeader(targetUrl, authToken),
    ]);

    const allResults: AuthzResult[] = [
      vertical,
      horizontal,
      forced,
      functionLevel,
      idor,
      missingAuthz,
    ];

    // ── Persist Findings ───────────────────────────────────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    const findingsMeta: RawFinding[] = vulnerableResults.map((r) => {
      const proof = r.attempts
        .slice(0, 8)
        .map((a) => `${a.method} ${a.url} → HTTP ${a.status} (${a.durationMs}ms)${a.accessible ? " [ACCESSIBLE]" : ""}`)
        .join("\n");
      return {
        title: `${r.label} — ${r.cwe}`,
        severity: r.severity,
        category: "Authorization",
        cwe: r.cwe,
        endpoint: targetUrl.toString(),
        description: r.description,
        proofRequest:
          `Test type: ${r.testType} (${r.label})\n` +
          `Severity: ${r.severity.toUpperCase()}  |  CWE: ${r.cwe}\n\n` +
          `Requests (first 8):\n${proof}`,
        proofResponse: r.responseSnippet,
        payload: proof,
        remediation: r.remediation,
      };
    });

    for (const f of findingsMeta) {
      try {
        await db.finding.create({
          data: {
            engagementId,
            title: f.title,
            severity: f.severity,
            category: f.category,
            owasp: f.cwe,
            endpoint: f.endpoint,
            method: "GET",
            description: f.description,
            proofRequest: f.proofRequest,
            proofResponse: f.proofResponse,
            payload: f.payload,
            remediation: f.remediation,
            confidence: f.severity === "critical" ? 0.95 : 0.8,
          },
        });
      } catch {
        // swallow
      }
    }

    // ── Update engagement status ───────────────────────────────────────
    const criticalCount = vulnerableResults.filter((r) => r.severity === "critical").length;
    const highCount = vulnerableResults.filter((r) => r.severity === "high").length;
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        stageLabel: `Authz scan complete — ${vulnerableResults.length} finding(s) (${criticalCount} critical, ${highCount} high)`,
        completedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      engagementId,
      targetId: target.id,
      testedBy: user.email,
      targetUrl: targetUrl.toString(),
      hadAuthToken: !!authToken,
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      highCount,
      findings: allResults.map((r) => ({
        testType: r.testType,
        label: r.label,
        vulnerable: r.vulnerable,
        severity: r.severity,
        cwe: r.cwe,
        attempts: r.attempts,
        responseSnippet: r.responseSnippet,
        description: r.description,
        remediation: r.remediation,
      })),
      _meta: {
        targetId: target.id as string,
        performedAt: new Date().toISOString(),
        performedBy: user.email,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Authorization testing failed.",
      },
      { status: 500 },
    );
  }
}

// ─── GET — lightweight descriptor ────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/authorization",
    method: "POST",
    description:
      "Authorization Testing — probes the target for vertical / horizontal privilege escalation, forced browsing, function-level access control, IDOR, and missing-authorization-header vulnerabilities.",
    body: {
      targetUrl: "string (e.g. https://app.example.com)",
      authToken: "string? (optional Bearer token to test authenticated access)",
    },
    tests: [
      "Vertical Privilege Escalation (CWE-269, critical) — admin endpoints with regular-user token",
      "Horizontal Privilege Escalation (CWE-639, critical) — accessing other users' data",
      "Forced Browsing (CWE-552, high) — /api/admin, /api/internal, /api/debug, /api/config, /.git/config, /.env, /backup, /api/users/all",
      "Function-Level Access Control (CWE-285, high) — POST/DELETE/PUT on read-only endpoints",
      "Insecure Direct Object Reference (CWE-639, high) — sequential ID enumeration",
      "Missing Authorization Header (CWE-862, critical) — protected endpoints without auth header",
    ],
  });
}

void randomUUID;
