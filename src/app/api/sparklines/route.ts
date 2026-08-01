import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/sparklines, returns 7-day time series for KPI sparklines
// Generates daily counts for: scans, patches, findings, critical findings
export async function GET() {
  try {
    const now = new Date();
    const days: { date: string; label: string; scans: number; patches: number; findings: number; critical: number }[] = [];

    // Build last 7 days
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const label = day.toLocaleDateString("en-US", { weekday: "short" });

      // Count scans started that day
      let scanCount = 0;
      let patchCount = 0;
      let findingCount = 0;
      let criticalCount = 0;

      try {
        const scans = await db.scan.findMany({
          where: { startedAt: { gte: day.toISOString(), lte: dayEnd.toISOString() } },
          select: { id: true },
        });
        scanCount = scans.length;
      } catch { /* ignore */ }

      try {
        const patches = await db.patch.findMany({
          where: { createdAt: { gte: day.toISOString(), lte: dayEnd.toISOString() } },
          select: { id: true, severity: true },
        });
        patchCount = patches.length;
        criticalCount = patches.filter((p) => p.severity === "critical").length;
      } catch { /* ignore */ }

      try {
        const findings = await db.finding.findMany({
          where: { createdAt: { gte: day.toISOString(), lte: dayEnd.toISOString() } },
          select: { id: true },
        });
        findingCount = findings.length;
      } catch { /* ignore */ }

      days.push({
        date: day.toISOString().slice(0, 10),
        label,
        scans: scanCount,
        patches: patchCount,
        findings: findingCount,
        critical: criticalCount,
      });
    }

    return NextResponse.json({ days });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
