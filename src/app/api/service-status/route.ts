import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/service-status, returns all currently running services
// Shows live status chips for the Command Center
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const running: { id: string; type: string; client: string; target: string; status: string; stage: string | null; started: string; duration: string }[] = [];

    // Active SAST scans
    const scans = await db.scan.findMany({
      where: { status: { in: ["queued", "analyzing", "patching", "sandboxing"] } },
      include: { codebase: { select: { name: true, clientId: true } } },
      take: 20,
    });

    for (const s of scans) {
      const cb = s.codebase as Record<string, unknown> | null;
      const clientName = cb?.clientId ? await getClientName(cb.clientId as string) : "Unassigned";
      const elapsed = Date.now() - new Date(s.startedAt as string).getTime();
      running.push({
        id: s.id as string,
        type: "SAST",
        client: clientName,
        target: (cb?.name as string) || "unknown",
        status: s.status as string,
        stage: s.stageLabel as string | null,
        started: (s.startedAt as Date).toISOString(),
        duration: formatDuration(elapsed),
      });
    }

    // Active DAST engagements
    const engagements = await db.engagement.findMany({
      where: { status: { in: ["queued", "crawling", "planning", "attacking", "analyzing"] } },
      include: { target: { select: { name: true, clientId: true } } },
      take: 20,
    });

    for (const e of engagements) {
      const tgt = e.target as Record<string, unknown> | null;
      const clientName = tgt?.clientId ? await getClientName(tgt.clientId as string) : "Unassigned";
      const elapsed = Date.now() - new Date(e.startedAt as string).getTime();
      running.push({
        id: e.id as string,
        type: "DAST",
        client: clientName,
        target: (tgt?.name as string) || "unknown",
        status: e.status as string,
        stage: e.stageLabel as string | null,
        started: (e.startedAt as Date).toISOString(),
        duration: formatDuration(elapsed),
      });
    }

    // Pending patches (need review)
    let pendingCount = 0;
    const codebases = await db.codebase.findMany({ select: { id: true } });
    for (const cb of codebases) {
      const patches = await db.patch.findMany({ where: { codebaseId: cb.id, status: "pending" }, select: { id: true } });
      pendingCount += patches.length;
    }

    return NextResponse.json({
      running,
      pending_patches: pendingCount,
      total_active: running.length,
      summary: {
        sast_running: running.filter((r) => r.type === "SAST").length,
        dast_running: running.filter((r) => r.type === "DAST").length,
        pending_review: pendingCount,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

async function getClientName(clientId: string): Promise<string> {
  try {
    const c = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
    return c?.name || "Unassigned";
  } catch {
    return "Unassigned";
  }
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}
