import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/analytics — MTTD/MTTR + vulnerability lifecycle + cost of risk
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  try {
    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true } });

    let remediateTimes: number[] = [];
    let detected = 0;
    let patched = 0;
    let verified = 0;
    let closed = 0;

    const COST_MAP: Record<string, number> = { critical: 50000, high: 15000, medium: 5000, low: 1000, info: 500 };
    let totalRiskCost = 0;
    let mitigatedCost = 0;

    // Batch: get all patches for all codebases at once
    const codebaseIds = codebases.map((cb) => cb.id as string);
    if (codebaseIds.length > 0) {
      const allPatches = await db.patch.findMany({
        where: { codebaseId: { in: codebaseIds } },
        select: { id: true, severity: true, status: true, createdAt: true, approvedAt: true },
      });

      for (const p of allPatches) {
        detected++;
        const cost = COST_MAP[(p.severity as string) || "low"] || 1000;
        totalRiskCost += cost;

        if (p.status === "approved") {
          patched++;
          mitigatedCost += cost;
          verified++;
          closed++;
          if (p.approvedAt && p.createdAt) {
            const remediateMs = new Date(p.approvedAt as string).getTime() - new Date(p.createdAt as string).getTime();
            if (remediateMs > 0) remediateTimes.push(remediateMs / 3600000);
          }
        }
      }
    }

    // Findings cost
    const targets = clientId
      ? await db.target.findMany({ where: { clientId }, select: { id: true } })
      : await db.target.findMany({ select: { id: true } });
    const targetIds = targets.map((t) => t.id as string);
    if (targetIds.length > 0) {
      const allEngs = await db.engagement.findMany({ where: { targetId: { in: targetIds } }, select: { id: true } });
      const engIds = allEngs.map((e) => e.id as string);
      if (engIds.length > 0) {
        const allFindings = await db.finding.findMany({ where: { engagementId: { in: engIds } }, select: { severity: true } });
        for (const f of allFindings) {
          totalRiskCost += COST_MAP[(f.severity as string) || "low"] || 1000;
        }
      }
    }

    const mttdHours = 0; // MTTD requires scan-start to finding-detect correlation
    const mttrHours = remediateTimes.length > 0 ? remediateTimes.reduce((a, b) => a + b, 0) / remediateTimes.length : 0;
    const unmitigatedCost = totalRiskCost - mitigatedCost;

    return NextResponse.json({
      mttd_hours: Math.round(mttdHours * 10) / 10,
      mttr_hours: Math.round(mttrHours * 10) / 10,
      mttd_formatted: mttdHours < 1 ? `${Math.round(mttdHours * 60)} min` : `${Math.round(mttdHours)}h`,
      mttr_formatted: mttrHours < 24 ? `${Math.round(mttrHours)}h` : `${Math.round(mttrHours / 24)}d`,
      vulnerability_lifecycle: { detected, patched, verified, closed },
      cost_of_risk: {
        total_risk: totalRiskCost,
        mitigated: mitigatedCost,
        unmitigated: unmitigatedCost,
        formatted: {
          total: `$${(totalRiskCost / 1000).toFixed(1)}k`,
          mitigated: `$${(mitigatedCost / 1000).toFixed(1)}k`,
          unmitigated: `$${(unmitigatedCost / 1000).toFixed(1)}k`,
        },
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
