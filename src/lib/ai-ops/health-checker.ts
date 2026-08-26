// GuardianX AI Ops - Health Checker
//
// Probes the running GuardianX instance (API routes, DB tables, sentinel
// engine, mini services) and reports a structured health report. The
// diagnostic agent consumes this when asked "is anything broken?".
//
// IMPORTANT: This module supports two execution contexts:
//   1. Called from an API route that has a `Request` available, in which
//      case the base URL is derived from `new URL(req.url).origin`.
//   2. Called from a background/cron context where no request exists, in
//      which case the caller must `setApiBaseUrl(...)` ahead of time.
//
// We NEVER hardcode http://localhost:3000 because in production the app
// runs behind Caddy/Verel and the public origin differs from internal
// ports.

import { supabase } from "@/lib/db";
import { getCodebaseIndex, type CodebaseRoute } from "./codebase-index";
import { createToken } from "@/lib/auth";
import { ENGINE_URL } from "@/lib/sentinel/engine-proxy";

let apiBaseUrl = ""; // set by setApiBaseUrl() or inferred from a Request

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/$/, "");
}

/**
 * Infer the base URL from an incoming Request. Called by the AI Ops API
 * routes so subsequent internal fetches go through the same origin
 * (works for both local dev and production).
 */
export function setApiBaseUrlFromRequest(req: Request): void {
  try {
    const origin = new URL(req.url).origin;
    setApiBaseUrl(origin);
  } catch {
    // ignore - setApiBaseUrl will be called later
  }
}

function baseUrl(): string {
  if (apiBaseUrl) return apiBaseUrl;
  // Last-resort fallback for direct dev access. Production should always
  // call setApiBaseUrl() first.
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Mint an internal admin JWT so the health checks can hit authenticated
 * routes without requiring a real session. The token is signed with the
 * same JWT_SECRET the rest of the app uses, so requireAuth/requireAdmin
 * will accept it.
 */
function internalAdminToken(): string {
  return createToken({
    userId: "ai-ops-agent",
    email: "ai-ops@guardianx.internal",
    role: "admin",
    name: "AI Ops Agent",
    approved: true,
  });
}

export interface HealthProbe {
  name: string;
  category: "api" | "db" | "engine" | "mini-service" | "system";
  ok: boolean;
  latencyMs: number;
  status?: number;
  detail?: string;
}

export interface HealthReport {
  ok: boolean;
  scannedAt: string;
  baseUrl: string;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    byCategory: Record<string, { ok: number; fail: number }>;
  };
  probes: HealthProbe[];
  durationMs: number;
}

async function probe(
  name: string,
  category: HealthProbe["category"],
  fn: () => Promise<{ ok: boolean; status?: number; detail?: string }>
): Promise<HealthProbe> {
  const start = Date.now();
  try {
    const r = await fn();
    return {
      name,
      category,
      ok: r.ok,
      latencyMs: Date.now() - start,
      status: r.status,
      detail: r.detail,
    };
  } catch (err) {
    return {
      name,
      category,
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${internalAdminToken()}`);
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(8_000) });
}

/**
 * Probe every API route discovered in the codebase index. Each route is
 * hit with its declared method. We send an empty body for POST/PATCH so
 * routes that require a body will return 400, which we still count as
 * "the route is alive" (it ran code). 5xx is treated as a failure.
 */
async function probeApiRoutes(routes: CodebaseRoute[]): Promise<HealthProbe[]> {
  const safe = routes.filter((r) => r.method === "GET" || r.method === "POST" || r.method === "PATCH");
  // Sample to keep runtime reasonable - test up to 60 routes.
  const sample = safe.slice(0, 60);
  return Promise.all(
    sample.map((r) =>
      probe(`API ${r.method} ${r.path}`, "api", async () => {
        const init: RequestInit =
          r.method === "GET" ? { method: "GET" } : { method: r.method, body: JSON.stringify({}) };
        const res = await fetchWithAuth(r.path, init);
        // 2xx and 4xx both count as "alive" (route executed). 5xx is a failure.
        const ok = res.status < 500;
        return {
          ok,
          status: res.status,
          detail: ok ? undefined : `HTTP ${res.status}`,
        };
      })
    )
  );
}

/**
 * Probe DB tables by counting rows. Uses the supabase client directly so
 * we exercise the same REST proxy the rest of the app uses.
 */
async function probeDbTables(): Promise<HealthProbe[]> {
  const tables = [
    "User",
    "Client",
    "Codebase",
    "Scan",
    "Patch",
    "Finding",
    "Incident",
    "IOC",
    "Integration",
    "AuditLog",
  ];
  return Promise.all(
    tables.map((t) =>
      probe(`DB ${t}`, "db", async () => {
        const { count, error } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        if (error) {
          return { ok: false, detail: error.message };
        }
        return { ok: true, detail: `${count ?? 0} rows` };
      })
    )
  );
}

/**
 * Probe the sentinel engine mini-service. We hit its root with a short
 * timeout - any HTTP response counts as alive.
 */
async function probeEngine(): Promise<HealthProbe> {
  return probe("Sentinel Engine", "engine", async () => {
    try {
      const res = await fetch(ENGINE_URL, {
        method: "GET",
        signal: AbortSignal.timeout(5_000),
      });
      return { ok: res.status < 500, status: res.status, detail: `HTTP ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "engine unreachable",
      };
    }
  });
}

/**
 * Quick check: DB reachability + a single representative API route + the
 * sentinel engine. Used by the chat agent to give a fast "is the
 * platform up?" answer without scanning every route.
 */
export async function quickHealthCheck(): Promise<HealthReport> {
  const start = Date.now();
  const probes: HealthProbe[] = [];

  // 1. DB check (count users)
  probes.push(
    await probe("DB User", "db", async () => {
      const { count, error } = await supabase
        .from("User")
        .select("*", { count: "exact", head: true });
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `${count ?? 0} users` };
    })
  );

  // 2. One API route (clients - public-ish)
  probes.push(
    await probe("API GET /api/clients", "api", async () => {
      const res = await fetchWithAuth("/api/clients", { method: "GET" });
      return { ok: res.status < 500, status: res.status };
    })
  );

  // 3. Engine
  probes.push(await probeEngine());

  return buildReport(probes, start);
}

/**
 * Full scan: every API route + every DB table + the engine + a couple
 * of mini-services. Used by the /api/ai-ops/health?full=true endpoint.
 */
export async function runFullHealthCheck(): Promise<HealthReport> {
  const start = Date.now();
  const idx = getCodebaseIndex();

  const probes: HealthProbe[] = [];

  // System checks first (cheap, important).
  probes.push(
    await probe("System Node version", "system", async () => {
      const v = process.version;
      return { ok: !!v, detail: v };
    })
  );
  probes.push(
    await probe("System Memory", "system", async () => {
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      return { ok: true, detail: `RSS ${rssMb} MB` };
    })
  );

  // Then DB tables.
  probes.push(...(await probeDbTables()));

  // Then API routes (sampled).
  probes.push(...(await probeApiRoutes(idx.routes)));

  // Then engine.
  probes.push(await probeEngine());

  return buildReport(probes, start);
}

function buildReport(probes: HealthProbe[], start: number): HealthReport {
  const byCategory: Record<string, { ok: number; fail: number }> = {};
  let healthy = 0;
  let unhealthy = 0;
  for (const p of probes) {
    if (p.ok) healthy++;
    else unhealthy++;
    if (!byCategory[p.category]) byCategory[p.category] = { ok: 0, fail: 0 };
    if (p.ok) byCategory[p.category].ok++;
    else byCategory[p.category].fail++;
  }
  return {
    ok: unhealthy === 0,
    scannedAt: new Date().toISOString(),
    baseUrl: baseUrl(),
    summary: {
      total: probes.length,
      healthy,
      unhealthy,
      byCategory,
    },
    probes: probes.sort((a, b) => Number(a.ok) - Number(b.ok) || a.name.localeCompare(b.name)),
    durationMs: Date.now() - start,
  };
}
