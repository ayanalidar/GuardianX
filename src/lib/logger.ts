// GuardianX structured logger.
//
// Goals:
//   - In development: pretty-print human-readable entries to the console so
//     engineers can scan them at a glance while iterating.
//   - In production: emit one JSON object per line to stdout, ready for any
//     log-aggregation pipeline (Vercel logs, Logtail, Datadog, ELK, etc.).
//   - Always carry a correlation key (`requestId`) so a single user-facing
//     request can be traced across every log line it produces, plus the
//     optional `userId` for the acting principal and an arbitrary `meta`
//     object for structured context.
//
// The logger is intentionally framework-free: it uses only `console` and the
// Web Crypto / Node `crypto` APIs, so it works in the Node.js runtime, the
// Edge runtime, and the browser. It never throws — a logging helper that
// throws is worse than no logging at all.

import { randomUUID } from "@/lib/crypto";

// `randomUUID` is backed by the global Web Crypto API (`globalThis.crypto.randomUUID`),
// available natively in Node 16.7+, modern browsers, and the Edge runtime
// (Cloudflare Pages / Vercel Edge). We fall back to a Math.random-based
// generator if neither is available (extremely rare, mostly very old
// runtimes) so the helper is total.
function uuid(): string {
  try {
    return randomUUID();
  } catch {
    // RFC4122 v4-ish fallback (not cryptographically strong, but unique
    // enough for log correlation).
    const rnd = (n: number) =>
      Array.from({ length: n }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
    return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-8${rnd(3)}-${rnd(12)}`;
  }
}

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Log level — one of "info" | "warn" | "error" | "debug". */
  level: LogLevel;
  /** Human-readable message. Keep this short and unique enough to grep. */
  message: string;
  /** Optional authenticated user id (sub from the JWT). */
  userId?: string;
  /** Optional request correlation id (see `newRequestId`). */
  requestId?: string;
  /** Optional structured context — any JSON-serialisable object. */
  meta?: Record<string, unknown>;
}

const isDev = process.env.NODE_ENV !== "production";

// ANSI colour codes for the dev pretty-printer. They're a no-op in production
// because we never call the pretty printer there.
const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  debug: "\x1b[90m",  // grey
};
const RESET = "\x1b[0m";

function safeStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Generate a fresh request id. Call once at the very top of an API route
 * handler (or inside the `withErrorHandler` wrapper, which does this for
 * you) and stamp every downstream log + the `X-Request-ID` response header
 * with it.
 *
 * The id is a UUIDv4 string — opaque, URL-safe, and unique across processes
 * so it works even when requests are load-balanced across multiple replicas.
 */
export function newRequestId(): string {
  return uuid();
}

/**
 * Read an incoming `X-Request-ID` header if the client supplied one (some
 * gateways / front-ends do), otherwise mint a fresh one. Use this to honor
 * client-supplied correlation ids without blindly trusting them: we only
 * echo the value if it matches a safe character set (alnum + dash + underscore,
 * capped at 128 chars). Anything fancier gets discarded to prevent header
 * injection / log injection.
 */
export function getOrNewRequestId(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  if (incoming && /^[A-Za-z0-9_-]{1,128}$/.test(incoming)) {
    return incoming;
  }
  return newRequestId();
}

/**
 * Render a log entry. In dev we pretty-print a coloured single-line string
 * that's easy to scan; in production we emit a single-line JSON object so
 * downstream aggregators can parse it without regex.
 */
function formatEntry(entry: LogEntry): string {
  if (isDev) {
    const ts = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
    const color = COLORS[entry.level];
    const ctx: string[] = [];
    if (entry.requestId) ctx.push(`rid=${entry.requestId.slice(0, 8)}`);
    if (entry.userId) ctx.push(`uid=${entry.userId.slice(0, 8)}`);
    const ctxStr = ctx.length ? ` ${ctx.join(" ")}` : "";
    const metaStr = entry.meta ? ` ${safeStringify(entry.meta)}` : "";
    return `${color}[${ts}] ${entry.level.toUpperCase().padEnd(5)}${RESET}${ctxStr} ${entry.message}${metaStr}`;
  }
  // Production: one JSON object per line. We strip `undefined` keys so the
  // output is compact and predictable for log parsers.
  const out: Record<string, unknown> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  };
  if (entry.userId !== undefined) out.userId = entry.userId;
  if (entry.requestId !== undefined) out.requestId = entry.requestId;
  if (entry.meta !== undefined) out.meta = entry.meta;
  return safeStringify(out);
}

function emit(entry: LogEntry): void {
  const line = formatEntry(entry);
  // Use the matching console method so Node's `console` correctly threads
  // the level through to stderr/stdout (errors + warns go to stderr).
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      // Honor the DEBUG flag so production builds don't drown in debug
      // noise unless explicitly opted-in.
      if (isDev || process.env.DEBUG_LOGS === "1" || process.env.DEBUG === "1") {
        console.debug(line);
      }
      break;
    case "info":
    default:
      console.log(line);
      break;
  }
}

function makeLevel(level: LogLevel) {
  return (
    message: string,
    opts?: {
      userId?: string;
      requestId?: string;
      meta?: Record<string, unknown>;
    }
  ): void => {
    emit({
      timestamp: new Date().toISOString(),
      level,
      message,
      userId: opts?.userId,
      requestId: opts?.requestId,
      meta: opts?.meta,
    });
  };
}

/**
 * The GuardianX logger. Use it instead of raw `console.*` everywhere a
 * structured log entry is wanted:
 *
 *   import { logger } from "@/lib/logger";
 *   logger.info("client created", { requestId, userId, meta: { clientId } });
 *
 * All methods are synchronous (console is already synchronous-ish on the
 * server) and never throw — a logging helper that throws is worse than no
 * logging at all.
 */
export const logger = {
  info: makeLevel("info"),
  warn: makeLevel("warn"),
  error: makeLevel("error"),
  debug: makeLevel("debug"),
  /**
   * Bind a `userId` + `requestId` once and get back a child logger that
   * auto-attaches them to every call. Useful inside a single API request
   * so each log line is correlated without re-passing the ids.
   *
   *   const log = logger.child({ userId, requestId });
   *   log.info("starting scan");
   *   log.error("scan failed", { meta: { reason } });
   */
  child(opts: { userId?: string; requestId?: string }) {
    return {
      info: (message: string, m?: Record<string, unknown>) =>
        logger.info(message, { ...opts, meta: m }),
      warn: (message: string, m?: Record<string, unknown>) =>
        logger.warn(message, { ...opts, meta: m }),
      error: (message: string, m?: Record<string, unknown>) =>
        logger.error(message, { ...opts, meta: m }),
      debug: (message: string, m?: Record<string, unknown>) =>
        logger.debug(message, { ...opts, meta: m }),
    };
  },
};

export default logger;
