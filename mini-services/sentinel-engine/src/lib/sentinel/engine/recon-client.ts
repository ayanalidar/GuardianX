// Recon-tools service client.
//
// Wraps the parallel recon-tools Docker service (Nmap, FFuF, SQLmap, Nuclei)
// exposed at http://localhost:3004 (override with RECON_TOOLS_URL).
//
// Design goals:
//   - Each call has a 130s timeout — slightly higher than the tool's internal
//     timeout (120s) so we always get the result back, never a fetch error.
//   - If the recon-tools service is unreachable, every function returns `null`
//     and logs a warning. The RedAgent pipeline uses this signal to gracefully
//     fall back to AI-only DAST (no degradation in that case).
//   - All responses are validated + normalised into strongly-typed shapes the
//     pipeline can consume directly.

const RECON_BASE_URL =
  process.env.RECON_TOOLS_URL || "http://localhost:3004";

const REQUEST_TIMEOUT_MS = 130_000;

// ── Result types (mirror the recon-tools service's types.ts shapes) ────────

export interface NmapScript {
  id: string;
  output: string;
  port?: number;
  protocol?: string;
}

export interface NmapPort {
  port: number;
  protocol: string; // "tcp" | "udp"
  state: string; // "open" | "closed" | "filtered"
  service: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  scripts?: NmapScript[];
}

export interface NmapResult {
  host: string;
  status: "up" | "down" | string;
  reason?: string;
  addresses: { type: string; addr: string }[];
  hostnames: string[];
  ports: NmapPort[];
  scripts: NmapScript[];
  raw?: string;
  timedOut?: boolean;
  durationMs: number;
}

export interface FfufHit {
  url: string;
  input: string; // path component (the word that was fuzzed)
  path: string; // normalised path (derived from input)
  status: number;
  length: number;
  words: number;
  lines: number;
  contentType?: string;
  duration?: number;
}

export interface FfufResult {
  results: FfufHit[];
  totalRequests: number;
  duration: number;
  timedOut?: boolean;
  raw?: string;
}

export interface SqlmapInjectionPoint {
  param: string;
  type: string;
  title: string;
  payload?: string;
  dbms?: string;
}

export interface SqlmapResult {
  vulnerable: boolean;
  injectionPoints: SqlmapInjectionPoint[];
  databases?: string[];
  banner?: string;
  dbms?: string;
  timedOut?: boolean;
  raw?: string;
  durationMs: number;
}

export interface NucleiFinding {
  templateId: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low" | "info" | string;
  type: string;
  url: string;
  matched: string;
  description?: string;
  reference?: string[];
  cvss?: number | string;
  tags?: string[];
  matchedAt?: string;
  extractedResults?: string[];
}

export interface NucleiResult {
  findings: NucleiFinding[];
  total: number;
  timedOut?: boolean;
  raw?: string;
  durationMs: number;
}

// ── Internal: raw shape returned by the recon-tools service ────────────────
//
// The service returns the result directly (not wrapped in {ok,data}). We
// still defend against the wrapped shape in case the service evolves.

interface RawFfufHit {
  url?: string;
  input?: string;
  status?: number;
  length?: number;
  words?: number;
  lines?: number;
  contentType?: string;
  duration?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a hostname (or IP) from a target string. Accepts plain hostnames
 * ("example.com"), IPs ("192.168.1.1"), and URLs ("https://example.com:8080")
 * — the last two are normalised to a bare hostname for nmap.
 */
function hostnameFromTarget(target: string): string {
  const t = String(target ?? "").trim();
  if (!t) return "";
  // If it looks like a URL (has a scheme), parse out the hostname.
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).hostname;
    } catch {
      // fall through
    }
  }
  // Strip any path / port suffixes from a bare host:port string.
  return t.replace(/^([^/:]+)(?::\d+)?(?:\/.*)?$/, "$1");
}

async function callRecon<T>(
  tool: "nmap" | "ffuf" | "sqlmap" | "nuclei",
  body: Record<string, unknown>
): Promise<T | null> {
  const url = `${RECON_BASE_URL}/api/${tool}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[recon-client] ${tool} returned HTTP ${res.status}: ${text.slice(0, 200)}`
      );
      return null;
    }

    const json = (await res.json()) as
      | { ok?: boolean; data?: T; error?: string }
      | T;

    // The recon-tools service returns the result directly, but we also
    // tolerate a wrapped { ok, data, error } envelope for forward-compat.
    if (
      json &&
      typeof json === "object" &&
      "ok" in json &&
      "data" in json &&
      typeof (json as { ok?: unknown }).ok === "boolean"
    ) {
      const wrapped = json as { ok: boolean; data?: T; error?: string };
      if (!wrapped.ok || !wrapped.data) {
        console.warn(
          `[recon-client] ${tool} reported failure: ${wrapped.error ?? "no data"}`
        );
        return null;
      }
      return wrapped.data;
    }
    return json as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      console.warn(
        `[recon-client] ${tool} timed out after ${REQUEST_TIMEOUT_MS}ms — falling back to AI-only DAST`
      );
    } else {
      console.warn(
        `[recon-client] ${tool} call failed (${msg}) — falling back to AI-only DAST`
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Lightweight reachability probe — used by the pipeline to decide whether to
 * enable recon-tool-enhanced stages at all. Cheap (1ms); no tool invocation.
 * Probes /healthz (recon-tools canonical health endpoint) and falls back to
 * /api/health in case a sibling deployment exposes that path instead.
 */
export async function isReconAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${RECON_BASE_URL}/healthz`, {
      method: "GET",
      signal: controller.signal,
    });
    if (res.ok) return true;
    // Some deployments expose /api/health instead of /healthz.
    const res2 = await fetch(`${RECON_BASE_URL}/api/health`, {
      method: "GET",
      signal: controller.signal,
    }).catch(() => null);
    return !!res2?.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run an Nmap port + service scan against the target.
 * scanType: "service" (default) → -sV -sC, "quick" → -T4 -F, "full" → -p-, "vuln" → --script vuln
 *
 * NOTE: the recon-tools service validates `target` as a hostname or IP (not a
 * URL). If a URL is supplied (e.g. "https://example.com"), we extract the
 * hostname automatically. This lets the pipeline pass `target.baseUrl`
 * directly without pre-processing.
 */
export async function nmapScan(
  target: string,
  scanType: "service" | "quick" | "full" | "vuln" = "service"
): Promise<NmapResult | null> {
  const hostname = hostnameFromTarget(target);
  const data = await callRecon<NmapResult>("nmap", {
    target: hostname,
    scanType,
  });
  if (!data) return null;
  // Normalise / defend against shape drift.
  return {
    host: String(data.host ?? target),
    status: String(data.status ?? "up"),
    reason: data.reason ? String(data.reason) : undefined,
    addresses: Array.isArray(data.addresses)
      ? data.addresses.map((a) => ({
          type: String(a?.type ?? "ipv4"),
          addr: String(a?.addr ?? ""),
        }))
      : [],
    hostnames: Array.isArray(data.hostnames)
      ? data.hostnames.map(String)
      : [],
    ports: Array.isArray(data.ports)
      ? data.ports.map((p) => ({
          port: Number(p?.port) || 0,
          protocol: String(p?.protocol ?? "tcp"),
          state: String(p?.state ?? "filtered"),
          service: String(p?.service ?? "unknown"),
          product: p?.product ? String(p.product) : undefined,
          version: p?.version ? String(p.version) : undefined,
          extraInfo: p?.extraInfo ? String(p.extraInfo) : undefined,
          scripts: Array.isArray(p?.scripts)
            ? p.scripts.map((s) => ({
                id: String(s?.id ?? ""),
                output: String(s?.output ?? ""),
                port: s?.port ? Number(s.port) : undefined,
                protocol: s?.protocol ? String(s.protocol) : undefined,
              }))
            : undefined,
        }))
      : [],
    scripts: Array.isArray(data.scripts)
      ? data.scripts.map((s) => ({
          id: String(s?.id ?? ""),
          output: String(s?.output ?? ""),
          port: s?.port ? Number(s.port) : undefined,
          protocol: s?.protocol ? String(s.protocol) : undefined,
        }))
      : [],
    raw: data.raw ? String(data.raw) : undefined,
    timedOut: data.timedOut ? Boolean(data.timedOut) : undefined,
    durationMs: Number(data.durationMs) || 0,
  };
}

/**
 * Run FFuF directory/file discovery against a URL.
 * opts.wordlist, opts.extensions, opts.method, opts.headers
 */
export async function ffufScan(
  url: string,
  opts: {
    wordlist?: string;
    extensions?: string[];
    method?: string;
    headers?: Record<string, string>;
    matchStatus?: number[];
  } = {}
): Promise<FfufResult | null> {
  const data = await callRecon<FfufResult & { results?: RawFfufHit[] }>(
    "ffuf",
    { url, ...opts }
  );
  if (!data) return null;
  const rawHits: RawFfufHit[] = Array.isArray(data.results)
    ? data.results
    : Array.isArray((data as unknown as { hits?: RawFfufHit[] }).hits)
      ? (data as unknown as { hits?: RawFfufHit[] }).hits ?? []
      : [];
  const hits: FfufHit[] = rawHits.map((h) => {
    const inputStr = String(h?.input ?? "");
    // Derive a path component from `input` (the word ffuf fuzzed) so the
    // pipeline can merge discovered paths into its crawl endpoint list.
    let path: string;
    if (inputStr.startsWith("/")) {
      path = inputStr;
    } else if (inputStr) {
      path = "/" + inputStr.replace(/^\/+/, "");
    } else {
      try {
        path = new URL(String(h?.url ?? url)).pathname;
      } catch {
        path = "/";
      }
    }
    return {
      url: String(h?.url ?? ""),
      input: inputStr,
      path,
      status: Number(h?.status) || 0,
      length: Number(h?.length) || 0,
      words: Number(h?.words) || 0,
      lines: Number(h?.lines) || 0,
      contentType: h?.contentType ? String(h.contentType) : undefined,
      duration: h?.duration ? Number(h.duration) : undefined,
    };
  });
  return {
    results: hits,
    totalRequests:
      Number(
        (data as unknown as { totalRequests?: number; total?: number })
          .totalRequests ??
          (data as unknown as { total?: number }).total
      ) || hits.length,
    duration:
      Number(
        (data as unknown as { duration?: number; durationMs?: number })
          .duration ??
          (data as unknown as { durationMs?: number }).durationMs
      ) || 0,
    timedOut: (data as unknown as { timedOut?: boolean }).timedOut
      ? Boolean((data as unknown as { timedOut?: boolean }).timedOut)
      : undefined,
    raw: (data as unknown as { raw?: string }).raw
      ? String((data as unknown as { raw?: string }).raw)
      : undefined,
  };
}

/**
 * Run a SQLmap injection test against a URL.
 * opts.data (POST body), opts.cookies, opts.params, opts.method
 */
export async function sqlmapScan(
  url: string,
  opts: {
    data?: string;
    cookies?: string;
    params?: string[];
    method?: string;
  } = {}
): Promise<SqlmapResult | null> {
  const data = await callRecon<SqlmapResult & { injections?: unknown[] }>(
    "sqlmap",
    { url, ...opts }
  );
  if (!data) return null;
  // Tolerate both `injectionPoints` (canonical) and `injections` (legacy).
  const rawInjections =
    (Array.isArray(data.injectionPoints)
      ? data.injectionPoints
      : Array.isArray(data.injections)
        ? (data.injections as unknown[])
        : []) as Array<Record<string, unknown>>;
  return {
    vulnerable: Boolean(data.vulnerable),
    injectionPoints: rawInjections.map((i) => ({
      param: String(i?.param ?? i?.parameter ?? ""),
      type: String(i?.type ?? ""),
      title: String(i?.title ?? ""),
      payload: i?.payload ? String(i.payload) : undefined,
      dbms: i?.dbms ? String(i.dbms) : undefined,
    })),
    databases: Array.isArray(data.databases)
      ? data.databases.map(String)
      : undefined,
    banner: data.banner ? String(data.banner) : undefined,
    dbms: data.dbms ? String(data.dbms) : undefined,
    timedOut: data.timedOut ? Boolean(data.timedOut) : undefined,
    raw: data.raw ? String(data.raw) : undefined,
    durationMs: Number(data.durationMs) || 0,
  };
}

/**
 * Run Nuclei templates against a target.
 * opts.templates, opts.severity (array of severity strings), opts.tags
 */
export async function nucleiScan(
  target: string,
  opts: {
    templates?: string[];
    severity?: string[] | string; // service accepts string[]
    tags?: string[];
  } = {}
): Promise<NucleiResult | null> {
  // Normalise severity to an array for the service contract.
  const severity = Array.isArray(opts.severity)
    ? opts.severity
    : typeof opts.severity === "string" && opts.severity.length
      ? opts.severity.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  const data = await callRecon<NucleiResult>("nuclei", {
    target,
    ...opts,
    ...(severity ? { severity } : {}),
  });
  if (!data) return null;
  const allowedSev = ["critical", "high", "medium", "low", "info"];
  return {
    findings: Array.isArray(data.findings)
      ? data.findings.map((f) => ({
          templateId: String(f.templateId ?? "unknown"),
          name: String(f.name ?? f.templateId ?? "unknown"),
          severity: allowedSev.includes(String(f.severity).toLowerCase())
            ? (String(f.severity).toLowerCase() as NucleiFinding["severity"])
            : "info",
          type: String(f.type ?? "http"),
          url: String(f.url ?? target),
          matched: String(f.matched ?? ""),
          description: f.description ? String(f.description) : undefined,
          reference: Array.isArray(f.reference)
            ? f.reference.map(String)
            : undefined,
          cvss:
            typeof f.cvss === "number" || typeof f.cvss === "string"
              ? f.cvss
              : undefined,
          tags: Array.isArray(f.tags) ? f.tags.map(String) : undefined,
          matchedAt: f.matchedAt ? String(f.matchedAt) : String(f.url ?? target),
          extractedResults: Array.isArray(f.extractedResults)
            ? f.extractedResults.map(String)
            : undefined,
        }))
      : [],
    total: Number(data.total) || 0,
    timedOut: data.timedOut ? Boolean(data.timedOut) : undefined,
    raw: data.raw ? String(data.raw) : undefined,
    durationMs: Number(data.durationMs) || 0,
  };
}
