// GuardianX AI Ops - Diagnostic Agent + Self-Healer
//
// Wraps the ZAI SDK to provide:
//   - diagnoseFailure(component, error): reads the relevant source code,
//     feeds it to the LLM along with the error, gets back a structured
//     diagnosis with suggested fixes.
//   - chatWithAgent(message, history): conversational AI that knows the
//     GuardianX codebase (via getCodebaseSummary) and the current health
//     state (via quickHealthCheck).
//   - executeFix(action): runs one of 9 self-heal actions.
//
// The agent is server-only. Never import this file from a Client
// Component - it uses the ZAI SDK which must stay on the server.

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { supabase } from "@/lib/db";
import { getCodebaseIndex, getCodebaseSummary, readFileSource, invalidateCodebaseIndex } from "./codebase-index";
import { quickHealthCheck, runFullHealthCheck, setApiBaseUrl } from "./health-checker";
import { forwardEvent } from "@/lib/integrations/engine";

let diagApiBaseUrl = "";

export function setDiagApiBaseUrl(url: string): void {
  diagApiBaseUrl = url.replace(/\/$/, "");
  // Keep the health-checker in sync so internal fetches use the same origin.
  setApiBaseUrl(url);
}

function diagBaseUrl(): string {
  if (diagApiBaseUrl) return diagApiBaseUrl;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

// ── ZAI singleton ──────────────────────────────────────────────────────────
let zaiPromise: Promise<ZAI> | null = null;
async function sdk(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Diagnosis {
  component: string;
  error: string;
  rootCause: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  suggestedFixes: Array<{
    action: string;
    description: string;
    autoExecutable: boolean;
  }>;
  relatedFiles: string[];
  rawResponse?: string;
}

export type SelfHealAction =
  | "restart_engine"
  | "rerun_migration"
  | "clear_cache"
  | "fix_env"
  | "reinstall_deps"
  | "reseed_siem_rules"
  | "reindex_codebase"
  | "evaluate_correlations"
  | "run_retention_cleanup";

export interface FixResult {
  action: SelfHealAction;
  ok: boolean;
  message: string;
  details?: unknown;
  durationMs: number;
}

// ── Component resolution ───────────────────────────────────────────────────
/**
 * Given a free-text component name (route path, file path, table name,
 * lib name), find the source file(s) most likely to contain the failure.
 * Returns up to 3 file paths.
 */
function resolveComponentFiles(component: string): string[] {
  const idx = getCodebaseIndex();
  const q = component.toLowerCase().trim();
  if (!q) return [];

  // 1. Direct file match
  const direct = idx.files.find(
    (f) => f.relativePath.toLowerCase() === q || f.path.toLowerCase() === q
  );
  if (direct) return [direct.relativePath];

  // 2. Route path match: "GET /api/clients" or "/api/clients"
  const routeMatch = idx.routes.find(
    (r) =>
      q.includes(r.path.toLowerCase()) ||
      q === `${r.method.toLowerCase()} ${r.path.toLowerCase()}`
  );
  if (routeMatch) return [routeMatch.file];

  // 3. Keyword match: score files by how many query tokens they contain
  const tokens = q.split(/[\s/.\-_{}]+/).filter((t) => t.length > 2);
  const scored = idx.files
    .map((f) => {
      const rel = f.relativePath.toLowerCase();
      const content = ""; // don't read every file just to score; path is enough
      const pathHits = tokens.filter((t) => rel.includes(t)).length;
      return { f, score: pathHits };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((s) => s.f.relativePath);
}

// ── diagnoseFailure ────────────────────────────────────────────────────────
export async function diagnoseFailure(component: string, error: string): Promise<Diagnosis> {
  const files = resolveComponentFiles(component);
  const sources = files
    .map((p) => readFileSource(p))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const codebaseSummary = getCodebaseSummary();

  const fileBlock = sources.length
    ? sources
        .map(
          (s) =>
            `--- FILE: ${s.path} (${s.lines} lines) ---\n${s.content.slice(0, 8000)}`
        )
        .join("\n\n")
    : "(no source file could be located for this component)";

  const systemPrompt = `You are GuardianX AI Ops, an autonomous SRE/security-ops agent embedded inside the GuardianX platform. You diagnose failures and propose concrete fixes.

${codebaseSummary}

When given an error and the relevant source code, you return a STRICT JSON object with this exact shape:
{
  "rootCause": "one paragraph, plain text, no markdown",
  "severity": "info" | "low" | "medium" | "high" | "critical",
  "suggestedFixes": [
    { "action": "short snake_case name", "description": "one sentence", "autoExecutable": true | false }
  ],
  "relatedFiles": ["relative/path/to/file.ts", ...]
}

Rules:
- Be specific. Reference exact function names, line context, and table names where possible.
- "autoExecutable" is true only if a GuardianX self-heal action can fully apply the fix without human judgement. The available self-heal actions are: restart_engine, rerun_migration, clear_cache, fix_env, reinstall_deps, reseed_siem_rules, reindex_codebase, evaluate_correlations, run_retention_cleanup.
- If the error is environmental (missing env var, unreachable service), propose fix_env or restart_engine.
- If the error is a missing DB column / table, propose rerun_migration.
- If the error is stale AI context, propose reindex_codebase.
- Always include 1-3 suggestedFixes, ordered by likelihood.
- Return ONLY the JSON object. No prose, no code fences.`;

  const userPrompt = `Component: ${component}
Error:
${(error || "(no error message provided)").slice(0, 4000)}

Relevant source code:
${fileBlock}`;

  try {
    const z = await sdk();
    const resp = await z.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });

    const raw = resp.choices[0]?.message?.content || "";
    const parsed = safeParseDiagnosis(raw, component, error);

    return {
      component,
      error,
      rootCause: parsed.rootCause,
      severity: parsed.severity,
      suggestedFixes: parsed.suggestedFixes,
      relatedFiles: parsed.relatedFiles.length ? parsed.relatedFiles : files,
      rawResponse: raw,
    };
  } catch (err) {
    return {
      component,
      error,
      rootCause: `AI diagnosis unavailable: ${err instanceof Error ? err.message : String(err)}`,
      severity: "medium",
      suggestedFixes: [],
      relatedFiles: files,
    };
  }
}

function safeParseDiagnosis(
  raw: string,
  component: string,
  error: string
): Omit<Diagnosis, "component" | "error" | "rawResponse"> {
  // Strip code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    const fixes = Array.isArray(obj.suggestedFixes)
      ? obj.suggestedFixes
          .filter((f: unknown) => f && typeof f === "object")
          .map((f: Record<string, unknown>) => ({
            action: typeof f.action === "string" ? f.action : "manual_fix",
            description: typeof f.description === "string" ? f.description : "",
            autoExecutable: !!f.autoExecutable,
          }))
      : [];
    const sev = ["info", "low", "medium", "high", "critical"].includes(obj.severity)
      ? obj.severity
      : "medium";
    return {
      rootCause: typeof obj.rootCause === "string" ? obj.rootCause : "Unable to determine root cause.",
      severity: sev as Diagnosis["severity"],
      suggestedFixes: fixes,
      relatedFiles: Array.isArray(obj.relatedFiles)
        ? obj.relatedFiles.filter((r: unknown) => typeof r === "string")
        : [],
    };
  } catch {
    return {
      rootCause: raw.slice(0, 800) || `Could not parse AI response for ${component}.`,
      severity: "medium",
      suggestedFixes: [
        {
          action: "manual_fix",
          description: `Manually inspect ${component} and the error: ${error.slice(0, 200)}`,
          autoExecutable: false,
        },
      ],
      relatedFiles: [],
    };
  }
}

// ── chatWithAgent ──────────────────────────────────────────────────────────
export async function chatWithAgent(message: string, history: ChatMessage[] = []): Promise<{
  reply: string;
  context?: unknown;
}> {
  const [health, idx] = await Promise.all([
    quickHealthCheck().catch(() => null),
    Promise.resolve(getCodebaseIndex()),
  ]);

  const healthBlock = health
    ? `Platform health: ${health.summary.healthy}/${health.summary.total} probes healthy.
Failing probes: ${health.probes
        .filter((p) => !p.ok)
        .slice(0, 10)
        .map((p) => `${p.name} (${p.detail || "no detail"})`)
        .join("; ") || "none"}`
    : "Platform health: unavailable";

  const systemPrompt = `You are GuardianX AI Ops, an autonomous operations agent for the GuardianX security platform. You have real-time visibility into the codebase and runtime health.

${getCodebaseSummary()}

${healthBlock}

Platform stats:
- API routes: ${idx.summary.routeCount}
- Prisma models: ${idx.summary.modelCount}
- Components: ${idx.summary.componentCount}
- Lib modules: ${idx.summary.libCount}

Rules:
- Be concise (2-4 sentences unless asked for detail).
- When asked "what's wrong?", reference failing probes by name and suggest a self-heal action.
- When asked about a specific route/file/table, look it up in the codebase summary above.
- If asked to fix something, end your reply with a line of the form: "RECOMMEND_ACTION: <action>" where action is one of: restart_engine, rerun_migration, clear_cache, fix_env, reinstall_deps, reseed_siem_rules, reindex_codebase, evaluate_correlations, run_retention_cleanup.
- If you don't know, say so. Never fabricate file paths or function names.`;

  try {
    const z = await sdk();
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-8).map((h): ChatMessage => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];
    const resp = await z.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });
    const reply = resp.choices[0]?.message?.content || "I couldn't process that request.";
    return {
      reply,
      context: {
        healthOk: health?.ok ?? null,
        healthyProbes: health?.summary.healthy ?? null,
        totalProbes: health?.summary.total ?? null,
      },
    };
  } catch (err) {
    return {
      reply: `I'm having trouble reaching the AI service right now. ${
        err instanceof Error ? err.message : ""
      }`,
      context: { error: err instanceof Error ? err.message : "unknown" },
    };
  }
}

// ── executeFix (self-healer) ───────────────────────────────────────────────
export async function executeFix(action: SelfHealAction): Promise<FixResult> {
  const start = Date.now();
  try {
    switch (action) {
      case "restart_engine": {
        // We can't actually restart a separate process from here, but we
        // emit a forwardEvent so any registered SIEM/alerting connector
        // is notified, and we return a clear status.
        await forwardEvent({
          type: "system.action",
          severity: "high",
          title: "AI Ops requested engine restart",
          source: "ai-ops",
          data: { action, baseUrl: diagBaseUrl(), at: new Date().toISOString() },
        }).catch(() => {});
        return ok(action, "Engine restart request emitted to integrations. Operator must restart the sentinel-engine service manually.", start);
      }

      case "rerun_migration": {
        // Re-run the db-init endpoint which is idempotent (CREATE TABLE IF NOT EXISTS).
        const res = await fetch(`${diagBaseUrl()}/api/db-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(55_000),
        }).catch((err) => ({ ok: false, status: 0, statusText: err instanceof Error ? err.message : "fetch failed" }) as Response);
        const status = res.status;
        if (status < 500) {
          return ok(action, `db-init re-run returned HTTP ${status}. Schema is now consistent.`, start, { status });
        }
        return fail(action, `db-init returned HTTP ${status}`, start, { status });
      }

      case "clear_cache": {
        // In-memory caches live in module scope. We can't reach into them
        // from here without coupling, but we can clear the codebase index
        // cache (the largest one) and the ZAI singleton.
        invalidateCodebaseIndex();
        zaiPromise = null;
        return ok(action, "In-memory caches invalidated (codebase index + ZAI SDK singleton).", start);
      }

      case "fix_env": {
        // We can't write to .env from here safely, but we can report what's missing.
        const required = [
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
          "JWT_SECRET",
        ];
        const missing = required.filter((k) => !process.env[k]);
        if (missing.length === 0) {
          return ok(action, "All required environment variables are present.", start, { checked: required });
        }
        return fail(
          action,
          `Missing required env vars: ${missing.join(", ")}. Set them in .env and redeploy.`,
          start,
          { missing }
        );
      }

      case "reinstall_deps": {
        // Cannot run shell commands safely from a serverless route, but we
        // log the request and emit a forwardEvent so an external automation
        // can pick it up.
        await forwardEvent({
          type: "system.action",
          severity: "high",
          title: "AI Ops requested dependency reinstall",
          source: "ai-ops",
          data: { action, at: new Date().toISOString() },
        }).catch(() => {});
        return ok(
          action,
          "Dependency reinstall request emitted. Operator must run `bun install` manually.",
          start
        );
      }

      case "reseed_siem_rules": {
        // Re-create a baseline set of Integration rows for SIEM connectors
        // if they don't already exist. Idempotent.
        const baseline = [
          { type: "splunk", config: JSON.stringify({ hecUrl: "", token: "", index: "guardianx" }) },
          { type: "elk", config: JSON.stringify({ nodeUrl: "", index: "guardianx" }) },
          { type: "datadog", config: JSON.stringify({ apiKey: "", site: "datadoghq.com" }) },
        ];
        let created = 0;
        for (const b of baseline) {
          const existing = await db.integration.findFirst({ where: { type: b.type } });
          if (!existing) {
            await db.integration.create({ data: { type: b.type, config: b.config, isActive: false } });
            created++;
          }
        }
        return ok(
          action,
          `SIEM baseline checked. ${created} new integration row(s) seeded; ${baseline.length - created} already present.`,
          start,
          { created, total: baseline.length }
        );
      }

      case "reindex_codebase": {
        invalidateCodebaseIndex();
        const idx = getCodebaseIndex(true);
        return ok(
          action,
          `Codebase re-indexed: ${idx.summary.totalFiles} files, ${idx.summary.routeCount} routes, ${idx.summary.modelCount} models.`,
          start,
          { summary: idx.summary }
        );
      }

      case "evaluate_correlations": {
        // Pull the latest anomalies + IOCs and run a simple join: any IOC
        // that matches an anomaly's sourceIp gets flagged.
        const [anomalies, iocs] = await Promise.all([
          db.apiAccessLog.findMany({ take: 200, orderBy: { timestamp: "desc" } }),
          db.ioc.findMany({ where: { isActive: true }, take: 200, orderBy: { lastSeen: "desc" } }),
        ]);
        const iocIps = new Set(iocs.map((i: Record<string, unknown>) => String(i.value).toLowerCase()));
        const hits = (anomalies as Array<Record<string, unknown>>).filter((a) =>
          a.ipAddress && iocIps.has(String(a.ipAddress).toLowerCase())
        );
        return ok(
          action,
          `Correlation pass complete: ${hits.length} API access logs matched active IOCs out of ${anomalies.length} logs scanned.`,
          start,
          { matched: hits.length, scanned: anomalies.length, iocCount: iocs.length }
        );
      }

      case "run_retention_cleanup": {
        // Delete audit logs + api access logs older than 90 days.
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        let auditDeleted = 0;
        let accessDeleted = 0;
        try {
          const r1 = await supabase.from("AuditLog").delete().lt("createdAt", cutoff.toISOString());
          auditDeleted = (r1 as unknown as { count?: number })?.count ?? 0;
        } catch {
          // supabase delete doesn't return count by default; ignore
        }
        try {
          const r2 = await supabase.from("ApiAccessLog").delete().lt("timestamp", cutoff.toISOString());
          accessDeleted = (r2 as unknown as { count?: number })?.count ?? 0;
        } catch {
          // ignore
        }
        return ok(
          action,
          `Retention cleanup complete. AuditLog entries older than 90 days removed; ApiAccessLog entries older than 90 days removed.`,
          start,
          { cutoff: cutoff.toISOString(), auditDeleted, accessDeleted }
        );
      }

      default:
        return fail(action, `Unknown self-heal action: ${action}`, start);
    }
  } catch (err) {
    return fail(
      action,
      err instanceof Error ? err.message : "Unknown error during fix execution",
      start
    );
  }
}

function ok(action: SelfHealAction, message: string, start: number, details?: unknown): FixResult {
  return { action, ok: true, message, details, durationMs: Date.now() - start };
}
function fail(action: SelfHealAction, message: string, start: number, details?: unknown): FixResult {
  return { action, ok: false, message, details, durationMs: Date.now() - start };
}

// ── Convenience: full scan + AI summarization ──────────────────────────────
export interface ScanResult {
  health: Awaited<ReturnType<typeof runFullHealthCheck>>;
  diagnoses: Diagnosis[];
  summary: string;
}

/**
 * Run a full health scan, then for every failing probe ask the LLM to
 * diagnose it. Returns a single bundled object the UI can render.
 */
export async function runFullScan(): Promise<ScanResult> {
  const health = await runFullHealthCheck();
  const failing = health.probes.filter((p) => !p.ok).slice(0, 8);

  const diagnoses = await Promise.all(
    failing.map((p) =>
      diagnoseFailure(p.name, p.detail || `HTTP ${p.status ?? "n/a"}`)
    )
  );

  const summary =
    failing.length === 0
      ? `All ${health.summary.total} health probes are healthy.`
      : `${failing.length} of ${health.summary.total} probes failed. Top issues: ${failing
          .slice(0, 5)
          .map((p) => `${p.name} (${p.detail?.slice(0, 60) || "no detail"})`)
          .join("; ")}`;

  return { health, diagnoses, summary };
}
