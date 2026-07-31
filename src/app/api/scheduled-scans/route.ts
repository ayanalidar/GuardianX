import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runScan } from "@/lib/sentinel/engine/pipeline";
import { broadcast } from "@/lib/sentinel/broadcaster";

export const dynamic = "force-dynamic";

// GET /api/scheduled-scans — list all scheduled scans
export async function GET() {
  const schedules = await db.scheduledScan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(schedules);
}

// POST /api/scheduled-scans — create a scheduled scan
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, scanType, targetId, codebaseId, cronExpr } = body;
  if (!name || !scanType || !cronExpr) return NextResponse.json({ error: "name, scanType, cronExpr required" }, { status: 400 });

  // Compute next run from cron (simplified — real impl would use a cron parser)
  const nextRun = computeNextRun(cronExpr);
  const s = await db.scheduledScan.create({
    data: { name, scanType, targetId: targetId || null, codebaseId: codebaseId || null, cronExpr, nextRunAt: nextRun },
  });
  return NextResponse.json({ id: s.id, nextRun: nextRun.toISOString() }, { status: 201 });
}

// POST /api/scheduled-scans/execute — check & run due scans (called by internal timer)
export async function PATCH() {
  const due = await db.scheduledScan.findMany({ where: { isActive: true, nextRunAt: { lte: new Date() } } });
  let executed = 0;
  for (const scan of due) {
    if (scan.scanType === "sast" && scan.codebaseId) {
      const s = await db.scan.create({ data: { codebaseId: scan.codebaseId, status: "queued", stageLabel: "Scheduled SAST scan" } });
      runScan(scan.codebaseId, s.id, (e) => void broadcast(e)).catch(() => null);
      executed++;
    }
    // DAST scheduled scans would trigger engagements here
    const next = computeNextRun(scan.cronExpr);
    await db.scheduledScan.update({ where: { id: scan.id }, data: { lastRunAt: new Date(), nextRunAt: next } });
  }
  return NextResponse.json({ executed, checked: due.length });
}

// DELETE /api/scheduled-scans?id=xxx
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.scheduledScan.update({ where: { id }, data: { isActive: false } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

function computeNextRun(cronExpr: string): Date {
  // Simplified: assume daily at the specified hour. Real impl would use cron-parser.
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(2, 0, 0, 0); // default 2am
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    next.setHours(parseInt(parts[1]), 0, 0, 0);
  }
  return next;
}
