// GuardianX SIEM - Unified log search engine.
//
// Queries 7 log tables in parallel and normalizes the results into a single
// UnifiedLogEntry stream that can be searched, filtered, and correlated.
//
// Tables covered:
//   - AuditLog        (platform activity trail)
//   - ApiAccessLog    (per-request API access logs)
//   - HoneypotHit     (honeypot endpoint hits)
//   - Canary          (canary token deployment + detection)
//   - IncidentEvent   (DFIR incident timeline events)
//   - Finding         (DAST findings)
//   - Patch           (SAST patch findings)
//
// All DB access goes through the Prisma-compatible proxy at @/lib/db, so
// `db.auditLog.findMany(...)` etc. are dispatched to Supabase REST under
// the hood. Date fields are hydrated to Date objects on read.

import { db } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────

export type SiemSource =
  | "audit"
  | "api_access"
  | "honeypot"
  | "canary"
  | "incident"
  | "finding"
  | "patch";

export type SiemSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface UnifiedLogEntry {
  id: string;
  source: SiemSource;
  type: string;
  severity: SiemSeverity;
  title: string;
  description: string;
  ipAddress: string | null;
  timestamp: string; // ISO string
  raw: Record<string, unknown>;
}

export interface UnifiedSearchQuery {
  /** Free-text search across title + description (case-insensitive). */
  query?: string;
  /** Restrict to one or more sources. */
  sources?: SiemSource[];
  /** Restrict to one or more severities. */
  severities?: SiemSeverity[];
  /** ISO date string or Date - only events at or after this time. */
  startTime?: string | Date;
  /** ISO date string or Date - only events at or before this time. */
  endTime?: string | Date;
  /** Filter by IP address (only applies to sources that carry an IP). */
  ipAddress?: string;
  /** Maximum number of results to return (default 200, max 1000). */
  limit?: number;
}

export interface SiemStats {
  timeRange: string;
  totals: {
    total: number;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  topIps: Array<{ ipAddress: string; count: number }>;
  recentCritical: Array<UnifiedLogEntry>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ALL_SOURCES: SiemSource[] = [
  "audit",
  "api_access",
  "honeypot",
  "canary",
  "incident",
  "finding",
  "patch",
];

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return 200;
  return Math.min(Math.floor(limit), 1000);
}

function toIso(d: string | Date | undefined | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString();
  } catch {
    return null;
  }
}

function safeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

/** Severity bucket for an HTTP status code (used for ApiAccessLog). */
function severityForStatus(code: number): SiemSeverity {
  if (code >= 500) return "high";
  if (code >= 400) return "medium";
  if (code >= 300) return "low";
  return "info";
}

/** Case-insensitive substring match across a record's text fields. */
function matchesQuery(
  text: string,
  q: string | undefined
): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

// ── Per-source normalizers ────────────────────────────────────────────────
//
// Each normalizer pulls the canonical fields out of the raw DB record. Any
// filter that the proxy supports natively (e.g. createdAt >= startTime,
// ipAddress eq value) is applied at the DB level; everything else is applied
// in JS after normalization.

type DbRecord = Record<string, unknown>;

function normalizeAuditLog(r: DbRecord): UnifiedLogEntry {
  const action = safeText(r.action) || "audit";
  const entity = safeText(r.entity) || "-";
  const details = safeText(r.details);
  return {
    id: safeText(r.id),
    source: "audit",
    type: action,
    severity: "info",
    title: `${action} on ${entity}`,
    description: details || `Action performed by ${safeText(r.actor) || "system"}`,
    ipAddress: null,
    timestamp: (r.createdAt as Date).toISOString(),
    raw: r,
  };
}

function normalizeApiAccessLog(r: DbRecord): UnifiedLogEntry {
  const method = safeText(r.method) || "GET";
  const endpoint = safeText(r.endpoint) || "/";
  const statusCode = Number(r.statusCode) || 0;
  const ip = safeText(r.ipAddress) || null;
  return {
    id: safeText(r.id),
    source: "api_access",
    type: method,
    severity: severityForStatus(statusCode),
    title: `${method} ${endpoint} -> ${statusCode}`,
    description: `From ${ip || "?"} UA=${safeText(r.userAgent).slice(0, 80)} size=${Number(r.responseSize) || 0}`,
    ipAddress: ip,
    timestamp: (r.timestamp as Date).toISOString(),
    raw: r,
  };
}

function normalizeHoneypotHit(r: DbRecord): UnifiedLogEntry {
  const endpoint = safeText(r.endpoint) || "/honeypot";
  const method = safeText(r.method) || "GET";
  const ip = safeText(r.ipAddress) || null;
  return {
    id: safeText(r.id),
    source: "honeypot",
    type: method,
    severity: "high",
    title: `Honeypot hit on ${endpoint}`,
    description: `${method} from ${ip || "?"} UA=${safeText(r.userAgent).slice(0, 80)}`,
    ipAddress: ip,
    timestamp: (r.timestamp as Date).toISOString(),
    raw: r,
  };
}

function normalizeCanary(r: DbRecord): UnifiedLogEntry {
  const label = safeText(r.label) || "canary";
  const detected = Boolean(r.detected);
  const detectedOn = safeText(r.detectedOn) || "external";
  if (detected) {
    return {
      id: safeText(r.id),
      source: "canary",
      type: "exfiltration",
      severity: "critical",
      title: `Canary "${label}" triggered on ${detectedOn}`,
      description: `Canary value ${safeText(r.canaryValue)} was accessed/exfiltrated via ${safeText(r.injectedEndpoint)}`,
      ipAddress: null,
      timestamp: r.detectedAt ? (r.detectedAt as Date).toISOString() : (r.createdAt as Date).toISOString(),
      raw: r,
    };
  }
  return {
    id: safeText(r.id),
    source: "canary",
    type: "deployed",
    severity: "info",
    title: `Canary "${label}" deployed`,
    description: `Type=${safeText(r.canaryType)} endpoint=${safeText(r.injectedEndpoint)} active=${r.isActive ? "yes" : "no"}`,
    ipAddress: null,
    timestamp: (r.createdAt as Date).toISOString(),
    raw: r,
  };
}

function normalizeIncidentEvent(r: DbRecord): UnifiedLogEntry {
  const severity = (safeText(r.severity) || "info") as SiemSeverity;
  return {
    id: safeText(r.id),
    source: "incident",
    type: safeText(r.eventType) || "event",
    severity,
    title: safeText(r.title) || "Incident event",
    description: safeText(r.description) || "",
    ipAddress: null,
    timestamp: r.occurredAt ? (r.occurredAt as Date).toISOString() : (r.createdAt as Date).toISOString(),
    raw: r,
  };
}

function normalizeFinding(r: DbRecord): UnifiedLogEntry {
  const severity = (safeText(r.severity) || "medium") as SiemSeverity;
  const title = safeText(r.title) || "Finding";
  const category = safeText(r.category) || "general";
  const endpoint = safeText(r.endpoint) || "-";
  const method = safeText(r.method) || "GET";
  return {
    id: safeText(r.id),
    source: "finding",
    type: category,
    severity,
    title,
    description: `${method} ${endpoint} - ${safeText(r.description).slice(0, 160)}`,
    ipAddress: null,
    timestamp: (r.createdAt as Date).toISOString(),
    raw: r,
  };
}

function normalizePatch(r: DbRecord): UnifiedLogEntry {
  const severity = (safeText(r.severity) || "medium") as SiemSeverity;
  const title = safeText(r.title) || "Patch";
  const cve = safeText(r.cve);
  const file = safeText(r.affectedFile) || "-";
  return {
    id: safeText(r.id),
    source: "patch",
    type: severity,
    severity,
    title,
    description: `${cve ? `[${cve}] ` : ""}${file} - ${safeText(r.aiExplanation).slice(0, 160)}`,
    ipAddress: null,
    timestamp: (r.createdAt as Date).toISOString(),
    raw: r,
  };
}

// ── Source-specific DB queries ────────────────────────────────────────────
//
// Each function builds the Prisma-style where clause for its source and
// returns the normalized entries. The DB proxy supports `gte`/`lte` on
// date columns and `eq` on ipAddress, so we push those filters down where
// possible.

function whereForTime(
  startIso: string | null,
  endIso: string | null,
  dateField: string
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (startIso || endIso) {
    const range: Record<string, unknown> = {};
    if (startIso) range.gte = startIso;
    if (endIso) range.lte = endIso;
    where[dateField] = range;
  }
  return where;
}

async function searchAuditLog(
  startIso: string | null,
  endIso: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const records = (await db.auditLog.findMany({
      where: whereForTime(startIso, endIso, "createdAt"),
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeAuditLog);
  } catch {
    return [];
  }
}

async function searchApiAccessLog(
  startIso: string | null,
  endIso: string | null,
  ipAddress: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const where: Record<string, unknown> = {
      ...whereForTime(startIso, endIso, "timestamp"),
    };
    if (ipAddress) where.ipAddress = ipAddress;
    const records = (await db.apiAccessLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeApiAccessLog);
  } catch {
    return [];
  }
}

async function searchHoneypotHit(
  startIso: string | null,
  endIso: string | null,
  ipAddress: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const where: Record<string, unknown> = {
      ...whereForTime(startIso, endIso, "timestamp"),
    };
    if (ipAddress) where.ipAddress = ipAddress;
    const records = (await db.honeypotHit.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeHoneypotHit);
  } catch {
    return [];
  }
}

async function searchCanary(
  startIso: string | null,
  endIso: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const records = (await db.canary.findMany({
      where: whereForTime(startIso, endIso, "createdAt"),
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeCanary);
  } catch {
    return [];
  }
}

async function searchIncidentEvent(
  startIso: string | null,
  endIso: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const records = (await db.incidentEvent.findMany({
      where: whereForTime(startIso, endIso, "occurredAt"),
      orderBy: { occurredAt: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeIncidentEvent);
  } catch {
    return [];
  }
}

async function searchFinding(
  startIso: string | null,
  endIso: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const records = (await db.finding.findMany({
      where: whereForTime(startIso, endIso, "createdAt"),
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizeFinding);
  } catch {
    return [];
  }
}

async function searchPatch(
  startIso: string | null,
  endIso: string | null
): Promise<UnifiedLogEntry[]> {
  try {
    const records = (await db.patch.findMany({
      where: whereForTime(startIso, endIso, "createdAt"),
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DbRecord[];
    return records.map(normalizePatch);
  } catch {
    return [];
  }
}

// ── Public: unifiedSearch ─────────────────────────────────────────────────

export async function unifiedSearch(
  query: UnifiedSearchQuery = {}
): Promise<UnifiedLogEntry[]> {
  const limit = clampLimit(query.limit);
  const sources = query.sources && query.sources.length > 0 ? query.sources : ALL_SOURCES;
  const startIso = toIso(query.startTime);
  const endIso = toIso(query.endTime);
  const ipAddress = query.ipAddress && query.ipAddress.trim() ? query.ipAddress.trim() : null;

  // Fire all the requested sources in parallel. Each sub-query is wrapped
  // in try/catch internally so a single failing table cannot nuke the whole
  // search.
  const tasks: Promise<UnifiedLogEntry[]>[] = [];
  for (const src of sources) {
    switch (src) {
      case "audit":
        tasks.push(searchAuditLog(startIso, endIso));
        break;
      case "api_access":
        tasks.push(searchApiAccessLog(startIso, endIso, ipAddress));
        break;
      case "honeypot":
        tasks.push(searchHoneypotHit(startIso, endIso, ipAddress));
        break;
      case "canary":
        tasks.push(searchCanary(startIso, endIso));
        break;
      case "incident":
        tasks.push(searchIncidentEvent(startIso, endIso));
        break;
      case "finding":
        tasks.push(searchFinding(startIso, endIso));
        break;
      case "patch":
        tasks.push(searchPatch(startIso, endIso));
        break;
    }
  }

  const results = await Promise.all(tasks);
  const flat = results.flat();

  // Apply the post-fetch filters: query text + severity allow-list + IP
  // allow-list (for sources that don't carry an IP, we keep them when no IP
  // filter is set; if an IP filter IS set we drop entries without an IP).
  const severitySet = query.severities && query.severities.length > 0
    ? new Set(query.severities)
    : null;

  const filtered = flat.filter((entry) => {
    if (!matchesQuery(`${entry.title} ${entry.description}`, query.query)) return false;
    if (severitySet && !severitySet.has(entry.severity)) return false;
    if (ipAddress && entry.ipAddress !== ipAddress) return false;
    return true;
  });

  // Sort newest first and clamp to limit.
  filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return filtered.slice(0, limit);
}

// ── Public: getSiemStats ──────────────────────────────────────────────────
//
// Returns aggregated counts for the dashboard. timeRange is a short string
// like "24h", "7d", "30d" - we translate it to start/end ISO.

export function parseTimeRange(range: string): { startIso: string; endIso: string } {
  const end = new Date();
  const start = new Date(end.getTime());
  const m = /^(\d+)([hdw])$/.exec(range.toLowerCase().trim());
  if (m) {
    const n = parseInt(m[1], 10);
    if (m[2] === "h") start.setHours(start.getHours() - n);
    else if (m[2] === "d") start.setDate(start.getDate() - n);
    else if (m[2] === "w") start.setDate(start.getDate() - n * 7);
  } else {
    // Default to 24h
    start.setHours(start.getHours() - 24);
  }
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function getSiemStats(timeRange: string = "24h"): Promise<SiemStats> {
  const { startIso, endIso } = parseTimeRange(timeRange);

  // Fetch up to 1000 entries across all sources for stats purposes.
  const entries = await unifiedSearch({
    startTime: startIso,
    endTime: endIso,
    limit: 1000,
  });

  const bySource: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const ipCounts: Map<string, number> = new Map();

  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    if (e.ipAddress) {
      ipCounts.set(e.ipAddress, (ipCounts.get(e.ipAddress) || 0) + 1);
    }
  }

  const topIps = Array.from(ipCounts.entries())
    .map(([ipAddress, count]) => ({ ipAddress, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recentCritical = entries
    .filter((e) => e.severity === "critical" || e.severity === "high")
    .slice(0, 10);

  return {
    timeRange,
    totals: {
      total: entries.length,
      bySource,
      bySeverity,
    },
    topIps,
    recentCritical,
  };
}
