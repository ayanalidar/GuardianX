import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_SEVERITIES = ["low", "medium", "high", "critical", "info"];

// POST /api/incidents/[id]/events - add a manual note / observation to the
// incident timeline. The actor is sourced from the x-user-name header set by
// the auth middleware so attribution is always correct.
// Body: { title, description, severity }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, description, severity } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const finalSeverity = VALID_SEVERITIES.includes(severity) ? severity : "info";

  // Prefer the middleware-injected x-user-name header for the actor; fall back
  // to the JWT name claim, then to "system" if neither is present.
  const actor =
    (req.headers.get("x-user-name") as string | null) ||
    auth.user.name ||
    "system";

  try {
    const incident = await db.incident.findUnique({
      where: { id },
      select: { id: true, title: true, severity: true, status: true },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const now = new Date();
    const event = await db.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "note",
        source: "manual",
        title,
        description: typeof description === "string" ? description : null,
        severity: finalSeverity,
        metadata: JSON.stringify({
          action: "manual_note",
          author: actor,
          authorId: auth.user.userId,
          addedAt: now.toISOString(),
        }),
        actor,
        occurredAt: now,
      },
    });

    return NextResponse.json(
      {
        id: event.id,
        incidentId: id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        severity: event.severity,
        actor: event.actor,
        occurredAt: (event.occurredAt as Date).toISOString(),
        message: "Timeline note added",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add timeline event" },
      { status: 500 }
    );
  }
}
