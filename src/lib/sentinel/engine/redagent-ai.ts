// RedAgent AI core: plans attacks from crawl results, crafts HTTP payloads,
// and analyzes responses to confirm exploitation.
//
// All functions emit strict JSON for reliable parsing.

import ZAI from "z-ai-web-dev-sdk";

export interface CrawledEndpoint {
  method: "GET" | "POST";
  path: string; // e.g. "/login"
  params: string[]; // query/form param names
  hasBody: boolean; // POST with body
  description?: string;
}

export interface CrawlSummary {
  baseUrl: string;
  endpoints: CrawledEndpoint[];
  notes: string;
}

export interface PlannedAttack {
  endpoint: string;
  method: "GET" | "POST";
  category: string; // e.g. "SQL Injection", "XSS", "IDOR", "Path Traversal", "Open Redirect"
  owasp: string; // e.g. "A03:2021-Injection"
  rationale: string; // why this attack on this endpoint
  payloadStrategy: string; // what kind of payload
  targetParam?: string; // which param to attack
}

export interface CraftedAttack {
  method: "GET" | "POST";
  url: string; // full URL with query string if GET
  body?: string; // form body if POST
  headers: Record<string, string>;
  payload: string; // the attack payload string
  successIndicators: string[]; // what in the response proves success (regex/keywords)
}

export interface AnalyzedResponse {
  vulnerable: boolean;
  confidence: number; // 0..1
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  remediation: string;
  evidence: string; // the specific response excerpt that proves it
}

let zaiPromise: Promise<ZAI> | null = null;
async function sdk(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.search(/[[{]/);
  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const last = Math.max(lastBrace, lastBracket);
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}

/**
 * Given the crawl summary, plan a list of attacks to attempt against the target.
 * The AI reasons about each endpoint and decides which attack categories apply.
 */
export async function planAttacks(crawl: CrawlSummary): Promise<PlannedAttack[]> {
  const z = await sdk();

  const system = [
    "You are RedAgent, an autonomous penetration tester. Given a crawl summary of a web app, you plan concrete HTTP attacks to attempt against each endpoint.",
    "For each endpoint, decide which attack categories are worth trying (SQL Injection, XSS, IDOR, Path Traversal, Open Redirect, Command Injection, SSRF, Auth Bypass, Info Disclosure, etc.).",
    "Only plan attacks that are technically feasible against the described endpoint. Don't waste effort on irrelevant categories.",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    "Crawl summary of target:",
    "```json",
    JSON.stringify(crawl, null, 2),
    "```",
    "",
    "Plan attacks. Respond with JSON in this exact shape:",
    '{"attacks":[{"endpoint":string,"method":"GET|POST","category":string,"owasp":string,"rationale":string,"payloadStrategy":string,"targetParam":string?}]}',
    "Keep rationale under 60 words. owasp should be the OWASP Top 10 2021 code+name (e.g. A03:2021-Injection, A01:2021-Broken Access Control, A07:2021-Identification and Authentication Failures).",
    "Plan at most 8 attacks total, focus on the most promising.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<{ attacks?: PlannedAttack[] }>(raw, { attacks: [] });
  return (parsed.attacks ?? []).slice(0, 8);
}

/**
 * Craft a concrete HTTP attack from a plan: full URL, body, headers, payload,
 * and the indicators that will prove success in the response.
 */
export async function craftHttpAttack(
  baseUrl: string,
  plan: PlannedAttack,
  endpoint: CrawledEndpoint
): Promise<CraftedAttack> {
  const z = await sdk();

  const system = [
    "You are RedAgent. Given an attack plan and the target endpoint details, craft a SINGLE concrete HTTP request that attempts the attack.",
    "Build the full URL (with query string for GET), the form body (for POST), any needed headers, the exact payload, and a list of success indicators (substrings or patterns that would appear in the response if the attack succeeded).",
    "Use realistic, well-known payloads for each category (e.g. SQLi: ' OR '1'='1, XSS: <script>alert(1)</script>, path traversal: ../../etc/passwd, etc.).",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    `Base URL: ${baseUrl}`,
    "Attack plan:",
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    "Endpoint details:",
    "```json",
    JSON.stringify(endpoint, null, 2),
    "```",
    "",
    "Craft the attack. Respond with JSON in this exact shape:",
    '{"method":"GET|POST","url":string,"body":string?,"headers":{},"payload":string,"successIndicators":[string]}',
    "- url: full URL including query string if GET.",
    "- body: URL-encoded form body if POST, omit for GET.",
    "- headers: any needed (e.g. Content-Type for POST).",
    "- payload: the exact attack payload string used.",
    "- successIndicators: 1-3 substrings/patterns that prove success in the response body or status.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<CraftedAttack>(raw, {
    method: endpoint.method,
    url: baseUrl + endpoint.path,
    headers: {},
    payload: "",
    successIndicators: [],
  });

  return {
    method: (parsed.method === "POST" ? "POST" : "GET") as "GET" | "POST",
    url: String(parsed.url ?? baseUrl + endpoint.path),
    body: parsed.body ? String(parsed.body) : undefined,
    headers: (parsed.headers as Record<string, string>) ?? {},
    payload: String(parsed.payload ?? ""),
    successIndicators: Array.isArray(parsed.successIndicators)
      ? parsed.successIndicators.map(String)
      : [],
  };
}

/**
 * Analyze the HTTP response + the attack context to determine if the
 * vulnerability was actually exploited, with confidence + severity.
 */
export async function analyzeResponse(
  plan: PlannedAttack,
  attack: CraftedAttack,
  response: { status: number; headers: Record<string, string>; body: string }
): Promise<AnalyzedResponse> {
  const z = await sdk();

  const system = [
    "You are RedAgent. Given an attack plan, the crafted request, and the actual HTTP response, determine whether the vulnerability was genuinely exploited.",
    "Be rigorous: only declare vulnerable=true if the response clearly demonstrates exploitation (e.g. an error leaking SQL, a payload reflected unescaped, a redirect to an external host, a file's contents returned, a sensitive field leaked).",
    "If the response is ambiguous or doesn't prove exploitation, set vulnerable=false.",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    "Attack plan:",
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    "Crafted request:",
    "```json",
    JSON.stringify({ ...attack, body: attack.body ?? null }, null, 2),
    "```",
    "HTTP response:",
    "```json",
    JSON.stringify({ status: response.status, headers: response.headers, body: response.body.slice(0, 2000) }, null, 2),
    "```",
    "Success indicators the attack was designed to trigger:",
    attack.successIndicators.map((s) => `- ${s}`).join("\n"),
    "",
    "Analyze the response. Respond with JSON in this exact shape:",
    '{"vulnerable":boolean,"confidence":number,"severity":"critical|high|medium|low|info","title":string,"description":string,"remediation":string,"evidence":string}',
    "- evidence: the EXACT excerpt from the response body/headers/status that proves exploitation (quote it).",
    "- confidence: 0..1, how certain you are the vuln is real and exploitable.",
    "- description: under 80 words explaining the impact.",
    "- remediation: under 60 words on how to fix it.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<AnalyzedResponse>(raw, {
    vulnerable: false,
    confidence: 0,
    severity: "info",
    title: plan.category,
    description: "analysis failed",
    remediation: "",
    evidence: "",
  });

  return {
    vulnerable: Boolean(parsed.vulnerable),
    confidence: clamp01(Number(parsed.confidence) ?? 0),
    severity: (["critical", "high", "medium", "low", "info"].includes(parsed.severity)
      ? parsed.severity
      : "info") as AnalyzedResponse["severity"],
    title: String(parsed.title ?? plan.category),
    description: String(parsed.description ?? ""),
    remediation: String(parsed.remediation ?? ""),
    evidence: String(parsed.evidence ?? ""),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
