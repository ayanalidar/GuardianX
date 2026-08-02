import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { validateClientApiKey } from "@/app/api/siem/api-key/route";

export const dynamic = "force-dynamic";

// POST /api/siem/ingest - log ingestion endpoint for external forwarders.
//
// Auth: X-Client-Key header (validated against the SIEM API keys stored in
// the Integration table). This route is intentionally NOT behind requireAuth
// so external syslog forwarders / agents can push logs without a JWT.
//
// Body formats supported:
//   1. Single entry:  { source, type, severity, title, description, ipAddress, timestamp }
//   2. Batch:         { entries: [ ... ] }   (max 1000 per call)
//
// Source determines which table the entry lands in:
//   - audit        -> AuditLog
//   - api_access   -> ApiAccessLog
//   - honeypot     -> HoneypotHit
//   - incident     -> IncidentEvent (requires incidentId in `raw`)
//
// Unknown sources are stored in AuditLog with action="siem.ingest_unknown".

interface IngestEntry {
  source?: string;
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  ipAddress?: string;
  timestamp?: string;
  raw?: Record<string, unknown>;
}

export async function POST(req: Request) {
  // 1. Authenticate with X-Client-Key.
  const clientKey = req.headers.get("x-client-key");
  const authInfo = await validateClientApiKey(clientKey);
  if (!authInfo) {
    return NextResponse.json(
      { error: "Invalid or missing X-Client-Key header" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    let entries: IngestEntry[] = [];

    if (Array.isArray(body)) {
      entries = body as IngestEntry[];
    } else if (Array.isArray(body.entries)) {
      entries = body.entries as IngestEntry[];
    } else if (body && typeof body === "object") {
      entries = [body as IngestEntry];
    } else {
      return NextResponse.json(
        { error: "Body must be a single entry, an array, or { entries: [...] }" },
        { status: 400 }
      );
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "No entries provided" }, { status: 400 });
    }
    if (entries.length > 1000) {
      return NextResponse.json(
        { error: "Too many entries (max 1000 per call)" },
        { status: 413 }
      );
    }

    const accepted: string[] = [];
    const rejected: Array<{ index: number; error: string }> = [];
    let acceptedCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        await ingestSingle(entry, authInfo);
        accepted.push(`${i}`);
        acceptedCount++;
      } catch (err) {
        rejected.push({
          index: i,
          error: err instanceof Error ? err.message : "ingest_failed",
        });
      }
    }

    return NextResponse.json({
      clientId: authInfo.clientId,
      accepted: acceptedCount,
      rejected: rejected.length,
      rejectedDetails: rejected.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed" },
      { status: 500 }
    );
  }
}

async function ingestSingle(
  entry: IngestEntry,
  authInfo: { keyId: string; clientId: string; clientName?: string }
): Promise<void> {
  const source = (entry.source || "audit").toLowerCase().trim();
  const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
  if (isNaN(ts.getTime())) throw new Error("invalid timestamp");

  const raw = entry.raw || {};
  const id = randomUUID();

  switch (source) {
    case "audit": {
      await db.auditLog.create({
        data: {
          id,
          action: entry.type || "external.ingest",
          entity: (raw.entity as string) || `client:${authInfo.clientId}`,
          actor: (raw.actor as string) || `siem-key:${authInfo.keyId.slice(0, 8)}`,
          details: JSON.stringify({
            title: entry.title || "",
            description: entry.description || "",
            severity: entry.severity || "info",
            ipAddress: entry.ipAddress || null,
            clientName: authInfo.clientName || null,
            raw,
          }),
          createdAt: ts,
        },
      });
      return;
    }

    case "api_access": {
      await db.apiAccessLog.create({
        data: {
          id,
          targetId: (raw.targetId as string) || null,
          ipAddress: entry.ipAddress || (raw.ipAddress as string) || "0.0.0.0",
          method: entry.type || (raw.method as string) || "GET",
          endpoint: entry.title || (raw.endpoint as string) || "/",
          statusCode: Number(raw.statusCode) || 200,
          userAgent: (raw.userAgent as string) || "siem-forwarder",
          responseSize: Number(raw.responseSize) || 0,
          timestamp: ts,
        },
      });
      return;
    }

    case "honeypot": {
      await db.honeypotHit.create({
        data: {
          id,
          targetId: (raw.targetId as string) || null,
          endpoint: entry.title || (raw.endpoint as string) || "/",
          ipAddress: entry.ipAddress || (raw.ipAddress as string) || "0.0.0.0",
          userAgent: (raw.userAgent as string) || "siem-forwarder",
          method: entry.type || (raw.method as string) || "GET",
          timestamp: ts,
        },
      });
      return;
    }

    case "incident": {
      const incidentId = (raw.incidentId as string) || entry.type;
      if (!incidentId) throw new Error("incident source requires incidentId in raw");
      await db.incidentEvent.create({
        data: {
          id,
          incidentId,
          eventType: entry.type || "external",
          source: "siem_ingest",
          sourceId: authInfo.keyId,
          title: entry.title || "External event",
          description: entry.description || "",
          severity: entry.severity || "info",
          metadata: JSON.stringify({ ipAddress: entry.ipAddress || null, raw, clientName: authInfo.clientName || null }),
          actor: (raw.actor as string) || `siem-key:${authInfo.keyId.slice(0, 8)}`,
          occurredAt: ts,
        },
      });
      return;
    }

    default: {
      // Unknown source -> dump into AuditLog so nothing is lost.
      await db.auditLog.create({
        data: {
          id,
          action: "siem.ingest_unknown",
          entity: source,
          actor: `siem-key:${authInfo.keyId.slice(0, 8)}`,
          details: JSON.stringify({
            source,
            type: entry.type || null,
            severity: entry.severity || "info",
            title: entry.title || "",
            description: entry.description || "",
            ipAddress: entry.ipAddress || null,
            raw,
          }),
          createdAt: ts,
        },
      });
      return;
    }
  }
}
