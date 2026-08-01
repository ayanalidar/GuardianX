import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/incidents — list all incidents with event count + evidence count
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (severity && severity !== "all") where.severity = severity;

    const incidents = await db.incident.findMany({
      where,
      orderBy: { detectedAt: "desc" },
    });

    // batch-fetch event + evidence counts in a single pass per record
    const enriched = await Promise.all(
      (incidents || []).map(async (inc: Record<string, unknown>) => {
        const id = inc.id as string;
        const [eventCount, evidenceCount] = await Promise.all([
          db.incidentEvent.count({ where: { incidentId: id } }),
          db.evidence.count({ where: { incidentId: id } }),
        ]);
        return {
          id,
          title: inc.title,
          description: inc.description,
          severity: inc.severity,
          status: inc.status,
          category: inc.category,
          source: inc.source,
          sourceId: inc.sourceId,
          clientId: inc.clientId,
          targetId: inc.targetId,
          assignee: inc.assignee,
          detectedAt: (inc.detectedAt as Date).toISOString(),
          containedAt: inc.containedAt ? (inc.containedAt as Date).toISOString() : null,
          eradicatedAt: inc.eradicatedAt ? (inc.eradicatedAt as Date).toISOString() : null,
          closedAt: inc.closedAt ? (inc.closedAt as Date).toISOString() : null,
          rootCause: inc.rootCause,
          lessonsLearned: inc.lessonsLearned,
          createdAt: (inc.createdAt as Date).toISOString(),
          updatedAt: (inc.updatedAt as Date).toISOString(),
          eventCount,
          evidenceCount,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load incidents" },
      { status: 500 }
    );
  }
}

// POST /api/incidents — create a new incident
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      severity = "medium",
      category = "other",
      source = "manual",
      sourceId,
      clientId,
      targetId,
      assignee,
      rootCause,
      lessonsLearned,
    } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const userName = req.headers.get("x-user-name") || "system";

    const incident = await db.incident.create({
      data: {
        title: title.trim(),
        description: description || null,
        severity,
        status: "open",
        category,
        source,
        sourceId: sourceId || null,
        clientId: clientId || null,
        targetId: targetId || null,
        assignee: assignee || userName,
        rootCause: rootCause || null,
        lessonsLearned: lessonsLearned || null,
      },
    });

    // auto-create a "case opened" timeline event
    await db.incidentEvent.create({
      data: {
        incidentId: incident.id as string,
        eventType: "status_change",
        source: "manual",
        title: "Incident case opened",
        description: `Case opened by ${userName}. Initial severity: ${severity}.`,
        severity,
        actor: userName,
      },
    });

    return NextResponse.json(
      { id: incident.id, title: incident.title, status: incident.status, message: "Incident created" },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create incident" },
      { status: 500 }
    );
  }
}
