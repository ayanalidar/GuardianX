import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/engagements, start a RedAgent VAPT engagement against a target.
// Body: { targetId: string }
// Returns 202 with { engagementId } immediately; the Railway engine runs
// the DAST pipeline and streams events via socket.io.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.targetId === "string" ? body.targetId : "";

  if (!targetId)
    return NextResponse.json({ error: "targetId required" }, { status: 400 });

  const target = await db.target.findUnique({ where: { id: targetId } });
  if (!target)
    return NextResponse.json({ error: "target not found" }, { status: 404 });

  if (!target.authorized) {
    return NextResponse.json(
      {
        error: "Target is not authorized. You must confirm authorization before testing.",
      },
      { status: 403 }
    );
  }

  // Prevent concurrent engagements on the same target
  const running = await db.engagement.findFirst({
    where: {
      targetId,
      status: { in: ["queued", "crawling", "planning", "attacking", "analyzing"] },
    },
  });
  if (running) {
    return NextResponse.json(
      {
        error: "An engagement is already running for this target.",
        engagementId: running.id,
      },
      { status: 409 }
    );
  }

  const engagement = await db.engagement.create({
    data: { targetId: target.id, status: "queued", stageLabel: "Queued" },
  });

  // Fire-and-forget to the Railway engine.
  engineFireAndForget("/api/run-dast", { targetId, engagementId: engagement.id });

  return NextResponse.json(
    { engagementId: engagement.id, status: "queued" },
    { status: 202 }
  );
}

// GET /api/engagements, list recent engagements.
export async function GET() {
  const engagements = await db.engagement.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      target: { select: { name: true, baseUrl: true } },
      _count: { select: { findings: true } },
    },
  });
  return NextResponse.json(
    engagements.map((e) => ({
      id: e.id,
      status: e.status,
      stage_label: e.stageLabel,
      started_at: (e.startedAt as Date).toISOString(),
      completed_at: (e.completedAt as Date | null)?.toISOString() ?? null,
      target: e.target,
      finding_count: (e._count as { findings: number })?.findings,
    }))
  );
}
