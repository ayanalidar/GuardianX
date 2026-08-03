// SQLmap wrapper — runs sqlmap in --batch mode against a single URL,
// parses the textual log output for injection points, databases, banner,
// and DBMS fingerprint.
//
// CRITICAL SAFETY CONSTRAINTS:
//   - We NEVER crawl (--crawl is omitted). Only the exact URL provided is
//     tested. This prevents sqlmap from "walking off" onto unauthorized
//     sibling endpoints.
//   - We use a temp output dir per scan, deleted after parsing.
//   - All inputs are validated; sqlmap is spawned via the args array.
//   - --random-agent is used to avoid trivial WAF signature matches.
//
// SECURITY: This service trusts the caller (sentinel-engine) to have
// verified authorization. We do not re-check here.

import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  isSafeToken,
  isValidUrl,
  runWithTimeout,
  type SqlmapInput,
  type SqlmapInjectionPoint,
  type SqlmapResult,
} from "./types.js";

const TIMEOUT_MS = 180_000;

export function validateSqlmapInput(input: SqlmapInput): void {
  const url = (input.url ?? "").trim();
  if (!isValidUrl(url)) {
    throw new Error(`Invalid url: ${url}`);
  }
  const method = (input.method ?? "GET").toUpperCase();
  if (!/^(GET|POST|PUT|DELETE|HEAD|PATCH)$/.test(method)) {
    throw new Error(`Invalid method: ${method}`);
  }
  if (input.data !== undefined) {
    if (typeof input.data !== "string" || input.data.length > 8192) {
      throw new Error("Invalid POST data (must be string ≤8192 chars)");
    }
    if (/\r?\n/.test(input.data)) {
      throw new Error("Invalid POST data (cannot contain newlines)");
    }
  }
  if (input.cookies !== undefined) {
    if (typeof input.cookies !== "string" || input.cookies.length > 4096) {
      throw new Error("Invalid cookies (must be string ≤4096 chars)");
    }
    if (/[\r\n]/.test(input.cookies)) {
      throw new Error("Invalid cookies (cannot contain newlines)");
    }
  }
  if (Array.isArray(input.params)) {
    for (const p of input.params) {
      if (!isSafeToken(p, 256)) {
        throw new Error(`Invalid param name: ${p}`);
      }
    }
  }
}

export async function runSqlmap(input: SqlmapInput): Promise<SqlmapResult> {
  validateSqlmapInput(input);

  const url = (input.url ?? "").trim();
  const method = (input.method ?? "GET").toUpperCase();

  const args: string[] = [
    "sqlmap",
    "-u",
    url,
    "--method",
    method,
    "--batch", // non-interactive
    "--level=3",
    "--risk=2",
    "--random-agent",
    "--dbs", // enumerate databases
    "--flush-session", // don't reuse cached results from prior runs
    "--output-dir", // will append path next
  ];

  // Use a per-scan output dir (avoids session reuse between scans of the same URL)
  const scanId = randomUUID();
  const outDir = join(tmpdir(), `guardianx-sqlmap-${scanId}`);
  args.push(outDir);

  // POST data (validation done in validateSqlmapInput)
  if (input.data) {
    args.push("--data", input.data);
  }

  // Cookies (validation done in validateSqlmapInput)
  if (input.cookies) {
    args.push("--cookie", input.cookies);
  }

  // Parameter pinning (only test named params, not all)
  if (Array.isArray(input.params)) {
    const cleaned = input.params.filter((p) => isSafeToken(p, 256));
    if (cleaned.length > 0) {
      args.push("-p", cleaned.join(","));
    }
  }

  const { exitCode, stdout, stderr, timedOut, durationMs } = await runWithTimeout({
    args,
    timeoutMs: TIMEOUT_MS,
  });

  try {
    // Even if timed out, we parse partial stdout for whatever sqlmap found.
    const result = parseSqlmapOutput(stdout, stderr);
    result.timedOut = timedOut;
    result.durationMs = durationMs;
    if (timedOut) {
      // Don't throw — return partial findings.
      return result;
    }
    if (exitCode !== 0 && !result.vulnerable && !result.injectionPoints.length) {
      // sqlmap exits non-zero when no injection is found sometimes, treat
      // that as "not vulnerable" with a note.
      result.raw = stderr.slice(-2000) || stdout.slice(-2000);
    }
    return result;
  } finally {
    // Best-effort cleanup of the temp dir
    try {
      await rm(outDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// ── Output parser ────────────────────────────────────────────────────────────
//
// sqlmap's --batch output is human-readable text. We pattern-match the most
// important lines. This is stable across sqlmap versions (1.5+).

function parseSqlmapOutput(stdout: string, stderr: string): SqlmapResult {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split(/\r?\n/);

  const injectionPoints: SqlmapInjectionPoint[] = [];
  const databases: string[] = [];
  let banner: string | undefined;
  let dbms: string | undefined;
  let vulnerable = false;

  // Track "current parameter" while walking injection sections
  let currentParam: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // DBMS fingerprint
    // "back-end DBMS: MySQL >= 5.0"
    const dbmsMatch = /back-end DBMS:\s*(.+?)$/i.exec(line);
    if (dbmsMatch) {
      dbms = dbmsMatch[1]!.trim();
      // Extract just the DBMS name (e.g. "MySQL" from "MySQL >= 5.0")
      const shortName = /^([A-Za-z0-9 ]+?)(?:\s|[<>=]|$)/.exec(dbms);
      if (shortName) dbms = shortName[1]!.trim();
    }

    // Banner
    // "banner: '5.7.40-0ubuntu0.18.04.1'"
    const bannerMatch = /banner:\s*['"]?(.+?)['"]?\s*$/i.exec(line);
    if (bannerMatch) {
      banner = bannerMatch[1]!.trim();
    }

    // Parameter header: "Parameter: id (GET)"
    const paramMatch = /Parameter:\s*([^\s(]+)\s*\(([^)]+)\)/i.exec(line);
    if (paramMatch) {
      currentParam = paramMatch[1]!;
      const paramType = paramMatch[2]!;
      // Next ~10 lines may contain "    Type: ..." entries
      let j = i + 1;
      while (j < lines.length && j < i + 30) {
        const sub = lines[j]!;
        const typeMatch = /^\s*Type:\s*(.+?)$/i.exec(sub);
        if (typeMatch) {
          const type = typeMatch[1]!.trim();
          // Look for a Title: line nearby
          let title: string | undefined;
          let payload: string | undefined;
          for (let k = j; k < Math.min(lines.length, j + 5); k++) {
            const tMatch = /^\s*Title:\s*(.+?)$/i.exec(lines[k]!);
            if (tMatch && !title) title = tMatch[1]!.trim();
            const pMatch = /^\s*Payload:\s*(.+?)$/i.exec(lines[k]!);
            if (pMatch && !payload) payload = pMatch[1]!.trim();
          }
          injectionPoints.push({
            param: currentParam,
            type,
            title: title ?? type,
            payload,
          });
          vulnerable = true;
        }
        // Stop scanning the param block when we hit a blank line followed
        // by something that isn't indented.
        if (sub === "" && j > i + 1 && lines[j + 1] && !/^\s/.test(lines[j + 1]!)) break;
        j++;
      }
    }

    // Vulnerability marker line
    if (/is vulnerable/i.test(line) || /injectable/i.test(line)) {
      vulnerable = true;
    }

    // Databases enumeration — appears under "available databases":
    // "available databases [2]:"
    // "[*] information_schema"
    // "[*] vulnshop"
    if (/available databases/i.test(line)) {
      for (let k = i + 1; k < Math.min(lines.length, i + 50); k++) {
        const dbMatch = /^\[\*\]\s+(.+?)$/i.exec(lines[k]!);
        if (dbMatch) {
          databases.push(dbMatch[1]!.trim());
        } else if (lines[k] === "" && databases.length > 0) {
          break;
        }
      }
    }
  }

  return {
    vulnerable,
    injectionPoints,
    databases: databases.length ? databases : undefined,
    banner,
    dbms,
    durationMs: 0,
  };
}

export function mockSqlmap(input: SqlmapInput): SqlmapResult {
  // Parse the URL to find a likely param name
  let param = "id";
  try {
    const u = new URL(input.url);
    if (u.searchParams.size > 0) {
      param = u.searchParams.keys().next().value ?? "id";
    }
  } catch {
    /* ignore */
  }
  return {
    vulnerable: true,
    injectionPoints: [
      {
        param,
        type: "boolean-based blind",
        title: "AND boolean-based blind - WHERE or HAVING clause",
        payload: `123 AND 1234=1234`,
      },
      {
        param,
        type: "time-based blind",
        title: "MySQL >= 5.0.12 AND time-based blind (query SLEEP)",
        payload: `123 AND SLEEP(5)`,
      },
      {
        param,
        type: "UNION query",
        title: "MySQL UNION query (NULL) - 1 to 20 columns",
        payload: `123 UNION ALL SELECT NULL-- -`,
      },
    ],
    databases: ["information_schema", "vulnshop"],
    banner: "5.7.40-0ubuntu0.18.04.1-log",
    dbms: "MySQL",
    durationMs: 0,
  };
}
