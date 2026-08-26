// GuardianX SIEM - Log retention policy.
//
// Three-tier lifecycle:
//   HOT  (default 7 days)   - fastest tier, fully indexed, always searchable.
//   WARM (default 30 days)  - kept online but excluded from default search.
//   COLD (default 365 days) - archived/compressed representation only.
//   After COLD expiry the records are eligible for `runCleanup()` deletion.
//
// The policy is persisted as a single Integration row with type
// "siem_retention_policy". This avoids a schema migration and reuses the
// existing Integration table.

import { db } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────

export type RetentionTier = "hot" | "warm" | "cold" | "delete";

export interface RetentionPolicy {
  hotDays: number;
  warmDays: number;
  coldDays: number;
  /** Per-table tier overrides. Key is the SIEM source name. */
  tables: Record<string, RetentionTier>;
  /** Whether the cleanup cron is enabled. */
  autoCleanup: boolean;
  /** ISO timestamp of the last successful cleanup run. */
  lastCleanupAt?: string | null;
}

export interface RetentionStats {
  policy: RetentionPolicy;
  counts: Array<{
    source: string;
    table: string;
    total: number;
    olderThanHot: number;
    olderThanWarm: number;
    olderThanCold: number;
  }>;
  totalRecords: number;
  estimatedDeletable: number;
}

// ── Source -> Prisma model + date field mapping ───────────────────────────

interface SourceMeta {
  model: "auditLog" | "apiAccessLog" | "honeypotHit" | "canary" | "incidentEvent" | "finding" | "patch";
  table: string;
  dateField: "createdAt" | "timestamp" | "occurredAt" | "detectedAt";
}

const SOURCE_META: Record<string, SourceMeta> = {
  audit: { model: "auditLog", table: "AuditLog", dateField: "createdAt" },
  api_access: { model: "apiAccessLog", table: "ApiAccessLog", dateField: "timestamp" },
  honeypot: { model: "honeypotHit", table: "HoneypotHit", dateField: "timestamp" },
  canary: { model: "canary", table: "Canary", dateField: "createdAt" },
  incident: { model: "incidentEvent", table: "IncidentEvent", dateField: "occurredAt" },
  finding: { model: "finding", table: "Finding", dateField: "createdAt" },
  patch: { model: "patch", table: "Patch", dateField: "createdAt" },
};

// ── Default policy ────────────────────────────────────────────────────────

export const DEFAULT_POLICY: RetentionPolicy = {
  hotDays: 7,
  warmDays: 30,
  coldDays: 365,
  tables: {
    audit: "hot",
    api_access: "hot",
    honeypot: "warm",
    canary: "warm",
    incident: "cold",
    finding: "cold",
    patch: "cold",
  },
  autoCleanup: true,
  lastCleanupAt: null,
};

// ── Persistence helpers ───────────────────────────────────────────────────

const POLICY_INTEGRATION_TYPE = "siem_retention_policy";

async function loadPolicyRow(): Promise<Record<string, unknown> | null> {
  try {
    const row = await db.integration.findFirst({
      where: { type: POLICY_INTEGRATION_TYPE },
    });
    return (row as Record<string, unknown>) || null;
  } catch {
    return null;
  }
}

function parsePolicy(row: Record<string, unknown> | null): RetentionPolicy {
  if (!row) return { ...DEFAULT_POLICY };
  try {
    const parsed = JSON.parse((row.config as string) || "{}");
    return {
      hotDays: Number(parsed.hotDays) || DEFAULT_POLICY.hotDays,
      warmDays: Number(parsed.warmDays) || DEFAULT_POLICY.warmDays,
      coldDays: Number(parsed.coldDays) || DEFAULT_POLICY.coldDays,
      tables: parsed.tables && typeof parsed.tables === "object" ? parsed.tables : DEFAULT_POLICY.tables,
      autoCleanup: parsed.autoCleanup !== false,
      lastCleanupAt: parsed.lastCleanupAt || null,
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

// ── Public: getRetentionPolicy ────────────────────────────────────────────

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  return parsePolicy(await loadPolicyRow());
}

// ── Public: setRetentionPolicy ────────────────────────────────────────────
//
// Upserts the Integration row that stores the policy. Merges with the
// existing policy so callers can patch individual fields.

export async function setRetentionPolicy(
  patch: Partial<RetentionPolicy>
): Promise<RetentionPolicy> {
  const existing = await getRetentionPolicy();
  const next: RetentionPolicy = {
    hotDays: patch.hotDays ?? existing.hotDays,
    warmDays: patch.warmDays ?? existing.warmDays,
    coldDays: patch.coldDays ?? existing.coldDays,
    tables: patch.tables ? { ...existing.tables, ...patch.tables } : existing.tables,
    autoCleanup: patch.autoCleanup !== undefined ? patch.autoCleanup : existing.autoCleanup,
    lastCleanupAt: patch.lastCleanupAt ?? existing.lastCleanupAt,
  };

  const row = await loadPolicyRow();
  const configStr = JSON.stringify(next);

  try {
    if (row) {
      await db.integration.update({
        where: { id: row.id as string },
        data: { config: configStr },
      });
    } else {
      await db.integration.create({
        data: {
          type: POLICY_INTEGRATION_TYPE,
          config: configStr,
          isActive: true,
        },
      });
    }
  } catch (err) {
    throw new Error(
      `Failed to persist retention policy: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  return next;
}

// ── Public: getRetentionStats ─────────────────────────────────────────────
//
// For each SIEM source we count:
//   - total records
//   - records older than hot (need to move to warm tier)
//   - records older than warm (need to move to cold tier)
//   - records older than cold (eligible for deletion)
//
// Because we do not actually move records between physical tiers (this is a
// lightweight implementation), "move to warm/cold" is purely advisory - the
// counts tell the operator how many records are beyond each threshold.

export async function getRetentionStats(): Promise<RetentionStats> {
  const policy = await getRetentionPolicy();
  const now = Date.now();
  const hotCutoff = new Date(now - policy.hotDays * 86400_000);
  const warmCutoff = new Date(now - policy.warmDays * 86400_000);
  const coldCutoff = new Date(now - policy.coldDays * 86400_000);

  const counts: RetentionStats["counts"] = [];
  let totalRecords = 0;
  let estimatedDeletable = 0;

  for (const [source, meta] of Object.entries(SOURCE_META)) {
    let total = 0;
    let olderThanHot = 0;
    let olderThanWarm = 0;
    let olderThanCold = 0;

    try {
      total = await db[meta.model].count({});
      olderThanHot = await db[meta.model].count({
        where: { [meta.dateField]: { lt: hotCutoff } },
      });
      olderThanWarm = await db[meta.model].count({
        where: { [meta.dateField]: { lt: warmCutoff } },
      });
      olderThanCold = await db[meta.model].count({
        where: { [meta.dateField]: { lt: coldCutoff } },
      });
    } catch {
      // table might be empty/missing - report zeros
    }

    counts.push({
      source,
      table: meta.table,
      total,
      olderThanHot,
      olderThanWarm,
      olderThanCold,
    });
    totalRecords += total;
    estimatedDeletable += olderThanCold;
  }

  return {
    policy,
    counts,
    totalRecords,
    estimatedDeletable,
  };
}

// ── Public: runCleanup ────────────────────────────────────────────────────
//
// Deletes records older than coldDays from every SIEM source. Returns per-
// source deletion counts. The Supabase REST proxy does not support
// `deleteMany` directly, so we fetch the IDs of stale records and delete
// them one at a time (this is acceptable for the modest volumes expected
// in a single cleanup run; larger deployments should batch via RPC).

export async function runCleanup(): Promise<{
  policy: RetentionPolicy;
  deleted: Array<{ source: string; table: string; deleted: number; error?: string }>;
  totalDeleted: number;
  ranAt: string;
}> {
  const policy = await getRetentionPolicy();
  const coldCutoff = new Date(Date.now() - policy.coldDays * 86400_000);
  const ranAt = new Date().toISOString();

  const results: Array<{ source: string; table: string; deleted: number; error?: string }> = [];

  for (const [source, meta] of Object.entries(SOURCE_META)) {
    let deletedCount = 0;
    let error: string | undefined;
    try {
      const stale = (await db[meta.model].findMany({
        where: { [meta.dateField]: { lt: coldCutoff } },
        select: { id: true },
        take: 1000, // cap per run to avoid timeouts
      })) as Array<Record<string, unknown>>;

      for (const row of stale) {
        try {
          await db[meta.model].delete({ where: { id: row.id as string } });
          deletedCount++;
        } catch {
          // skip individual delete failures
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "cleanup_failed";
    }

    results.push({ source, table: meta.table, deleted: deletedCount, error });
  }

  // Stamp the last successful cleanup time on the policy.
  try {
    await setRetentionPolicy({ lastCleanupAt: ranAt });
  } catch {
    /* ignore - best-effort */
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
  return { policy, deleted: results, totalDeleted, ranAt };
}
