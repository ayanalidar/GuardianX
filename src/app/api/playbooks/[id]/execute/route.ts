import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface PlaybookStep {
  index: number;
  title: string;
  description: string;
  automated: boolean;
}

const safeParse = (s: unknown, fallback: unknown = []): unknown => {
  if (!s || typeof s !== "string") return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

// POST /api/playbooks/[id]/execute - run a playbook against an incident.
// Reads the playbook steps, creates an IncidentEvent per step, marks
// automated steps as "executed" and manual steps as "pending" (awaiting
// human action). Returns the full step roll-out for caller display.
// Body: { incidentId }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { incidentId } = body;

  if (!incidentId || typeof incidentId !== "string") {
    return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
  }

  try {
    const playbook = await db.playbook.findUnique({ where: { id } });
    if (!playbook) {
      return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }
    if (!playbook.isActive) {
      return NextResponse.json(
        { error: "Playbook is inactive and cannot be executed" },
        { status: 400 }
      );
    }

    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, title: true, status: true, severity: true },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
    if (incident.status === "closed") {
      return NextResponse.json(
        { error: "Cannot execute playbook against a closed incident" },
        { status: 400 }
      );
    }

    // Parse + normalize the step list.
    const rawSteps = safeParse(playbook.steps, []) as unknown;
    const steps: PlaybookStep[] = Array.isArray(rawSteps)
      ? (rawSteps as PlaybookStep[]).map((s, idx) => ({
          index: typeof s.index === "number" ? s.index : idx + 1,
          title: typeof s.title === "string" ? s.title : `Step ${idx + 1}`,
          description: typeof s.description === "string" ? s.description : "",
          automated: s.automated === true,
        }))
      : [];

    if (steps.length === 0) {
      return NextResponse.json(
        { error: "Playbook has no steps to execute" },
        { status: 400 }
      );
    }

    const now = new Date();
    const createdEvents: Record<string, unknown>[] = [];

    // Create an IncidentEvent for each step. Automated steps are marked as
    // "executed" (the system would kick off the action); manual steps are
    // marked as "pending" (awaiting human action).
    for (const step of steps) {
      const status = step.automated ? "executed" : "pending";
      const evt = await db.incidentEvent.create({
        data: {
          incidentId,
          eventType: "containment",
          source: "manual",
          sourceId: playbook.id,
          title: `[Playbook ${playbook.name}] Step ${step.index}: ${step.title}`,
          description: step.description,
          severity: playbook.severity as string,
          metadata: JSON.stringify({
            action: "playbook_step",
            playbookId: playbook.id,
            playbookName: playbook.name,
            stepIndex: step.index,
            stepTitle: step.title,
            automated: step.automated,
            status,
            executedBy: auth.user.name,
            executedAt: now.toISOString(),
          }),
          actor: auth.user.name,
          occurredAt: now,
        },
      });
      createdEvents.push(evt);
    }

    // Drop a summary event so the timeline shows the playbook was triggered.
    await db.incidentEvent.create({
      data: {
        incidentId,
        eventType: "note",
        source: "manual",
        sourceId: playbook.id,
        title: `Playbook executed: ${playbook.name}`,
        description: `Playbook "${playbook.name}" executed against incident "${incident.title}" by ${auth.user.name}. ${steps.length} steps (${steps.filter((s) => s.automated).length} automated, ${steps.filter((s) => !s.automated).length} manual).`,
        severity: "info",
        metadata: JSON.stringify({
          action: "playbook_executed",
          playbookId: playbook.id,
          playbookName: playbook.name,
          incidentId,
          stepCount: steps.length,
          automatedCount: steps.filter((s) => s.automated).length,
          manualCount: steps.filter((s) => !s.automated).length,
          actor: auth.user.name,
          actorId: auth.user.userId,
          executedAt: now.toISOString(),
        }),
        actor: auth.user.name,
        occurredAt: now,
      },
    });

    return NextResponse.json({
      message: `Playbook "${playbook.name}" executed against incident "${incident.title}"`,
      playbookId: playbook.id,
      playbookName: playbook.name,
      incidentId,
      incidentTitle: incident.title,
      steps: steps.map((s) => ({
        index: s.index,
        title: s.title,
        description: s.description,
        automated: s.automated,
        status: s.automated ? "executed" : "pending",
        eventId: createdEvents[s.index - 1]?.id || null,
      })),
      totalSteps: steps.length,
      executed: steps.filter((s) => s.automated).length,
      pending: steps.filter((s) => !s.automated).length,
      executedAt: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to execute playbook" },
      { status: 500 }
    );
  }
}
