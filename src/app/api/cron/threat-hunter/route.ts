import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/threat-hunter, called by Vercel Cron every hour
// CRON_SECRET env var must be set, the cron job sends it as ?secret=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggered: { client: string; type: string; id: string }[] = [];
    const clients = await db.client.findMany({ where: { authorized: true }, select: { id: true, name: true } });
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true, name: true } });
      for (const cb of codebases) {
        const recentScans = await db.scan.findMany({ where: { codebaseId: cb.id, startedAt: { gte: oneDayAgo } }, select: { id: true } });
        if (recentScans.length === 0) {
          const scan = await db.scan.create({ data: { codebaseId: cb.id, status: "queued", stageLabel: "Threat Hunter: autonomous SAST scan" } });
          engineFireAndForget("/api/run-sast", { codebaseId: cb.id, scanId: scan.id });
          triggered.push({ client: c.name as string, type: "SAST", id: scan.id as string });
        }
      }

      const targets = await db.target.findMany({ where: { clientId: c.id, authorized: true }, select: { id: true, name: true } });
      for (const t of targets) {
        const recentEngs = await db.engagement.findMany({ where: { targetId: t.id, startedAt: { gte: oneDayAgo } }, select: { id: true } });
        if (recentEngs.length === 0) {
          const eng = await db.engagement.create({ data: { targetId: t.id, status: "queued", stageLabel: "Threat Hunter: autonomous DAST VAPT" } });
          engineFireAndForget("/api/run-dast", { targetId: t.id, engagementId: eng.id });
          triggered.push({ client: c.name as string, type: "DAST", id: eng.id as string });
        }
      }
    }

    const { randomUUID } = await import("node:crypto");
    await db.auditLog.create({ data: { id: randomUUID(), action: "threat_hunter_cron", entity: "system", details: JSON.stringify({ triggered: triggered.length, clients: clients.length }) } });

    return NextResponse.json({ ok: true, triggered, summary: { sast: triggered.filter((t) => t.type === "SAST").length, dast: triggered.filter((t) => t.type === "DAST").length, clients: clients.length }, run_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
