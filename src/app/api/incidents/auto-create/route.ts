import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomUUID, sha1hex } from "@/lib/crypto";

export const dynamic = "force-dynamic";

interface Anomaly {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  client?: string;
}

// Map anomaly severity onto the Incident severity enum.
function severityForAnomaly(s: string): string {
  if (s === "critical") return "critical";
  if (s === "warning") return "high";
  return "low";
}

// Map anomaly title onto an Incident category.
function categoryForAnomaly(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("canary") || t.includes("exfiltration")) return "data_exfiltration";
  if (t.includes("honeypot") || t.includes("unauthorized")) return "intrusion";
  if (t.includes("malware") || t.includes("ransomware")) return "malware";
  if (t.includes("patch") || t.includes("review bottleneck")) return "misconfiguration";
  return "other";
}

// POST /api/incidents/auto-create - cron / anomaly-detection hook.
// Pulls critical anomalies from /api/anomaly-detection, and for each one that
// does not already have a matching open incident, auto-creates one with
// source="anomaly" and an initial IncidentEvent linking back to the anomaly.
// Returns { created: N, incidents: [...] }.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    // 1. Fetch the latest anomaly detection results from ourselves.
    // Server-to-server fetch uses localhost:3000 (same as full-vapt pipeline).
    const anomalyRes = await fetch("http://localhost:3000/api/anomaly-detection", {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    if (!anomalyRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch anomalies: ${anomalyRes.status} ${anomalyRes.statusText}` },
        { status: 502 }
      );
    }

    const anomalyPayload = (await anomalyRes.json()) as { anomalies?: Anomaly[] };
    const anomalies = Array.isArray(anomalyPayload.anomalies) ? anomalyPayload.anomalies : [];

    // 2. Only act on critical and warning anomalies; info ones are too noisy
    //    to auto-file as incidents.
    const actionable = anomalies.filter(
      (a) => a && (a.severity === "critical" || a.severity === "warning") && a.title
    );

    if (actionable.length === 0) {
      return NextResponse.json({
        created: 0,
        incidents: [],
        message: "No actionable anomalies detected - no incidents auto-created.",
      });
    }

    // 3. Resolve any client names supplied by the anomaly detector to client IDs.
    const clientNameToId: Record<string, string> = {};
    try {
      const clients = await db.client.findMany({ select: { id: true, name: true } });
      for (const c of clients) clientNameToId[(c.name as string).toLowerCase()] = c.id as string;
    } catch { /* ignore */ }

    const created: Record<string, unknown>[] = [];
    let createdCount = 0;

    for (const anomaly of actionable) {
      // 4. Deduplicate: synthesize a stable sourceId from the anomaly title so
      //    repeated runs do not file the same incident twice. We only skip if
      //    there is still an OPEN-ish incident for this sourceId.
      const sourceId = (await sha1hex(anomaly.title)).substring(0, 16);

      let existing: Record<string, unknown> | null = null;
      try {
        existing = await db.incident.findFirst({
          where: {
            source: "anomaly",
            sourceId,
            status: { not: "closed" },
          },
          select: { id: true, status: true, title: true },
        });
      } catch { /* ignore - treat as not found */ }

      if (existing) {
        continue; // already tracked
      }

      const severity = severityForAnomaly(anomaly.severity);
      const category = categoryForAnomaly(anomaly.title);
      const clientId = anomaly.client ? clientNameToId[anomaly.client.toLowerCase()] || null : null;
      const incidentId = randomUUID();
      const now = new Date();

      try {
        const incident = await db.incident.create({
          data: {
            id: incidentId,
            title: `[AUTO] ${anomaly.title}`,
            description: anomaly.detail,
            severity,
            status: "open",
            category,
            source: "anomaly",
            sourceId,
            clientId: clientId || null,
            assignee: "auto-responder",
            detectedAt: now,
          },
        });

        // Initial IncidentEvent linking back to the anomaly detector output.
        await db.incidentEvent.create({
          data: {
            incidentId,
            eventType: "anomaly",
            source: "anomaly",
            sourceId,
            title: `Anomaly detected: ${anomaly.title}`,
            description: anomaly.detail,
            severity,
            metadata: JSON.stringify({
              action: "incident_auto_created",
              anomalySeverity: anomaly.severity,
              anomalyTitle: anomaly.title,
              anomalyDetail: anomaly.detail,
              anomalyClient: anomaly.client || null,
              autoCreated: true,
              createdBy: auth.user.name,
              createdAt: now.toISOString(),
            }),
            actor: "anomaly-detector",
            occurredAt: now,
          },
        });

        created.push({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          category: incident.category,
          sourceId,
          clientId: incident.clientId,
        });
        createdCount++;
      } catch {
        // If one incident fails to create, continue with the rest.
      }
    }

    return NextResponse.json({
      created: createdCount,
      scanned: actionable.length,
      incidents: created,
      message:
        createdCount > 0
          ? `Auto-created ${createdCount} incident(s) from actionable anomalies.`
          : "All actionable anomalies already have open incidents - nothing new created.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to auto-create incidents" },
      { status: 500 }
    );
  }
}
