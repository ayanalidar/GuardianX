// GuardianX recon-tools — unified HTTP wrapper for nmap / ffuf / sqlmap / nuclei.
//
// Service:  recon-tools  (mini-service)
// Port:     3004
// Runtime:  Bun (built-in HTTP server + spawn — no external deps)
//
// Endpoints:
//   GET  /healthz       — liveness + tool version probe
//   POST /api/nmap      — nmap port scanner
//   POST /api/ffuf      — ffuf directory/content fuzzer
//   POST /api/sqlmap    — sqlmap SQLi tester (single URL, no crawl)
//   POST /api/nuclei    — nuclei template scanner
//
// SECURITY MODEL:
//   This service trusts the caller (sentinel-engine / RedAgent pipeline) to
//   have verified that the target is authorized for scanning. We do NOT
//   re-check authorization here. We DO:
//     - Validate every input to prevent command injection
//     - Spawn tools via Bun.spawn([tool, ...args]) with args arrays
//       (NEVER shell strings)
//     - Enforce per-tool timeouts + kill orphan processes
//     - Limit concurrency to 1 scan per tool (queue others)
//     - Clean up temp dirs after each scan
//   In dev (when a tool isn't installed), we return a mock response so the
//   service can run on a developer machine without the tools.
//
// Auth: optional X-Engine-Key header (set RECON_TOOLS_KEY env var to enable).
// When unset, auth is disabled (suitable for trusted in-cluster calls).

import { checkToolAvailability, withConcurrencyLock } from "./src/types.js";
import { runNmap, mockNmap, validateNmapInput } from "./src/nmap.js";
import { runFfuf, mockFfuf, validateFfufInput } from "./src/ffuf.js";
import { runSqlmap, mockSqlmap, validateSqlmapInput } from "./src/sqlmap.js";
import { runNuclei, mockNuclei, validateNucleiInput } from "./src/nuclei.js";

const PORT = parseInt(process.env.PORT || "3004", 10);
const RECON_TOOLS_KEY = process.env.RECON_TOOLS_KEY || "";
const MOCK_MODE = process.env.RECON_TOOLS_MOCK === "1";

interface RouteResult {
  status: number;
  body: unknown;
}

// ── Read JSON body ──────────────────────────────────────────────────────────
async function readBody(req: Request): Promise<any> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Engine-Key",
    },
  });
}

function errorJson(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { error: message, ...extra });
}

// ── Tool version probes (cached) ────────────────────────────────────────────
let versionCache: { nmap: string; ffuf: string; sqlmap: string; nuclei: string } | null = null;

async function getToolVersions(): Promise<{ nmap: string; ffuf: string; sqlmap: string; nuclei: string }> {
  if (versionCache) return versionCache;

  const probe = async (tool: string, flag: string): Promise<string> => {
    try {
      const proc = Bun.spawn([tool, flag], { stdout: "pipe", stderr: "pipe" });
      const out = await new Response(proc.stdout).text();
      const err = await new Response(proc.stderr).text();
      await proc.exited;
      // Take the first non-empty line of either stream
      const firstLine = (out || err).split("\n").find((l) => l.trim()) || "unknown";
      return firstLine.trim().slice(0, 200);
    } catch {
      return "not installed";
    }
  };

  versionCache = {
    nmap: await probe("nmap", "--version"),
    ffuf: await probe("ffuf", "-V"),
    sqlmap: await probe("sqlmap", "--version"),
    nuclei: await probe("nuclei", "-version"),
  };
  return versionCache;
}

// ── Tool dispatch (with mock fallback + concurrency lock) ────────────────────
async function dispatchTool<T>(
  toolKey: string,
  availability: Record<string, boolean>,
  isInstalled: boolean,
  realFn: () => Promise<T>,
  mockFn: () => T,
): Promise<RouteResult> {
  // Mock mode (env override) — always return mock
  if (MOCK_MODE) {
    return { status: 200, body: mockFn() };
  }
  // Dev fallback: tool not installed → mock with a header note
  if (!isInstalled) {
    const body = mockFn();
    if (body && typeof body === "object") {
      (body as Record<string, unknown>)._mock = true;
      (body as Record<string, unknown>)._note = `${toolKey} not installed in this environment — returning mock data. Run inside the Docker image for real scans.`;
    }
    return { status: 200, body };
  }
  // Real path — serialize per-tool (max 1 concurrent scan per tool key)
  if (availability[toolKey] === undefined || availability[toolKey] === null) {
    // caller should have set availability — defensive
    return { status: 500, body: { error: `Availability for ${toolKey} not determined` } };
  }
  try {
    const result = await withConcurrencyLock(toolKey, realFn);
    return { status: 200, body: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      body: { error: `${toolKey} scan failed: ${message}`, tool: toolKey },
    };
  }
}

// ── Main HTTP server ────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Engine-Key",
        },
      });
    }

    // ── Health check (no auth) ────────────────────────────────────────────
    if (path === "/healthz" && method === "GET") {
      const versions = await getToolVersions();
      return json(200, {
        ok: true,
        service: "recon-tools",
        version: "1.0.0",
        mockMode: MOCK_MODE,
        uptime: process.uptime(),
        tools: versions,
      });
    }

    // ── Auth (optional X-Engine-Key) ───────────────────────────────────────
    if (path.startsWith("/api/") && RECON_TOOLS_KEY) {
      const key = req.headers.get("x-engine-key");
      if (key !== RECON_TOOLS_KEY) {
        return errorJson(401, "Unauthorized — invalid X-Engine-Key");
      }
    }

    if (method !== "POST") {
      return errorJson(405, `Method ${method} not allowed on ${path}`);
    }

    const body = await readBody(req);

    // Probe tool availability once (cached)
    const availability = await checkToolAvailability();

    let result: RouteResult;

    try {
      // ── POST /api/nmap ───────────────────────────────────────────────
      if (path === "/api/nmap") {
        if (!body.target) return errorJson(400, "target required");
        // Validate BEFORE mock fallback so dev mode also rejects bad input.
        validateNmapInput(body);
        result = await dispatchTool(
          "nmap",
          availability,
          availability.nmap === true,
          () => runNmap(body),
          () => mockNmap(body),
        );
      }
      // ── POST /api/ffuf ───────────────────────────────────────────────
      else if (path === "/api/ffuf") {
        if (!body.url) return errorJson(400, "url required");
        validateFfufInput(body);
        result = await dispatchTool(
          "ffuf",
          availability,
          availability.ffuf === true,
          () => runFfuf(body),
          () => mockFfuf(body),
        );
      }
      // ── POST /api/sqlmap ─────────────────────────────────────────────
      else if (path === "/api/sqlmap") {
        if (!body.url) return errorJson(400, "url required");
        validateSqlmapInput(body);
        result = await dispatchTool(
          "sqlmap",
          availability,
          availability.sqlmap === true,
          () => runSqlmap(body),
          () => mockSqlmap(body),
        );
      }
      // ── POST /api/nuclei ─────────────────────────────────────────────
      else if (path === "/api/nuclei") {
        if (!body.target) return errorJson(400, "target required");
        validateNucleiInput(body);
        result = await dispatchTool(
          "nuclei",
          availability,
          availability.nuclei === true,
          () => runNuclei(body),
          () => mockNuclei(body),
        );
      } else {
        return errorJson(404, `Not found: ${path}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Validation errors are 400; generic spawn failures are 500.
      const status = message.startsWith("Invalid ") || message.includes("required") ? 400 : 500;
      return errorJson(status, message);
    }

    return json(result.status, result.body);
  },
});

console.log(`[recon-tools] HTTP server listening on http://localhost:${server.port}`);
console.log(`[recon-tools] Health: http://localhost:${server.port}/healthz`);
console.log(`[recon-tools] Mock mode: ${MOCK_MODE ? "ON" : "off"}`);
console.log(`[recon-tools] Auth: ${RECON_TOOLS_KEY ? "enabled (X-Engine-Key)" : "DISABLED (set RECON_TOOLS_KEY)"}`);
console.log(`[recon-tools] Endpoints: POST /api/{nmap,ffuf,sqlmap,nuclei}`);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  console.log(`[recon-tools] ${signal} received, shutting down`);
  try {
    server.stop(true); // stop accepting new requests, abort in-flight
  } catch {
    /* ignore */
  }
  // Give the event loop a tick to flush logs, then exit.
  setTimeout(() => process.exit(0), 100);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
