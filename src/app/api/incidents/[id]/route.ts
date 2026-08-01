import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["open", "investigating", "contained", "eradicated", "closed"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

// GET /api/incidents/[id] - full incident detail with events + evidence included.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const incident = await db.incident.findUnique({
      where: { id },
      include: {
        events: {
          select: {
            id: true,
            incidentId: true,
            eventType: true,
            source: true,
            sourceId: true,
            title: true,
            description: true,
            severity: true,
            metadata: true,
            actor: true,
            occurredAt: true,
            createdAt: true,
          },
        },
        evidence: {
          select: {
            id: true,
            incidentId: true,
            evidenceType: true,
            filename: true,
            sha256: true,
            collectedBy: true,
            collectedAt: true,
            description: true,
            storagePath: true,
            fileSize: true,
            chainOfCustody: true,
            isImmutable: true,
            createdAt: true,
          },
        },
      },
    });

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const safeParse = (s: unknown): unknown => {
      if (!s || typeof s !== "string") return s;
      try { return JSON.parse(s); } catch { return s; }
    };

    return NextResponse.json({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      category: incident.category,
      source: incident.source,
      sourceId: incident.sourceId,
      clientId: incident.clientId,
      targetId: incident.targetId,
      assignee: incident.assignee,
      detectedAt: (incident.detectedAt as Date).toISOString(),
      containedAt: incident.containedAt ? (incident.containedAt as Date).toISOString() : null,
      eradicatedAt: incident.eradicatedAt ? (incident.eradicatedAt as Date).toISOString() : null,
      closedAt: incident.closedAt ? (incident.closedAt as Date).toISOString() : null,
      rootCause: incident.rootCause,
      lessonsLearned: incident.lessonsLearned,
      createdAt: (incident.createdAt as Date).toISOString(),
      updatedAt: (incident.updatedAt as Date).toISOString(),
      events: ((incident.events as Record<string, unknown>[]) || [])
        .slice()
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime()
        )
        .map((e: Record<string, unknown>) => ({
          id: e.id,
          eventType: e.eventType,
          source: e.source,
          sourceId: e.sourceId,
          title: e.title,
          description: e.description,
          severity: e.severity,
          metadata: safeParse(e.metadata),
          actor: e.actor,
          occurredAt: (e.occurredAt as Date).toISOString(),
          createdAt: (e.createdAt as Date).toISOString(),
        })),
      evidence: ((incident.evidence as Record<string, unknown>[]) || []).map((ev: Record<string, unknown>) => ({
        id: ev.id,
        evidenceType: ev.evidenceType,
        filename: ev.filename,
        sha256: ev.sha256,
        collectedBy: ev.collectedBy,
        collectedAt: (ev.collectedAt as Date).toISOString(),
        description: ev.description,
        storagePath: ev.storagePath,
        fileSize: ev.fileSize,
        chainOfCustody: safeParse(ev.chainOfCustody),
        isImmutable: ev.isImmutable,
        createdAt: (ev.createdAt as Date).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load incident" },
      { status: 500 }
    );
  }
}

// PATCH /api/incidents/[id] - update status / severity / assignee / rootCause / lessonsLearned.
// When status changes to contained/eradicated/closed, set the corresponding *At timestamp.
// Auto-create an IncidentEvent recording every status change so the audit trail is intact.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const existing = await db.incident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.severity === "string" && VALID_SEVERITIES.includes(body.severity)) {
      data.severity = body.severity;
    }
    if (typeof body.assignee === "string") data.assignee = body.assignee || null;
    if (typeof body.rootCause === "string") data.rootCause = body.rootCause;
    if (typeof body.lessonsLearned === "string") data.lessonsLearned = body.lessonsLearned;
    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.description === "string") data.description = body.description;
    if (typeof body.category === "string") data.category = body.category;
    if (typeof body.assignee !== "undefined" && body.assignee === null) data.assignee = null;

    const prevStatus = existing.status as string;
    const statusChanged =
      typeof body.status === "string" &&
      VALID_STATUSES.includes(body.status) &&
      body.status !== prevStatus;

    if (statusChanged) {
      data.status = body.status;
      const now = new Date();
      if (body.status === "contained") data.containedAt = now;
      if (body.status === "eradicated") {
        data.eradicatedAt = now;
        // Cannot eradicate before containment; ensure containedAt is set.
        if (!existing.containedAt) data.containedAt = now;
      }
      if (body.status === "closed") {
        data.closedAt = now;
        if (!existing.containedAt) data.containedAt = now;
        if (!existing.eradicatedAt) data.eradicatedAt = now;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.incident.update({ where: { id }, data });

    // Auto-create an IncidentEvent recording the status change for audit.
    if (statusChanged) {
      await db.incidentEvent.create({
        data: {
          incidentId: id,
          eventType: "status_change",
          source: "manual",
          title: `Status changed: ${prevStatus} -> ${body.status}`,
          description: `Incident status transitioned from ${prevStatus} to ${body.status} by ${auth.user.name}.`,
          severity: updated.severity as string,
          metadata: JSON.stringify({
            from: prevStatus,
            to: body.status,
            actor: auth.user.name,
            actorId: auth.user.userId,
            timestamp: new Date().toISOString(),
          }),
          actor: auth.user.name,
          occurredAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      severity: updated.severity,
      status: updated.status,
      assignee: updated.assignee,
      containedAt: updated.containedAt ? (updated.containedAt as Date).toISOString() : null,
      eradicatedAt: updated.eradicatedAt ? (updated.eradicatedAt as Date).toISOString() : null,
      closedAt: updated.closedAt ? (updated.closedAt as Date).toISOString() : null,
      message: statusChanged
        ? `Incident status updated to ${body.status}`
        : "Incident updated",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update incident" },
      { status: 500 }
    );
  }
}
