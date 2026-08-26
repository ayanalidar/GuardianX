import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Types ────────────────────────────────────────────────────────────────────
type Category =
  | "idor"
  | "price_manipulation"
  | "workflow_bypass"
  | "rate_limit"
  | "privilege_escalation"
  | "mass_assignment";

interface TestCase {
  testId: string;
  name: string;
  category: Category | string;
  endpoint: string;
  method: string;
  payload?: string;
  expectedBehavior: string;
  failureIndicator: string;
}

interface EndpointInfo {
  path: string;
  method: string;
  status: number;
  bodyShape: string;
  contentType: string;
}

interface ExecResult {
  testId: string;
  name: string;
  category: string;
  endpoint: string;
  method: string;
  payloadSent: string;
  responseStatus: number;
  responseSnippet: string;
  vulnerable: boolean;
  severity: string;
  cwe: string;
}

interface FindingRow {
  title: string;
  severity: string;
  category: string;
  endpoint: string;
  method: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  payload: string;
  owasp: string;
}

// ── Category → severity + CWE map ────────────────────────────────────────────
const CATEGORY_META: Record<
  string,
  { severity: string; cwe: string; label: string }
> = {
  idor: { severity: "high", cwe: "CWE-639", label: "Authorization Bypass (IDOR/BOLA)" },
  price_manipulation: { severity: "critical", cwe: "CWE-841", label: "Price/Quantity Manipulation" },
  workflow_bypass: { severity: "high", cwe: "CWE-841", label: "Workflow Bypass" },
  rate_limit: { severity: "medium", cwe: "CWE-770", label: "Rate-Limit Bypass" },
  privilege_escalation: { severity: "critical", cwe: "CWE-269", label: "Privilege Escalation" },
  mass_assignment: { severity: "high", cwe: "CWE-915", label: "Mass Assignment" },
};

function resolveCategory(raw: string): string {
  const r = (raw || "").toLowerCase().trim();
  if (r.includes("idor") || r.includes("bola") || r.includes("authorization")) return "idor";
  if (r.includes("price") || r.includes("quantity")) return "price_manipulation";
  if (r.includes("workflow") || r.includes("skip")) return "workflow_bypass";
  if (r.includes("rate") || r.includes("limit") || r.includes("brute")) return "rate_limit";
  if (r.includes("privilege") || r.includes("admin") || r.includes("escalat")) return "privilege_escalation";
  if (r.includes("mass") || r.includes("assignment") || r.includes("role")) return "mass_assignment";
  return "idor";
}

// ── SSRF guard: reject private/loopback/link-local/metadata hosts ─────────────
function rejectPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  // IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map((n) => parseInt(n, 10));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // .internal / .local / metadata hostnames
  if (h.endsWith(".internal") || h.endsWith(".local") || h === "metadata.google.internal") return true;
  return false;
}

// ── LLM helper (chatWithFallback equivalent) ─────────────────────────────────
// The project's existing routes use ZAI directly (see /api/business-logic-test,
// /api/auto-remediation). `src/lib/llm.ts` is not present in this checkout, so
// we provide a local equivalent that matches the same calling convention.
let zaiPromise: Promise<ZAI> | null = null;
async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

async function chatWithFallback(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string | null; usedFallback: boolean }> {
  try {
    const z = await getZAI();
    const completion = await z.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content ?? null;
    if (!content) return { content: null, usedFallback: true };
    return { content, usedFallback: false };
  } catch {
    return { content: null, usedFallback: true };
  }
}

// ── JSON extraction ──────────────────────────────────────────────────────────
function extractJsonArray<T = unknown>(raw: string): T[] {
  if (!raw) return [];
  let s = raw.trim();
  // Strip ```json fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Slice to the outermost array braces
  const first = s.search(/\[/);
  const last = s.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// ── API spec parsing ─────────────────────────────────────────────────────────
function parseApiSpec(spec: string): { path: string; method: string }[] {
  const out: { path: string; method: string }[] = [];
  // Try OpenAPI/Swagger JSON first
  try {
    const obj = JSON.parse(spec);
    const paths = obj.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || methods === null) continue;
      for (const method of Object.keys(methods as Record<string, unknown>)) {
        if (["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) {
          out.push({ path, method: method.toUpperCase() });
        }
      }
    }
    if (out.length > 0) return out.slice(0, 30);
  } catch {
    /* fallthrough */
  }
  // Fall back: newline-delimited list of "METHOD path" or just "/path"
  for (const line of spec.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/i);
    if (m) out.push({ path: m[2], method: m[1].toUpperCase() });
    else if (t.startsWith("/")) out.push({ path: t.split(/\s+/)[0], method: "GET" });
  }
  return out.slice(0, 30);
}

// ── Common API probe paths ───────────────────────────────────────────────────
const COMMON_API_PATHS = [
  "/api", "/api/v1", "/api/users", "/api/users/1", "/api/orders",
  "/api/products", "/api/cart", "/api/admin", "/api/admin/users",
  "/api/auth", "/api/auth/login", "/api/payments", "/api/checkout",
  "/api/profile", "/api/account", "/api/sessions", "/graphql",
];

// ── HTTP fetch with 5s timeout ───────────────────────────────────────────────
async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<{ status: number; body: string; contentType: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "GuardianX-BusinessLogic/1.0",
        "Accept": "application/json, text/plain, */*",
        ...(init.headers || {}),
      },
    });
    const text = await res.text().catch(() => "");
    return {
      status: res.status,
      body: text,
      contentType: res.headers.get("content-type") || "",
    };
  } catch {
    return { status: 0, body: "", contentType: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverEndpoints(
  base: string,
  apiSpec?: string,
): Promise<{ endpoints: EndpointInfo[]; discoveryLog: string[] }> {
  const discoveryLog: string[] = [];
  const candidates: { path: string; method: string }[] = [];

  if (apiSpec && apiSpec.trim()) {
    const parsed = parseApiSpec(apiSpec);
    if (parsed.length > 0) {
      candidates.push(...parsed);
      discoveryLog.push(`Parsed ${parsed.length} endpoints from API spec.`);
    } else {
      discoveryLog.push("API spec provided but unparseable; falling back to common paths.");
    }
  }

  if (candidates.length === 0) {
    candidates.push(...COMMON_API_PATHS.map((p) => ({ path: p, method: "GET" })));
    discoveryLog.push(`Probing ${COMMON_API_PATHS.length} common API paths.`);
  }

  const endpoints: EndpointInfo[] = [];
  const seen = new Set<string>();
  for (const c of candidates.slice(0, 20)) {
    const key = `${c.method} ${c.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const url = c.path.startsWith("http")
      ? c.path
      : `${base.replace(/\/+$/, "")}${c.path.startsWith("/") ? "" : "/"}${c.path}`;

    // SSRF guard re-check on resolved URL
    try {
      const u = new URL(url);
      if (rejectPrivateHost(u.hostname)) {
        discoveryLog.push(`Skipping ${key} — resolves to private host.`);
        continue;
      }
    } catch {
      continue;
    }

    const r = await timedFetch(url, { method: c.method });
    const bodyShape = r.body
      ? r.body.slice(0, 200).replace(/\s+/g, " ").trim()
      : "(empty)";
    endpoints.push({
      path: c.path,
      method: c.method,
      status: r.status,
      bodyShape,
      contentType: r.contentType,
    });
    discoveryLog.push(
      `${key} → ${r.status || "timeout"} ${r.contentType.split(";")[0] || "?"} ${bodyShape.slice(0, 80)}`,
    );
  }
  return { endpoints, discoveryLog };
}

// ── Heuristic test pattern generator (fallback when LLM unavailable) ─────────
function heuristicTestCases(base: string, endpoints: EndpointInfo[]): TestCase[] {
  const origin = base.replace(/\/+$/, "");
  const known = (p: string) =>
    endpoints.some((e) => e.path.toLowerCase().includes(p.toLowerCase()));

  const cases: TestCase[] = [
    {
      testId: "BL-IDOR-01",
      name: "IDOR — sequential user ID swap (/users/123 → /users/124)",
      category: "idor",
      endpoint: known("users") ? `${origin}/api/users/124` : `${origin}/api/users/124`,
      method: "GET",
      expectedBehavior: "Server should refuse to return another user's record.",
      failureIndicator: '"id"\\s*:\\s*124|200 OK|"email"',
    },
    {
      testId: "BL-PRICE-01",
      name: "Price manipulation — negative order price",
      category: "price_manipulation",
      endpoint: known("orders") ? `${origin}/api/orders` : `${origin}/api/orders`,
      method: "POST",
      payload: JSON.stringify({ productId: 1, quantity: 1, price: -1 }),
      expectedBehavior: "Server should reject negative prices server-side.",
      failureIndicator: '"id"\\s*:|201|200|"orderId"|"success"\\s*:\\s*true',
    },
    {
      testId: "BL-PRICE-02",
      name: "Price manipulation — zero price order",
      category: "price_manipulation",
      endpoint: `${origin}/api/orders`,
      method: "POST",
      payload: JSON.stringify({ productId: 1, quantity: 1, price: 0 }),
      expectedBehavior: "Server should reject zero-priced orders.",
      failureIndicator: '"id"\\s*:|201|200|"orderId"',
    },
    {
      testId: "BL-PRICE-03",
      name: "Quantity overflow — 99,999,999 units in cart",
      category: "price_manipulation",
      endpoint: `${origin}/api/cart`,
      method: "POST",
      payload: JSON.stringify({ productId: 1, quantity: 99999999 }),
      expectedBehavior: "Server should cap quantity or reject the request.",
      failureIndicator: '"total"|"id"\\s*:|201|200|"success"\\s*:\\s*true',
    },
    {
      testId: "BL-WORKFLOW-01",
      name: "Workflow bypass — checkout without cart step",
      category: "workflow_bypass",
      endpoint: `${origin}/api/checkout`,
      method: "POST",
      payload: JSON.stringify({ items: [], paymentMethod: "free" }),
      expectedBehavior: "Server should refuse checkout when no cart/session exists.",
      failureIndicator: '"orderId"|"success"\\s*:\\s*true|201|200|confirmed',
    },
    {
      testId: "BL-RATELIMIT-01",
      name: "Rate-limit bypass — 50 rapid login attempts",
      category: "rate_limit",
      endpoint: `${origin}/api/auth/login`,
      method: "POST",
      payload: JSON.stringify({ email: "ratelimit-test@example.com", password: "wrong" }),
      expectedBehavior: "Server should throttle or block after several attempts.",
      failureIndicator: "no 429|all 2xx|all 4xx-but-not-429",
    },
    {
      testId: "BL-PRIV-01",
      name: "Privilege escalation — admin/users endpoint without auth",
      category: "privilege_escalation",
      endpoint: `${origin}/api/admin/users`,
      method: "GET",
      expectedBehavior: "Server should return 401/403 for unauthenticated admin requests.",
      failureIndicator: '"role"\\s*:\\s*"admin"|"users"\\s*:\\s*\\[|200 OK',
    },
    {
      testId: "BL-MASS-01",
      name: "Mass assignment — set role=admin on profile update",
      category: "mass_assignment",
      endpoint: `${origin}/api/profile`,
      method: "POST",
      payload: JSON.stringify({ name: "test", role: "admin", isAdmin: true }),
      expectedBehavior: "Server should ignore role/isAdmin fields submitted by a regular user.",
      failureIndicator: '"role"\\s*:\\s*"admin"|"isAdmin"\\s*:\\s*true|200 OK|"success"\\s*:\\s*true',
    },
    {
      testId: "BL-IDOR-02",
      name: "IDOR — sequential order ID enumeration",
      category: "idor",
      endpoint: `${origin}/api/orders/1001`,
      method: "GET",
      expectedBehavior: "Server should not expose another tenant's order by guessing IDs.",
      failureIndicator: '"orderId"|"userId"|"total"|200 OK',
    },
    {
      testId: "BL-WORKFLOW-02",
      name: "Workflow bypass — payment confirmation without payment",
      category: "workflow_bypass",
      endpoint: `${origin}/api/payments/confirm`,
      method: "POST",
      payload: JSON.stringify({ orderId: 1, paid: true }),
      expectedBehavior: "Server should require a real payment record before confirming.",
      failureIndicator: '"confirmed"|"success"\\s*:\\s*true|201|200|"status"\\s*:\\s*"paid"',
    },
  ];
  return cases;
}

// ── Failure indicator matcher ────────────────────────────────────────────────
function matchesFailureIndicator(
  indicator: string,
  status: number,
  body: string,
  allStatuses?: number[],
): boolean {
  if (!indicator) return false;
  // Special-case the rate-limit sentinel
  if (indicator.includes("no 429")) {
    const statuses = allStatuses && allStatuses.length > 0 ? allStatuses : [status];
    const has429 = statuses.some((s) => s === 429);
    return !has429; // vulnerable if NONE were blocked
  }
  const text = `${status} ${body}`.toLowerCase();
  // Indicator may be regex or plain keywords (split by |)
  const parts = indicator.split("|").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    try {
      const re = new RegExp(part, "i");
      if (re.test(text)) return true;
    } catch {
      // plain keyword
      if (text.includes(part.toLowerCase())) return true;
    }
  }
  return false;
}

// ── Test execution ───────────────────────────────────────────────────────────
async function executeTestCase(tc: TestCase): Promise<ExecResult> {
  const category = resolveCategory(tc.category);
  const meta = CATEGORY_META[category] || CATEGORY_META.idor;

  // Rate-limit test: send 50 rapid requests
  if (category === "rate_limit") {
    const statuses: number[] = [];
    let lastBody = "";
    for (let i = 0; i < 50; i++) {
      const r = await timedFetch(tc.endpoint, {
        method: tc.method,
        headers: { "Content-Type": "application/json" },
        body: tc.payload || undefined,
      }, 3000);
      statuses.push(r.status);
      lastBody = r.body;
    }
    const vulnerable = matchesFailureIndicator(tc.failureIndicator, statuses[statuses.length - 1] || 0, lastBody, statuses);
    return {
      testId: tc.testId,
      name: tc.name,
      category,
      endpoint: tc.endpoint,
      method: tc.method,
      payloadSent: tc.payload || "(none)",
      responseStatus: statuses[statuses.length - 1] || 0,
      responseSnippet: `Sent 50 rapid requests. Status distribution: ${statuses
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((s) => `${s}×${statuses.filter((x) => x === s).length}`)
        .join(", ")}`.slice(0, 600),
      vulnerable,
      severity: meta.severity,
      cwe: meta.cwe,
    };
  }

  // Single-shot test
  const r = await timedFetch(tc.endpoint, {
    method: tc.method,
    headers: tc.payload ? { "Content-Type": "application/json" } : undefined,
    body: tc.payload || undefined,
  });
  const vulnerable = matchesFailureIndicator(tc.failureIndicator, r.status, r.body);
  return {
    testId: tc.testId,
    name: tc.name,
    category,
    endpoint: tc.endpoint,
    method: tc.method,
    payloadSent: tc.payload || "(none)",
    responseStatus: r.status,
    responseSnippet: r.body.slice(0, 600),
    vulnerable,
    severity: meta.severity,
    cwe: meta.cwe,
  };
}

// ── LLM-driven test case generation ──────────────────────────────────────────
async function generateLlmTestCases(endpoints: EndpointInfo[]): Promise<TestCase[] | null> {
  const endpointList = endpoints
    .map((e) => `${e.method} ${e.path} → ${e.status} ${e.bodyShape.slice(0, 80)}`)
    .join("\n");

  const systemPrompt =
    "You are GuardianX's Business Logic Testing engine. Given these API endpoints:\n" +
    `${endpointList}\n\n` +
    "Generate 10 business-logic test cases that check for:\n" +
    "- Authorization bypass (IDOR/BOLA — accessing other users' resources)\n" +
    "- Price/quantity manipulation (negative prices, zero quantities, overflow)\n" +
    "- Workflow bypass (skipping steps in a multi-step process)\n" +
    "- Rate-limit bypass (sending many requests rapidly)\n" +
    "- Privilege escalation (accessing admin endpoints as a regular user)\n" +
    "- Mass assignment (setting fields the user shouldn't control)\n\n" +
    "Return JSON: [{testId, name, category, endpoint, method, payload, expectedBehavior, failureIndicator}]\n" +
    "category must be one of: idor, price_manipulation, workflow_bypass, rate_limit, privilege_escalation, mass_assignment\n" +
    "endpoint must be a full URL. failureIndicator is a regex or keyword list separated by | (e.g. 'admin|200 OK').\n" +
    "Return ONLY the JSON array — no prose, no code fences.";

  const userPrompt =
    `Discovered endpoints:\n${endpointList}\n\nGenerate the 10 test cases now.`;

  const { content, usedFallback } = await chatWithFallback(systemPrompt, userPrompt);
  if (usedFallback || !content) return null;

  const arr = extractJsonArray<TestCase>(content);
  if (arr.length === 0) return null;

  // Normalize: ensure each test has an id + category in our vocabulary
  return arr.slice(0, 10).map((tc, i) => ({
    testId: tc.testId || `BL-LLM-${String(i + 1).padStart(2, "0")}`,
    name: tc.name || "Untitled LLM test",
    category: resolveCategory(tc.category),
    endpoint: tc.endpoint || "/",
    method: (tc.method || "GET").toUpperCase(),
    payload: tc.payload,
    expectedBehavior: tc.expectedBehavior || "",
    failureIndicator: tc.failureIndicator || "",
  }));
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { targetUrl?: string; apiSpec?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetUrl = (body.targetUrl || "").trim();
  if (!targetUrl) {
    return NextResponse.json({ error: "targetUrl required." }, { status: 400 });
  }

  // ── Validate URL + SSRF guard ──────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid targetUrl." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only http/https targets allowed." }, { status: 400 });
  }
  if (rejectPrivateHost(parsed.hostname)) {
    return NextResponse.json(
      { error: "Refusing to scan private/loopback/link-local hosts (SSRF guard)." },
      { status: 400 },
    );
  }

  // ── Create Engagement ─────────────────────────────────────────────────────
  const base = `${parsed.protocol}//${parsed.host}`;
  let engagementId: string;
  try {
    const target = await db.target.findFirst({
      where: { baseUrl: base },
      select: { id: true },
    });
    const targetId = (target?.id as string) || randomUUID();
    if (!target) {
      // Auto-create a Target row so the Engagement FK is valid (targetId is
      // non-nullable on Engagement). Reuse the same id we just minted.
      await db.target.create({
        data: {
          id: targetId,
          name: parsed.host,
          baseUrl: base,
          authorized: true,
        },
      });
    }
    const eng = await db.engagement.create({
      data: {
        targetId,
        status: "running",
        stageLabel: "business-logic",
      },
    });
    engagementId = eng.id as string;
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to create engagement.",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  try {
    // ── Step 1: Discover endpoints ──────────────────────────────────────────
    const { endpoints, discoveryLog } = await discoverEndpoints(base, body.apiSpec);
    if (endpoints.length === 0) {
      await db.engagement.update({
        where: { id: engagementId },
        data: {
          status: "completed",
          crawlSummary: "No API endpoints responded.",
        },
      });
      return NextResponse.json({
        engagementId,
        testedCount: 0,
        vulnerableCount: 0,
        findings: [],
        discoveryLog,
        message: "No API endpoints discovered.",
      });
    }

    // ── Step 2: Generate test cases (LLM with heuristic fallback) ───────────
    let testCases = await generateLlmTestCases(endpoints);
    let testSource = "llm";
    if (!testCases || testCases.length === 0) {
      testCases = heuristicTestCases(base, endpoints);
      testSource = "heuristic";
    }

    // ── Step 3: Execute each test ───────────────────────────────────────────
    const results: ExecResult[] = [];
    for (const tc of testCases.slice(0, 10)) {
      // Re-SSRF-guard each absolute test endpoint (LLM may emit other hosts)
      try {
        const u = new URL(tc.endpoint);
        if (rejectPrivateHost(u.hostname)) {
          results.push({
            testId: tc.testId,
            name: tc.name,
            category: resolveCategory(tc.category),
            endpoint: tc.endpoint,
            method: tc.method,
            payloadSent: tc.payload || "(none)",
            responseStatus: 0,
            responseSnippet: "(skipped — endpoint resolves to private host)",
            vulnerable: false,
            severity: (CATEGORY_META[resolveCategory(tc.category)] || CATEGORY_META.idor).severity,
            cwe: (CATEGORY_META[resolveCategory(tc.category)] || CATEGORY_META.idor).cwe,
          });
          continue;
        }
      } catch {
        // leave to be skipped via timedFetch
      }
      const r = await executeTestCase(tc);
      results.push(r);
    }

    // ── Step 4: Persist Finding rows for confirmed vulns ────────────────────
    const findings: FindingRow[] = [];
    for (const r of results.filter((x) => x.vulnerable)) {
      const meta = CATEGORY_META[r.category] || CATEGORY_META.idor;
      const proofRequest =
        `${r.method} ${r.endpoint}\n` +
        (r.payloadSent && r.payloadSent !== "(none)"
          ? `Content-Type: application/json\n\n${r.payloadSent}`
          : "(no body)");
      const proofResponse =
        `HTTP ${r.responseStatus}\n${r.responseSnippet}`.slice(0, 2000);
      const description =
        `${r.name}\n\n` +
        `Category: ${meta.label}\nCWE: ${r.cwe}\nSeverity: ${r.severity}\n\n` +
        `Tested endpoint: ${r.method} ${r.endpoint}\n` +
        `Payload sent: ${r.payloadSent}\n\n` +
        `Server response (HTTP ${r.responseStatus}):\n${r.responseSnippet.slice(0, 400)}\n\n` +
        `Why this is vulnerable: the response matched the failure indicator ` +
        `"${meta.label}" — the server failed to enforce the expected business-rule constraint.`;

      const finding: FindingRow = {
        title: r.name,
        severity: r.severity,
        category: "business-logic",
        endpoint: r.endpoint,
        method: r.method,
        description,
        proofRequest,
        proofResponse,
        payload: r.payloadSent,
        owasp: r.cwe,
      };
      try {
        await db.finding.create({
          data: {
            engagementId,
            title: finding.title,
            severity: finding.severity,
            category: finding.category,
            endpoint: finding.endpoint,
            method: finding.method,
            description: finding.description,
            proofRequest: finding.proofRequest,
            proofResponse: finding.proofResponse,
            payload: finding.payload,
            owasp: finding.owasp,
            confidence: 0.75,
          },
        });
        findings.push(finding);
      } catch {
        // swallow — keep going so the API still returns the in-memory results
      }
    }

    // ── Step 5: Mark Engagement complete ────────────────────────────────────
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        crawlSummary: discoveryLog.join("\n").slice(0, 2000),
        completedAt: new Date().toISOString(),
      },
    });

    // ── Step 6: Return summary ──────────────────────────────────────────────
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const highCount = findings.filter((f) => f.severity === "high").length;
    const mediumCount = findings.filter((f) => f.severity === "medium").length;

    return NextResponse.json({
      engagementId,
      targetUrl: base,
      testSource,
      discoveryLog,
      endpointsDiscovered: endpoints.length,
      testedCount: results.length,
      vulnerableCount: findings.length,
      criticalCount,
      highCount,
      mediumCount,
      findings: findings.map((f, i) => ({
        ...f,
        id: `${engagementId}-${i}`,
      })),
      results: results.map((r) => ({
        testId: r.testId,
        name: r.name,
        category: r.category,
        endpoint: r.endpoint,
        method: r.method,
        payload: r.payloadSent,
        responseStatus: r.responseStatus,
        responseSnippet: r.responseSnippet,
        vulnerable: r.vulnerable,
        severity: r.severity,
        cwe: r.cwe,
      })),
      categoryBreakdown: Object.keys(CATEGORY_META).map((cat) => ({
        category: cat,
        label: CATEGORY_META[cat].label,
        tested: results.filter((r) => r.category === cat).length,
        vulnerable: results.filter((r) => r.category === cat && r.vulnerable).length,
        severity: CATEGORY_META[cat].severity,
      })),
    });
  } catch (err) {
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "failed",
        crawlSummary: err instanceof Error ? err.message.slice(0, 1000) : "unknown error",
      },
    }).catch(() => undefined);
    return NextResponse.json(
      { error: "Business-logic testing failed.", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
