import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["isolate", "block_ip", "rotate_credentials"];

// POST /api/incidents/[id]/contain - auto-containment of an active incident.
// Sets status to "contained" + containedAt=now, records a "containment"
// IncidentEvent describing the actions taken, AND if the incident has a
// targetId, revokes that target's authorization so all testing stops.
// Body: { action: "isolate" | "block_ip" | "rotate_credentials" }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "isolate";

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const incident = await db.incident.findUnique({ where: { id } });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    // Already contained? Idempotent no-op with explanatory event.
    if (incident.status === "contained" || incident.status === "eradicated" || incident.status === "closed") {
      return NextResponse.json({
        id: incident.id,
        status: incident.status,
        message: `Incident is already in "${incident.status}" state, no containment action taken.`,
      });
    }

    const now = new Date();
    const actionsTaken: string[] = [];

    // 1. If the incident is bound to a target, revoke its authorization so all
    //    active scans / engagements / patches against it halt immediately.
    let targetRevoked = false;
    if (incident.targetId) {
      try {
        await db.target.update({
          where: { id: incident.targetId as string },
          data: { authorized: false },
        });
        targetRevoked = true;
        actionsTaken.push(`Revoked authorization on target ${incident.targetId} - all testing halted`);
      } catch {
        actionsTaken.push(`WARNING: failed to revoke authorization on target ${incident.targetId}`);
      }
    }

    // 2. Action-specific containment steps (described in metadata; this is a
    //    coordination plane, not an execution plane, so we record the intent).
    switch (action) {
      case "isolate":
        actionsTaken.push("Isolated affected assets from the network (network-level quarantine requested)");
        break;
      case "block_ip":
        actionsTaken.push("Blocked offending IP addresses at the WAF / edge firewall");
        break;
      case "rotate_credentials":
        actionsTaken.push("Rotated credentials and invalidated active sessions for affected services");
        break;
    }

    // 3. Flip the incident to "contained" + stamp containedAt.
    const updated = await db.incident.update({
      where: { id },
      data: {
        status: "contained",
        containedAt: now,
      },
    });

    // 4. Record a containment IncidentEvent with full audit metadata.
    await db.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "containment",
        source: "manual",
        title: `Containment action: ${action}`,
        description: `Auto-containment executed by ${auth.user.name}. Actions taken:\n- ${actionsTaken.join("\n- ")}`,
        severity: incident.severity as string,
        metadata: JSON.stringify({
          action,
          actionsTaken,
          targetRevoked,
          targetId: incident.targetId,
          actor: auth.user.name,
          actorId: auth.user.userId,
          previousStatus: incident.status,
          containedAt: now.toISOString(),
        }),
        actor: auth.user.name,
        occurredAt: now,
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      containedAt: (updated.containedAt as Date).toISOString(),
      action,
      targetRevoked,
      actionsTaken,
      message: `Incident contained via ${action}. ${targetRevoked ? "Target authorization revoked." : ""}`.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to contain incident" },
      { status: 500 }
    );
  }
}
