import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface TimelineEntry {
  timestamp: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  source: string;
  metadata: Record<string, unknown>;
}

const safeParse = (s: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> => {
  if (!s || typeof s !== "string") return fallback;
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return fallback; }
};

// Coerce a DB column value (typed as unknown) into a string for the timeline payload.
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v === null || v === undefined ? fallback : String(v);

const iso = (d: unknown): string | null => {
  if (!d) return null;
  try { return new Date(d as string).toISOString(); } catch { return null; }
};

// GET /api/incidents/[id]/timeline - unified forensic timeline.
// Pulls IncidentEvent records for this incident AND all related security events
// (AuditLog, ApiAccessLog, HoneypotHit, Canary, Finding, Patch) whose timestamps
// fall within the incident's detectedAt -> closedAt window, then merges and sorts
// everything into a single chronological feed.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const incident = await db.incident.findUnique({ where: { id } });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const detectedAt = (incident.detectedAt as Date).toISOString();
    // If the incident is not yet closed, use "now" as the upper bound so the
    // timeline reflects ongoing activity rather than cutting off prematurely.
    const closedAt = incident.closedAt
      ? (incident.closedAt as Date).toISOString()
      : new Date().toISOString();

    const entries: TimelineEntry[] = [];

    // 1. IncidentEvent - the canonical forensic log for this incident.
    try {
      const events = await db.incidentEvent.findMany({
        where: { incidentId: id },
        orderBy: { occurredAt: "asc" },
      });
      for (const e of events) {
        const ts = iso(e.occurredAt) || iso(e.createdAt) || detectedAt;
        entries.push({
          timestamp: ts,
          type: `incident.${str(e.eventType)}`,
          title: str(e.title),
          description: str(e.description),
          severity: str(e.severity, "info"),
          source: str(e.source),
          metadata: { ...safeParse(e.metadata), eventId: e.id, actor: e.actor, sourceId: e.sourceId },
        });
      }
    } catch { /* ignore - table may be empty */ }

    // 2. AuditLog - administrative actions within the incident window.
    try {
      const logs = await db.auditLog.findMany({
        where: { createdAt: { gte: detectedAt, lte: closedAt } },
        orderBy: { createdAt: "asc" },
      });
      for (const a of logs) {
        const ts = iso(a.createdAt) || detectedAt;
        entries.push({
          timestamp: ts,
          type: "audit",
          title: str(a.action),
          description: str(a.details) || `Action ${str(a.action)} on ${str(a.entity) || "system"} by ${str(a.actor)}`,
          severity: "info",
          source: "audit_log",
          metadata: { auditId: a.id, entity: a.entity, actor: a.actor, details: a.details },
        });
      }
    } catch { /* ignore */ }

    // 3. ApiAccessLog - HTTP access within the incident window (filtered to
    //    the incident's targetId if one is set, so the feed stays relevant).
    try {
      const apiWhere: Record<string, unknown> = {
        timestamp: { gte: detectedAt, lte: closedAt },
      };
      if (incident.targetId) apiWhere.targetId = incident.targetId;
      const accessLogs = await db.apiAccessLog.findMany({
        where: apiWhere,
        orderBy: { timestamp: "asc" },
        take: 500,
      });
      for (const a of accessLogs) {
        const ts = iso(a.timestamp) || detectedAt;
        const status = Number(a.statusCode) || 0;
        const isSuspect = status >= 400 || status === 0;
        entries.push({
          timestamp: ts,
          type: "api_access",
          title: `${str(a.method)} ${str(a.endpoint)} -> ${status}`,
          description: `Request from ${str(a.ipAddress)} (${str(a.userAgent) || "no UA"}) returned ${status}, ${Number(a.responseSize) || 0} bytes.`,
          severity: isSuspect ? "warning" : "info",
          source: "api_log",
          metadata: {
            logId: a.id,
            targetId: a.targetId,
            ipAddress: a.ipAddress,
            method: a.method,
            endpoint: a.endpoint,
            statusCode: status,
            userAgent: a.userAgent,
            responseSize: Number(a.responseSize) || 0,
          },
        });
      }
    } catch { /* ignore */ }

    // 4. HoneypotHit - unauthorized access to decoy endpoints within the window.
    try {
      const hpWhere: Record<string, unknown> = {
        timestamp: { gte: detectedAt, lte: closedAt },
      };
      if (incident.targetId) hpWhere.targetId = incident.targetId;
      const hits = await db.honeypotHit.findMany({
        where: hpWhere,
        orderBy: { timestamp: "asc" },
        take: 500,
      });
      for (const h of hits) {
        const ts = iso(h.timestamp) || detectedAt;
        entries.push({
          timestamp: ts,
          type: "honeypot",
          title: `Honeypot hit on ${str(h.endpoint)}`,
          description: `Unauthorized ${str(h.method)} request to honeypot endpoint ${str(h.endpoint)} from ${str(h.ipAddress)}.`,
          severity: "high",
          source: "honeypot",
          metadata: {
            hitId: h.id,
            targetId: h.targetId,
            endpoint: h.endpoint,
            ipAddress: h.ipAddress,
            userAgent: h.userAgent,
            method: h.method,
          },
        });
      }
    } catch { /* ignore */ }

    // 5. Canary - triggered canary tokens (data exfiltration evidence).
    try {
      const canaryWhere: Record<string, unknown> = {
        detected: true,
        detectedAt: { gte: detectedAt, lte: closedAt },
      };
      if (incident.targetId) canaryWhere.targetId = incident.targetId;
      const triggered = await db.canary.findMany({
        where: canaryWhere,
        orderBy: { detectedAt: "asc" },
      });
      for (const c of triggered) {
        const ts = iso(c.detectedAt) || detectedAt;
        entries.push({
          timestamp: ts,
          type: "canary",
          title: `Canary "${str(c.label)}" triggered`,
          description: `Canary token of type ${str(c.canaryType)} was triggered${c.detectedOn ? ` on ${str(c.detectedOn)}` : ""}, indicating data exfiltration.`,
          severity: "critical",
          source: "canary",
          metadata: {
            canaryId: c.id,
            label: c.label,
            canaryType: c.canaryType,
            canaryValue: c.canaryValue,
            injectedEndpoint: c.injectedEndpoint,
            detectedOn: c.detectedOn,
            targetId: c.targetId,
          },
        });
      }
    } catch { /* ignore */ }

    // 6. Finding - vulnerability findings within the incident window.
    try {
      const findings = await db.finding.findMany({
        where: { createdAt: { gte: detectedAt, lte: closedAt } },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      for (const f of findings) {
        const ts = iso(f.createdAt) || detectedAt;
        const sev = str(f.severity, "info");
        entries.push({
          timestamp: ts,
          type: "finding",
          title: str(f.title),
          description: `${str(f.category)} on ${str(f.method)} ${str(f.endpoint)}: ${str(f.description)}`,
          severity: sev,
          source: "finding",
          metadata: {
            findingId: f.id,
            engagementId: f.engagementId,
            category: f.category,
            owasp: f.owasp,
            endpoint: f.endpoint,
            method: f.method,
            confidence: f.confidence,
          },
        });
      }
    } catch { /* ignore */ }

    // 7. Patch - patch lifecycle events within the incident window.
    try {
      const patches = await db.patch.findMany({
        where: { createdAt: { gte: detectedAt, lte: closedAt } },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      for (const p of patches) {
        const ts = iso(p.createdAt) || detectedAt;
        const sev = str(p.severity, "info");
        entries.push({
          timestamp: ts,
          type: "patch",
          title: `Patch ${str(p.patchId)}: ${str(p.title)}`,
          description: `Patch for ${str(p.affectedFile)} (status: ${str(p.status)}, severity: ${str(p.severity)}).`,
          severity: sev,
          source: "patch",
          metadata: {
            patchId: p.id,
            patchSlug: p.patchId,
            codebaseId: p.codebaseId,
            scanId: p.scanId,
            status: p.status,
            cve: p.cve,
            affectedFile: p.affectedFile,
            sandboxPassed: p.sandboxPassed,
            approvedAt: iso(p.approvedAt),
          },
        });
      }
    } catch { /* ignore */ }

    // Final merge + chronological sort. Stable sort preserves insertion order
    // for entries with identical timestamps.
    entries.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta - tb;
    });

    return NextResponse.json({
      incidentId: id,
      incidentTitle: incident.title,
      incidentStatus: incident.status,
      window: { detectedAt, closedAt },
      count: entries.length,
      timeline: entries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build timeline" },
      { status: 500 }
    );
  }
}
