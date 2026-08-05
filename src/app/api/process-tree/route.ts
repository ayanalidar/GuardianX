import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/process-tree, htop-style process tree of all running services
export async function GET() {
  try {
    const processes: {
      pid: string;
      name: string;
      type: "sast" | "dast" | "patch" | "system";
      status: "running" | "queued" | "idle";
      cpu: number;
      memory: number;
      stage: string;
      client: string;
      target: string;
      startedAt: string;
      duration: string;
    }[] = [];

    // System processes (always running)
    processes.push({
      pid: "sys-1",
      name: "guardianx-engine",
      type: "system",
      status: "running",
      cpu: 2.4,
      memory: 128,
      stage: "HTTP + socket.io relay",
      client: "-",
      target: "port 3003",
      startedAt: new Date(Date.now() - 86400000).toISOString(),
      duration: "24h+",
    });
    processes.push({
      pid: "sys-2",
      name: "supabase-client",
      type: "system",
      status: "running",
      cpu: 0.1,
      memory: 32,
      stage: "HTTPS REST pool",
      client: "-",
      target: "port 443",
      startedAt: new Date(Date.now() - 86400000).toISOString(),
      duration: "24h+",
    });

    // Active SAST scans
    const scans = await db.scan.findMany({
      where: { status: { in: ["queued", "analyzing", "patching", "sandboxing"] } },
      include: { codebase: { select: { name: true, clientId: true } } },
      take: 10,
    });

    for (const s of scans) {
      const cb = s.codebase as Record<string, unknown> | null;
      const clientName = cb?.clientId ? await getClientName(cb.clientId as string) : "Unassigned";
      const elapsed = Date.now() - new Date(s.startedAt as string).getTime();
      processes.push({
        pid: `sast-${(s.id as string).slice(0, 8)}`,
        name: `sast-scan`,
        type: "sast",
        status: s.status === "queued" ? "queued" : "running",
        cpu: s.status === "queued" ? 0 : 45 + Math.random() * 30,
        memory: s.status === "queued" ? 16 : 256 + Math.random() * 128,
        stage: (s.stageLabel as string) || (s.status as string),
        client: clientName,
        target: (cb?.name as string) || "unknown",
        startedAt: (s.startedAt as Date).toISOString(),
        duration: formatDuration(elapsed),
      });
    }

    // Active DAST engagements
    const engagements = await db.engagement.findMany({
      where: { status: { in: ["queued", "crawling", "planning", "attacking", "analyzing"] } },
      include: { target: { select: { name: true, clientId: true, baseUrl: true } } },
      take: 10,
    });

    for (const e of engagements) {
      const tgt = e.target as Record<string, unknown> | null;
      const clientName = tgt?.clientId ? await getClientName(tgt.clientId as string) : "Unassigned";
      const elapsed = Date.now() - new Date(e.startedAt as string).getTime();
      processes.push({
        pid: `dast-${(e.id as string).slice(0, 8)}`,
        name: `dast-engagement`,
        type: "dast",
        status: e.status === "queued" ? "queued" : "running",
        cpu: e.status === "queued" ? 0 : 60 + Math.random() * 25,
        memory: e.status === "queued" ? 16 : 192 + Math.random() * 64,
        stage: (e.stageLabel as string) || (e.status as string),
        client: clientName,
        target: (tgt?.name as string) || "unknown",
        startedAt: (e.startedAt as Date).toISOString(),
        duration: formatDuration(elapsed),
      });
    }

    // Pending patches (waiting for review = idle process)
    const patches = await db.patch.findMany({
      where: { status: "pending" },
      include: { codebase: { select: { name: true, clientId: true } } },
      take: 5,
    });

    for (const p of patches) {
      const cb = p.codebase as Record<string, unknown> | null;
      const clientName = cb?.clientId ? await getClientName(cb.clientId as string) : "Unassigned";
      processes.push({
        pid: `patch-${(p.id as string).slice(0, 8)}`,
        name: `patch-review`,
        type: "patch",
        status: "idle",
        cpu: 0,
        memory: 8,
        stage: `Awaiting approval: ${p.severity}, ${p.title}`,
        client: clientName,
        target: p.patchId as string,
        startedAt: (p.createdAt as Date).toISOString(),
        duration: formatDuration(Date.now() - new Date(p.createdAt as string).getTime()),
      });
    }

    // Sort: running first, then queued, then idle
    const statusOrder = { running: 0, queued: 1, idle: 2 };
    processes.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const totalCpu = processes.reduce((s, p) => s + p.cpu, 0);
    const totalMemory = processes.reduce((s, p) => s + p.memory, 0);

    return NextResponse.json({
      processes,
      summary: {
        total: processes.length,
        running: processes.filter((p) => p.status === "running").length,
        queued: processes.filter((p) => p.status === "queued").length,
        idle: processes.filter((p) => p.status === "idle").length,
        total_cpu: Math.round(totalCpu * 10) / 10,
        total_memory: Math.round(totalMemory),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

async function getClientName(clientId: string): Promise<string> {
  try {
    const c = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
    return (c?.name as string) || "Unassigned";
  } catch {
    return "Unassigned";
  }
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}
