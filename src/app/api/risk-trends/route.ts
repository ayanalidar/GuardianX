import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/risk-trends?clientId=xxx&days=30, returns risk score + finding count trends
// Generates a time series showing how risk has changed over time
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const days = parseInt(url.searchParams.get("days") || "30");

  try {
    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true } });
    const cbIds = codebases.map((cb) => cb.id as string);

    const trend: { date: string; label: string; riskScore: number; openFindings: number; patchesApproved: number; patchesPending: number }[] = [];

    const now = new Date();
    const interval = days <= 30 ? 1 : days <= 90 ? 3 : 7; // daily for 30d, every 3 days for 90d

    for (let i = days; i >= 0; i -= interval) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(23, 59, 59, 999);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);

      let totalFindings = 0;
      let criticalFindings = 0;
      let patchesApproved = 0;
      let patchesPending = 0;

      // Count patches up to this date
      if (cbIds.length > 0) {
        const patches = await db.patch.findMany({
          where: { codebaseId: { in: cbIds }, createdAt: { lte: day.toISOString() } },
          select: { status: true, severity: true },
        });
        patchesApproved = patches.filter((p) => p.status === "approved").length;
        patchesPending = patches.filter((p) => p.status === "pending").length;
      }

      // Count findings up to this date
      const targets = clientId
        ? await db.target.findMany({ where: { clientId }, select: { id: true } })
        : await db.target.findMany({ select: { id: true } });
      const targetIds = targets.map((t) => t.id as string);

      if (targetIds.length > 0) {
        const engs = await db.engagement.findMany({
          where: { targetId: { in: targetIds } },
          select: { id: true },
        });
        const engIds = engs.map((e) => e.id as string);

        if (engIds.length > 0) {
          const findings = await db.finding.findMany({
            where: { engagementId: { in: engIds }, createdAt: { lte: day.toISOString() } },
            select: { severity: true },
          });
          totalFindings = findings.length;
          criticalFindings = findings.filter((f) => f.severity === "critical").length;
        }
      }

      // Compute risk score (0-100)
      const riskScore = Math.min(100, criticalFindings * 15 + (totalFindings - criticalFindings) * 5 + patchesPending * 3);

      trend.push({
        date: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        riskScore,
        openFindings: totalFindings,
        patchesApproved,
        patchesPending,
      });
    }

    // Compute improvement
    const firstRisk = trend[0]?.riskScore || 0;
    const lastRisk = trend[trend.length - 1]?.riskScore || 0;
    const improvement = firstRisk - lastRisk;
    const improvementPercent = firstRisk > 0 ? Math.round((improvement / firstRisk) * 100) : 0;

    return NextResponse.json({
      trend,
      summary: {
        days,
        dataPoints: trend.length,
        currentRisk: lastRisk,
        startRisk: firstRisk,
        improvement: improvementPercent,
        trend: improvement > 0 ? "improving" : improvement < 0 ? "worsening" : "stable",
        totalFindings: trend[trend.length - 1]?.openFindings || 0,
        patchesApproved: trend[trend.length - 1]?.patchesApproved || 0,
        patchesPending: trend[trend.length - 1]?.patchesPending || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
