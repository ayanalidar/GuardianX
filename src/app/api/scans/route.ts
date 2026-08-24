import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Short timeout, we just create a DB record and fire-and-forget to the engine.
export const maxDuration = 30;

// POST /api/scans, kick off an AI security scan for a codebase.
// Body: { codebaseId: string }
// Returns 202 with { scanId } immediately; the Railway engine runs the
// pipeline in the background and streams events via socket.io.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const codebaseId = typeof body.codebaseId === "string" ? body.codebaseId : "";

  if (!codebaseId)
    return NextResponse.json({ error: "codebaseId required" }, { status: 400 });

  const codebase = await db.codebase.findUnique({ where: { id: codebaseId } });
  if (!codebase)
    return NextResponse.json({ error: "codebase not found" }, { status: 404 });

  // Prevent concurrent scans on the same codebase.
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
      stageLabel: "Queued, waiting for engine…",
    },
  });

  // Fire-and-forget to the Railway engine, it runs the pipeline and
  // writes patches/events to Supabase + broadcasts via socket.io.
  engineFireAndForget("/api/run-sast", { codebaseId, scanId: scan.id });

  return NextResponse.json(
    { scanId: scan.id, status: "queued" },
    { status: 202 }
  );
}

// GET /api/scans, list recent scans.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
      started_at: (s.startedAt as Date).toISOString(),
      completed_at: (s.completedAt as Date | null)?.toISOString() ?? null,
      codebase: s.codebase,
      patch_count: (s._count as { patches: number })?.patches,
    }))
  );
}
