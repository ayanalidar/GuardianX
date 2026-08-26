// GuardianX Runtime Self-Attestation
// -----------------------------------
// Computes SHA-256 hashes of critical source files at startup + verifies
// them on every request (cached 60s). If any file is tampered with, the
// platform refuses to serve + logs an IntegrityIncident.
//
// This is the "self-immune" defense — the platform refuses to run if
// it's been tampered with.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { db } from "./db";

const CRITICAL_DIRS = [
  "src/app/api",
  "src/lib",
  "src/middleware.ts",
];

const HASHABLE_EXTENSIONS = [".ts", ".js", ".tsx"];

interface FileHash {
  path: string;
  hash: string;
}

let baselineHashes: Map<string, string> | null = null;
let baselineComputedAt: number | null = null;
let lastVerification: { ok: boolean; tamperedFiles: string[]; checkedAt: number } | null = null;
const VERIFY_CACHE_MS = 60_000; // 60s — don't re-hash on every request

/**
 * Compute SHA-256 hashes of all critical source files.
 * Returns a Map<filePath, hash>.
 */
function computeHashes(): Map<string, string> {
  const hashes = new Map<string, string>();

  function walkDir(dir: string) {
    if (!existsSync(dir)) return;
    const stat = statSync(dir);
    if (stat.isFile()) {
      if (HASHABLE_EXTENSIONS.includes(extname(dir))) {
        try {
          const content = readFileSync(dir, "utf8");
          const hash = createHash("sha256").update(content).digest("hex");
          hashes.set(dir, hash);
        } catch {
          // skip unreadable files
        }
      }
      return;
    }
    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
        walkDir(join(dir, entry));
      }
    }
  }

  for (const target of CRITICAL_DIRS) {
    walkDir(target);
  }

  return hashes;
}

/**
 * Establish the baseline hashes (first call). On Vercel serverless, this
 * is per-instance — each cold start recomputes. The baseline is stored
 * in the GUARDIANX_INTEGRITY_BASELINE env var if set (for cross-instance
 * verification).
 */
function ensureBaseline(): Map<string, string> {
  if (baselineHashes) return baselineHashes;

  // If a baseline is provided via env var, use it.
  const envBaseline = process.env.GUARDIANX_INTEGRITY_BASELINE;
  if (envBaseline) {
    try {
      const parsed = JSON.parse(envBaseline) as Record<string, string>;
      baselineHashes = new Map(Object.entries(parsed));
      baselineComputedAt = Date.now();
      return baselineHashes;
    } catch {
      // fall through to computing
    }
  }

  // Otherwise, compute from the current filesystem (first-run trust).
  baselineHashes = computeHashes();
  baselineComputedAt = Date.now();
  return baselineHashes;
}

export interface IntegrityStatus {
  ok: boolean;
  tamperedFiles: string[];
  totalFiles: number;
  checkedAt: string;
  baselineAt: string | null;
}

/**
 * Verify the current filesystem against the baseline.
 * Cached for 60s to avoid re-hashing on every request.
 */
export async function verifyIntegrity(): Promise<IntegrityStatus> {
  // Return cached result if fresh
  if (lastVerification && Date.now() - lastVerification.checkedAt < VERIFY_CACHE_MS) {
    return {
      ok: lastVerification.ok,
      tamperedFiles: lastVerification.tamperedFiles,
      totalFiles: baselineHashes?.size ?? 0,
      checkedAt: new Date(lastVerification.checkedAt).toISOString(),
      baselineAt: baselineComputedAt ? new Date(baselineComputedAt).toISOString() : null,
    };
  }

  const baseline = ensureBaseline();
  const current = computeHashes();

  const tamperedFiles: string[] = [];
  for (const [path, baselineHash] of baseline) {
    const currentHash = current.get(path);
    if (currentHash !== baselineHash) {
      tamperedFiles.push(path);
    }
  }

  const ok = tamperedFiles.length === 0;
  lastVerification = { ok, tamperedFiles, checkedAt: Date.now() };

  // If tampered, log an incident to the DB
  if (!ok) {
    try {
      await db.integrityIncident.create({
        data: {
          tamperedFiles: JSON.stringify(tamperedFiles),
          status: "open",
        },
      });
    } catch {
      // DB may not be available — don't crash the integrity check
    }
  }

  return {
    ok,
    tamperedFiles,
    totalFiles: baseline.size,
    checkedAt: new Date(lastVerification.checkedAt).toISOString(),
    baselineAt: baselineComputedAt ? new Date(baselineComputedAt).toISOString() : null,
  };
}

/**
 * Get the current baseline (for the admin dashboard display).
 */
export function getBaselineInfo(): { totalFiles: number; baselineAt: string | null } {
  return {
    totalFiles: baselineHashes?.size ?? 0,
    baselineAt: baselineComputedAt ? new Date(baselineComputedAt).toISOString() : null,
  };
}
