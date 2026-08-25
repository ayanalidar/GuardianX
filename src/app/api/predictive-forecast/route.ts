// GET /api/predictive-forecast
//
// AI-powered Predictive Threat Forecast. Analyzes the last 20 scans + 50
// findings from the DB and asks the Z.AI LLM to predict the next likely
// attack vectors across 6 categories (web, api, auth, crypto, infra,
// supply_chain). Returns a 0-100 likelihood score per category, the top 3
// predictions with prose reasoning, and an overall forecast confidence.
//
// The LLM call is cached for 60s in a module-level variable so we don't hit
// the model on every request. Falls back to a heuristic score based on
// finding-category counts if the LLM returns malformed JSON.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Types ────────────────────────────────────────────────────────────────
type VectorKey =
  | "web"
  | "api"
  | "auth"
  | "crypto"
  | "infra"
  | "supply_chain";

interface TopPrediction {
  vector: string;
  likelihood: number;
  reasoning: string;
}

interface ForecastResponse {
  scores: Record<VectorKey, number>;
  top_3: TopPrediction[];
  confidence: number;
  generatedAt: string;
}

// ── 60-second cache (module-level) ─────────────────────────────────────────
let cached: { at: number; data: ForecastResponse } | null = null;
const CACHE_MS = 60_000;

// ── Heuristic fallback ─────────────────────────────────────────────────────
// If the LLM call fails or returns malformed JSON, derive a score from the
// raw finding-category counts. Each finding contributes to one or more axes
// based on its `category`, `title`, and `endpoint` fields.
const CATEGORY_TO_AXIS: Array<{ axis: VectorKey; patterns: RegExp }> = [
  { axis: "web", patterns: /xss|csrf|clickjack|open.redirect|ssti|template.inject|web/i },
  { axis: "api", patterns: /api|injection|sqli|graphql|rest|soap|idor|broken.access/i },
  { axis: "auth", patterns: /auth|session|jwt|cookie|password|2fa|mfa|otp|privilege/i },
  { axis: "crypto", patterns: /crypto|encrypt|decrypt|cipher|hash|tls|ssl|cert|random|jwk/i },
  { axis: "infra", patterns: /server|config|deploy|cloud|aws|s3|bucket|infra|cors|header/i },
  { axis: "supply_chain", patterns: /dependency|supply|library|package|npm|pip|outdated|cve/i },
];

function heuristicScores(
  findings: Array<{ title: string; category: string; severity: string; endpoint?: string | null; description?: string | null }>
): { scores: Record<VectorKey, number>; top_3: TopPrediction[]; confidence: number } {
  const counts: Record<VectorKey, number> = {
    web: 0, api: 0, auth: 0, crypto: 0, infra: 0, supply_chain: 0,
  };
  const severityWeight: Record<string, number> = {
    critical: 3, high: 2, medium: 1, low: 0.4, info: 0.2,
  };

  for (const f of findings) {
    const text = `${f.category} ${f.title} ${f.endpoint ?? ""} ${f.description ?? ""}`.toLowerCase();
    let matched = false;
    for (const { axis, patterns } of CATEGORY_TO_AXIS) {
      if (patterns.test(text)) {
        counts[axis] += severityWeight[f.severity] ?? 1;
        matched = true;
      }
    }
    if (!matched) {
      // Default to "web" if nothing matched.
      counts.web += severityWeight[f.severity] ?? 1;
    }
  }

  const scores: Record<VectorKey, number> = {} as Record<VectorKey, number>;
  const labels: Record<VectorKey, string> = {
    web: "Web App", api: "API", auth: "Auth", crypto: "Crypto",
    infra: "Infra", supply_chain: "Supply Chain",
  };
  for (const key of Object.keys(counts) as VectorKey[]) {
    // Map raw counts → 0-100 likelihood. 0 findings → 20 (baseline), ~5 findings → ~70, 10+ → ~95.
    scores[key] = Math.round(Math.min(100, 20 + counts[key] * 12));
  }

  const top3 = (Object.keys(counts) as VectorKey[])
    .map((key) => ({
      vector: labels[key],
      likelihood: scores[key],
      reasoning: `Heuristic: ${Math.round(counts[key])} weighted finding(s) in the ${labels[key]} category from recent scans. Awaiting AI forecast.`,
    }))
    .sort((a, b) => b.likelihood - a.likelihood)
    .slice(0, 3);

  const confidence = findings.length === 0 ? 25 : Math.min(85, 40 + findings.length * 2);

  return { scores, top_3: top3, confidence };
}

// ── JSON extraction (mirrors src/lib/sentinel/engine/ai.ts) ────────────────
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

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ── LLM-backed forecast ─────────────────────────────────────────────────────
async function llmForecast(
  findings: Array<{ title: string; category: string; severity: string; endpoint?: string | null; description?: string | null }>,
  scanCount: number
): Promise<{ scores: Record<VectorKey, number>; top_3: TopPrediction[]; confidence: number }> {
  const z = await ZAI.create();

  const findingSummary = findings.slice(0, 30).map((f, i) => (
    `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} — cat:${f.category} — ${f.endpoint ?? "(no endpoint)"} — ${f.description?.slice(0, 120) ?? ""}`
  )).join("\n");

  const system = [
    "You are GuardianX's Predictive Threat Forecast engine.",
    "You analyze recent security findings and predict which attack vectors an adversary will likely target next.",
    "Think like a Red Team lead: which weaknesses will the attacker exploit based on the pattern of recent findings?",
    "Return STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    `Recent scans: ${scanCount}`,
    `Recent findings (${findings.length} total, showing up to 30):`,
    findingSummary || "(no recent findings — return low baseline scores)",
    "",
    "Predict the next likely attack vectors across these 6 categories:",
    "web, api, auth, crypto, infra, supply_chain.",
    "",
    "Return JSON in this EXACT shape:",
    '{"scores":{"web":0,"api":0,"auth":0,"crypto":0,"infra":0,"supply_chain":0},"top_3":[{"vector":string,"likelihood":0,"reasoning":string}],"confidence":0}',
    "Rules:",
    "- Each score is 0-100 (likelihood this vector is the next target).",
    "- top_3 must contain the 3 highest-scoring vectors, each with a 1-2 sentence reasoning referencing the findings.",
    "- confidence is 0-100 (your overall forecast confidence based on data volume + signal clarity).",
    "- No markdown fences. No prose. Just JSON.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: {
    scores?: Partial<Record<VectorKey, number>>;
    top_3?: TopPrediction[];
    confidence?: number;
  } = {};
  try {
    parsed = JSON.parse(extractJson(raw)) as typeof parsed;
  } catch {
    // Fall back to heuristic if LLM returns junk.
    return heuristicScores(findings);
  }

  const labels: Record<VectorKey, string> = {
    web: "Web App", api: "API", auth: "Auth", crypto: "Crypto",
    infra: "Infra", supply_chain: "Supply Chain",
  };
  const fallback = heuristicScores(findings);
  const scores: Record<VectorKey, number> = {
    web: clamp(Number(parsed.scores?.web) || fallback.scores.web, 0, 100),
    api: clamp(Number(parsed.scores?.api) || fallback.scores.api, 0, 100),
    auth: clamp(Number(parsed.scores?.auth) || fallback.scores.auth, 0, 100),
    crypto: clamp(Number(parsed.scores?.crypto) || fallback.scores.crypto, 0, 100),
    infra: clamp(Number(parsed.scores?.infra) || fallback.scores.infra, 0, 100),
    supply_chain: clamp(Number(parsed.scores?.supply_chain) || fallback.scores.supply_chain, 0, 100),
  };

  const top3: TopPrediction[] = Array.isArray(parsed.top_3) && parsed.top_3.length > 0
    ? parsed.top_3.slice(0, 3).map((t) => ({
        vector: String(t?.vector ?? "Unknown").slice(0, 80),
        likelihood: clamp(Number(t?.likelihood) || 50, 0, 100),
        reasoning: String(t?.reasoning ?? "").slice(0, 400),
      }))
    : fallback.top_3;

  const confidence = clamp(Number(parsed.confidence) || fallback.confidence, 0, 100);

  return { scores, top_3: top3, confidence };
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // 60s cache — short-circuit.
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    // Fetch recent scans + findings in parallel. Use raw prisma accessors.
    const [scans, findings] = await Promise.all([
      db.scan.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        include: { codebase: { select: { id: true, name: true } } },
      }),
      db.finding.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    // Compute forecast (LLM with heuristic fallback).
    const compact = findings.map((f) => ({
      title: f.title,
      category: f.category,
      severity: f.severity,
      endpoint: f.endpoint,
      description: f.description,
    }));

    const forecast = await llmForecast(compact, scans.length);

    const data: ForecastResponse = {
      scores: forecast.scores,
      top_3: forecast.top_3,
      confidence: forecast.confidence,
      generatedAt: new Date().toISOString(),
    };

    cached = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[predictive-forecast] error:", err);
    return NextResponse.json(
      { error: "Forecast failed. " + (err instanceof Error ? err.message : "Unknown error.") },
      { status: 500 },
    );
  }
}
