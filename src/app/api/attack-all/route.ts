import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/attack-all — launches SAST + DAST simultaneously across ALL authorized clients
export async function POST() {
  try {
    const triggered: { client: string; type: string; target: string; id: string }[] = [];

    const clients = await db.client.findMany({
      where: { authorized: true },
      select: { id: true, name: true },
    });

    for (const c of clients) {
      // Trigger SAST on all codebases
      const codebases = await db.codebase.findMany({
        where: { clientId: c.id },
        select: { id: true, name: true },
      });

      for (const cb of codebases) {
        // Check no scan already running
        const running = await db.scan.findFirst({
          where: { codebaseId: cb.id, status: { in: ["queued", "analyzing", "patching", "sandboxing"] } },
        });
        if (running) continue;

        const scan = await db.scan.create({
          data: { codebaseId: cb.id, status: "queued", stageLabel: "Attack All: SAST scan" },
        });
        engineFireAndForget("/api/run-sast", { codebaseId: cb.id, scanId: scan.id });
        triggered.push({ client: c.name, type: "SAST", target: cb.name, id: scan.id });
      }

      // Trigger DAST on all targets
      const targets = await db.target.findMany({
        where: { clientId: c.id, authorized: true },
        select: { id: true, name: true },
      });

      for (const t of targets) {
        const running = await db.engagement.findFirst({
          where: { targetId: t.id, status: { in: ["queued", "crawling", "planning", "attacking", "analyzing"] } },
        });
        if (running) continue;

        const eng = await db.engagement.create({
          data: { targetId: t.id, status: "queued", stageLabel: "Attack All: DAST VAPT" },
        });
        engineFireAndForget("/api/run-dast", { targetId: t.id, engagementId: eng.id });
        triggered.push({ client: c.name, type: "DAST", target: t.name, id: eng.id });
      }
    }

    return NextResponse.json({
      ok: true,
      triggered,
      summary: {
        total_attacks: triggered.length,
        sast_scans: triggered.filter((t) => t.type === "SAST").length,
        dast_engagements: triggered.filter((t) => t.type === "DAST").length,
        clients: clients.length,
      },
      message: `Attack All: launched ${triggered.length} operations across ${clients.length} clients.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
