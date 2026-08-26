import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/risk-score, AI-driven predictive risk score per client
// Predicts which client is most likely to be breached next based on:
// - Open critical/high findings (weight: 3x)
// - Pending critical patches (weight: 2x)
// - Scan recency (stale = higher risk)
// - Authorization status (unauthorized = can't test = unknown risk)
// - Historical breach indicators (canary triggers)
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const clients = await db.client.findMany({ select: { id: true, name: true, status: true, authorized: true } });
    const riskScores: { client: string; score: number; level: string; factors: string[] }[] = [];

    for (const c of clients) {
      let score = 0;
      const factors: string[] = [];

      // Open findings
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true } });
      let criticalFindings = 0;
      let highFindings = 0;
      let mediumFindings = 0;
      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
        for (const e of engs) {
          const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { severity: true } });
          criticalFindings += findings.filter((f) => f.severity === "critical").length;
          highFindings += findings.filter((f) => f.severity === "high").length;
          mediumFindings += findings.filter((f) => f.severity === "medium").length;
        }
      }
      score += criticalFindings * 15;
      score += highFindings * 8;
      score += mediumFindings * 3;
      if (criticalFindings > 0) factors.push(`${criticalFindings} critical findings`);
      if (highFindings > 0) factors.push(`${highFindings} high findings`);

      // Pending patches
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true } });
      let pendingCritical = 0;
      let pendingTotal = 0;
      for (const cb of codebases) {
        const patches = await db.patch.findMany({ where: { codebaseId: cb.id, status: "pending" }, select: { severity: true } });
        pendingTotal += patches.length;
        pendingCritical += patches.filter((p) => p.severity === "critical").length;
      }
      score += pendingCritical * 10;
      score += pendingTotal * 2;
      if (pendingCritical > 0) factors.push(`${pendingCritical} critical patches unpatched`);
      if (pendingTotal > 0) factors.push(`${pendingTotal} patches pending review`);

      // Authorization status
      if (!c.authorized) {
        score += 20;
        factors.push("not authorized for testing");
      }

      // Canary triggers (breach indicator)
      for (const t of targets) {
        const canaries = await db.canary.findMany({ where: { targetId: t.id, detected: true } });
        if (canaries.length > 0) {
          score += 25;
          factors.push(`${canaries.length} canary token(s) triggered, active exfiltration`);
        }
      }

      // Stale scan (no scan in last 7 days)
      let hasRecentScan = false;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      for (const cb of codebases) {
        const scans = await db.scan.findMany({ where: { codebaseId: cb.id, startedAt: { gte: sevenDaysAgo } }, select: { id: true } });
        if (scans.length > 0) hasRecentScan = true;
      }
      if (!hasRecentScan && codebases.length > 0) {
        score += 10;
        factors.push("no recent scan (stale)");
      }

      // Cap at 100
      score = Math.min(100, score);
      if (factors.length === 0) factors.push("no risk factors detected");

      const level = score >= 70 ? "CRITICAL" : score >= 40 ? "ELEVATED" : score >= 20 ? "MODERATE" : "LOW";

      riskScores.push({ client: c.name, score, level, factors });
    }

    // Sort by score descending (highest risk first)
    riskScores.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      clients: riskScores,
      highest_risk: riskScores[0] || null,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
