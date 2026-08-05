import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/threat-hunter, autonomous 24/7 agent that proactively scans
// all authorized clients for new vulnerabilities.
// In production, this would be called by a cron job every hour.
export async function POST() {
  try {
    const triggered: { client: string; codebase: string; scanId: string }[] = [];
    const engagements: { client: string; target: string; engagementId: string }[] = [];

    // Find all authorized clients with codebases that haven't been scanned in 24h
    const clients = await db.client.findMany({
      where: { authorized: true },
      select: { id: true, name: true },
    });

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

    for (const c of clients) {
      // Find codebases not scanned recently
      const codebases = await db.codebase.findMany({
        where: { clientId: c.id },
        select: { id: true, name: true },
      });

      for (const cb of codebases) {
        // Check for recent scans
        const recentScans = await db.scan.findMany({
          where: { codebaseId: cb.id, startedAt: { gte: oneDayAgo } },
          select: { id: true },
        });

        if (recentScans.length === 0) {
          // No recent scan, trigger one
          const scan = await db.scan.create({
            data: {
              codebaseId: cb.id,
              status: "queued",
              stageLabel: "Threat Hunter: autonomous scan",
            },
          });
          engineFireAndForget("/api/run-sast", { codebaseId: cb.id, scanId: scan.id });
          triggered.push({ client: c.name as string, codebase: cb.name as string, scanId: scan.id as string });
        }
      }

      // Find targets not tested recently
      const targets = await db.target.findMany({
        where: { clientId: c.id, authorized: true },
        select: { id: true, name: true },
      });

      for (const t of targets) {
        const recentEngs = await db.engagement.findMany({
          where: { targetId: t.id, startedAt: { gte: oneDayAgo } },
          select: { id: true },
        });

        if (recentEngs.length === 0) {
          const eng = await db.engagement.create({
            data: {
              targetId: t.id,
              status: "queued",
              stageLabel: "Threat Hunter: autonomous DAST",
            },
          });
          engineFireAndForget("/api/run-dast", { targetId: t.id, engagementId: eng.id });
          engagements.push({ client: c.name as string, target: t.name as string, engagementId: eng.id as string });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sast_scans_triggered: triggered,
      dast_engagements_triggered: engagements,
      summary: {
        scans_started: triggered.length,
        engagements_started: engagements.length,
        clients_checked: clients.length,
      },
      message: `Threat Hunter: triggered ${triggered.length} SAST scans + ${engagements.length} DAST engagements across ${clients.length} clients.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET /api/threat-hunter, returns what the hunter would do (dry run)
export async function GET() {
  try {
    const stale: { client: string; asset: string; type: string; lastScan: string | null }[] = [];

    const clients = await db.client.findMany({
      where: { authorized: true },
      select: { id: true, name: true },
    });

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true, name: true } });
      for (const cb of codebases) {
        const recentScans = await db.scan.findMany({
          where: { codebaseId: cb.id, startedAt: { gte: oneDayAgo } },
          select: { id: true, startedAt: true },
          orderBy: { startedAt: "desc" },
        });
        if (recentScans.length === 0) {
          const lastScan = await db.scan.findFirst({
            where: { codebaseId: cb.id },
            select: { startedAt: true },
            orderBy: { startedAt: "desc" },
          });
          stale.push({
            client: c.name as string,
            asset: cb.name as string,
            type: "SAST",
            lastScan: lastScan ? (lastScan.startedAt as Date).toISOString() : null,
          });
        }
      }

      const targets = await db.target.findMany({ where: { clientId: c.id, authorized: true }, select: { id: true, name: true } });
      for (const t of targets) {
        const recentEngs = await db.engagement.findMany({
          where: { targetId: t.id, startedAt: { gte: oneDayAgo } },
          select: { id: true },
        });
        if (recentEngs.length === 0) {
          stale.push({ client: c.name as string, asset: t.name as string, type: "DAST", lastScan: null });
        }
      }
    }

    return NextResponse.json({
      stale_assets: stale,
      count: stale.length,
      clients_checked: clients.length,
    });
  } catch {
    return NextResponse.json({ stale_assets: [], count: 0 });
  }
}
