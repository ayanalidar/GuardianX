import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runScan } from "@/lib/sentinel/engine/pipeline";
import { broadcast } from "@/lib/sentinel/broadcaster";

export const dynamic = "force-dynamic";
// Allow the pipeline to run long in the background; the route itself returns
// immediately after creating the scan record.
export const maxDuration = 300;

// POST /api/scans — kick off an AI security scan for a codebase.
// Body: { codebaseId: string }
// Returns 202 with { scanId } immediately; the pipeline runs in the background
// and streams events via socket.io.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codebaseId = typeof body.codebaseId === "string" ? body.codebaseId : "";

  if (!codebaseId)
    return NextResponse.json({ error: "codebaseId required" }, { status: 400 });

  const codebase = await db.codebase.findUnique({ where: { id: codebaseId } });
  if (!codebase)
    return NextResponse.json({ error: "codebase not found" }, { status: 404 });

  // Prevent concurrent scans on the same codebase (avoids accidental double
  // triggers and patchId races).
  const running = await db.scan.findFirst({
    where: {
      codebaseId,
      status: { in: ["queued", "analyzing", "patching", "sandboxing"] },
    },
    orderBy: { startedAt: "desc" },
  });
  if (running) {
    return NextResponse.json(
      {
        error: "A scan is already running for this codebase.",
        scanId: running.id,
        status: running.status,
      },
      { status: 409 }
    );
  }

  // Create the scan record up front so the client can subscribe before the
  // pipeline starts emitting.
  const scan = await db.scan.create({
    data: {
      codebaseId: codebase.id,
      status: "queued",
      stageLabel: "Queued — waiting for engine…",
    },
  });

  // Fire-and-forget the pipeline. runScan updates this same scan record.
  // We pass `broadcast` as the emit function so events flow to the relay.
  runScan(codebaseId, scan.id, (e) => {
    void broadcast(e);
  }).catch((err) => {
    console.error("[api/scans] pipeline crashed:", err);
    broadcast({
      scanId: scan.id,
      stage: "failed",
      message: `Pipeline crashed: ${err?.message ?? err}`,
      level: "error",
      ts: new Date().toISOString(),
    }).catch(() => null);
  });

  return NextResponse.json(
    { scanId: scan.id, status: "queued" },
    { status: 202 }
  );
}

// GET /api/scans — list recent scans.
export async function GET() {
  const scans = await db.scan.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      codebase: { select: { name: true, id: true } },
      _count: { select: { patches: true } },
    },
  });
  return NextResponse.json(
    scans.map((s) => ({
      id: s.id,
      status: s.status,
      stage_label: s.stageLabel,
      started_at: s.startedAt.toISOString(),
      completed_at: s.completedAt?.toISOString() ?? null,
      codebase: s.codebase,
      patch_count: s._count.patches,
    }))
  );
}
