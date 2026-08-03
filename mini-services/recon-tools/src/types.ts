// Shared types + input validators for recon-tools mini-service.
//
// SECURITY MODEL:
//   This service trusts the caller (sentinel-engine / RedAgent) to have
//   verified that the target is authorized for scanning. We do NOT re-check
//   authorization here. We DO sanitize every input to prevent command
//   injection — all tools are spawned via Bun.spawn([tool, ...args]) with
//   validated argument strings (no shell interpolation).

// ── Input types ────────────────────────────────────────────────────────────

export type NmapScanType = "quick" | "full" | "service" | "vuln";

export interface NmapInput {
  target: string;
  ports?: string;
  scanType?: NmapScanType;
}

export interface FfufInput {
  url: string;
  wordlist?: string;
  method?: string;
  headers?: Record<string, string>;
  extensions?: string[];
}

export interface SqlmapInput {
  url: string;
  method?: string;
  data?: string;
  cookies?: string;
  params?: string[];
}

export interface NucleiInput {
  target: string;
  templates?: string[];
  severity?: string[];
}

// ── Output types ───────────────────────────────────────────────────────────

export interface NmapScript {
  id: string;
  output: string;
  port?: number;
  protocol?: string;
}

export interface NmapPort {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version?: string;
  product?: string;
  extraInfo?: string;
  scripts?: NmapScript[];
}

export interface NmapResult {
  host: string;
  status: string;
  reason?: string;
  addresses: { type: string; addr: string }[];
  hostnames: string[];
  ports: NmapPort[];
  scripts: NmapScript[];
  raw?: string;
  timedOut?: boolean;
  durationMs: number;
}

export interface FfufResultItem {
  url: string;
  input: string;
  status: number;
  length: number;
  words: number;
  lines: number;
  contentType?: string;
  duration?: number;
}

export interface FfufResult {
  results: FfufResultItem[];
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
  severity: string;
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

// ── Generic tool result envelope ────────────────────────────────────────────

export interface ToolError {
  error: string;
  code?: string;
  stdout?: string;
  stderr?: string;
}

// ── Validators ──────────────────────────────────────────────────────────────
//
// These exist to PREVENT command injection. Even though we always use the
// args-array form of Bun.spawn (which never goes through a shell), we still
// validate inputs to catch malformed requests early and to harden against
// future refactors that might accidentally switch to a shell-based spawn.

const HOSTNAME_RE =
  // hostname | IPv4 | IPv6 (simple) | CIDR
  /^(?=.{1,255}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

export function isValidTarget(target: string): boolean {
  if (!target || typeof target !== "string" || target.length > 255) return false;
  // Strip optional CIDR / range suffix
  const t = target.trim();
  if (CIDR_RE.test(t)) {
    // Validate CIDR mask
    const mask = parseInt(t.split("/")[1] ?? "", 10);
    return mask >= 0 && mask <= 32;
  }
  // Range like 192.168.1.1-50
  if (/^\d{1,3}(\.\d{1,3}){3}-\d{1,3}$/.test(t)) return true;
  if (IPV4_RE.test(t)) return true;
  if (IPV6_RE.test(t) && t.includes(":")) return true;
  return HOSTNAME_RE.test(t);
}

export function isValidPortSpec(ports?: string): boolean {
  if (!ports) return true; // optional
  if (typeof ports !== "string" || ports.length > 200) return false;
  // Allow: 80, 1-1000, 80,443,8080, U:53, T:80 (nmap syntax), but no shell metachars
  return /^[0-9a-zA-Z:,\-]+$/.test(ports);
}

const URL_RE = /^https?:\/\/[^\s'"`<>\\]{1,2048}$/i;

export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return URL_RE.test(url.trim());
}

// Reject anything containing shell metacharacters or null bytes.
const SHELL_META_RE = /[\0\s`$|;&<>(){}!#~*?\\\n\r"']/;

export function isSafeToken(s: string, maxLen = 1024): boolean {
  if (!s || typeof s !== "string") return false;
  if (s.length > maxLen) return false;
  if (/\s/.test(s)) return false; // tokens can't contain whitespace
  return !SHELL_META_RE.test(s);
}

// Header names + values validation (used for ffuf -H "Key: Value" tokens).
export function isValidHeaderName(name: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(name) && name.length <= 128;
}

export function isValidHeaderValue(value: string): boolean {
  return typeof value === "string" && value.length <= 4096 && !/[\r\n]/.test(value);
}

// Severity values accepted by nuclei -severity
const NUCLEI_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export function isValidSeverity(s: string): boolean {
  return NUCLEI_SEVERITIES.has(s.toLowerCase());
}

export function isValidTemplateCategory(t: string): boolean {
  // Allow letters/digits/dash/underscore/slash (template path), but not shell metachars
  return typeof t === "string" && t.length > 0 && t.length <= 256 && /^[A-Za-z0-9/_\-.]+$/.test(t);
}

// ── Tool availability (for dev mock mode) ───────────────────────────────────

let toolAvailabilityCache: Record<string, boolean> | null = null;

export async function checkToolAvailability(): Promise<Record<string, boolean>> {
  if (toolAvailabilityCache) return toolAvailabilityCache;
  const tools = ["nmap", "ffuf", "sqlmap", "nuclei"];
  const result: Record<string, boolean> = {};
  await Promise.all(
    tools.map(
      (tool) =>
        new Promise<void>((resolve) => {
          try {
            const child = Bun.spawn([tool, "--version"], {
              stdout: "pipe",
              stderr: "pipe",
            });
            child.exited
              .then((code) => {
                result[tool] = code === 0 || code === 1; // sqlmap exits 1 with --version sometimes
              })
              .catch(() => {
                result[tool] = false;
              })
              .finally(() => resolve());
          } catch {
            result[tool] = false;
            resolve();
          }
        }),
    ),
  );
  toolAvailabilityCache = result;
  return result;
}

// ── Spawn helper with timeout + capture ──────────────────────────────────────

export interface SpawnOptions {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes?: number;
}

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export async function runWithTimeout(opts: SpawnOptions): Promise<SpawnResult> {
  const start = Date.now();
  const { args, timeoutMs, cwd, env, maxOutputBytes = 20 * 1024 * 1024 } = opts;

  if (args.length === 0) throw new Error("runWithTimeout: empty args array");
  const tool = args[0] as string;
  const toolArgs = args.slice(1);

  return await new Promise<SpawnResult>((resolve) => {
    let child: import("bun").Subprocess<"pipe", "pipe", "pipe">;
    try {
      child = Bun.spawn([tool, ...toolArgs], {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        timedOut: false,
        durationMs: Date.now() - start,
      });
      return;
    }

    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const stdoutReader = child.stdout.getReader();
    const stderrReader = child.stderr.getReader();

    const pump = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      chunks: Uint8Array[],
      onByte: (n: number) => void,
    ) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            onByte(value.length);
            // Cap memory: stop accumulating past the limit (keep partial)
            const currentTotal = chunks.reduce((s, c) => s + c.length, 0);
            if (currentTotal < maxOutputBytes) {
              const remaining = maxOutputBytes - currentTotal;
              chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
            }
          }
        }
      } catch {
        /* reader closed */
      }
    };

    Promise.all([
      pump(stdoutReader, stdoutChunks, (n) => (stdoutBytes += n)),
      pump(stderrReader, stderrChunks, (n) => (stderrBytes += n)),
      child.exited,
    ]).then(([_, __, exitCode]) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolve({
        exitCode: exitCode as number | null,
        stdout,
        stderr,
        timedOut: killed,
        durationMs: Date.now() - start,
      });
    });
  });
}

// ── Concurrency limiter (max 1 per tool key) ─────────────────────────────────

const queues: Record<string, Promise<unknown>> = {};
const inflight: Record<string, boolean> = {};

export async function withConcurrencyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Serialize per-key. The next call waits until the previous settles.
  const prev = queues[key] ?? Promise.resolve();
  let release!: () => void;
  queues[key] = new Promise<void>((r) => {
    release = r;
  });
  try {
    await prev;
    inflight[key] = true;
    return await fn();
  } finally {
    inflight[key] = false;
    release();
  }
}

export function isToolBusy(key: string): boolean {
  return !!inflight[key];
}
