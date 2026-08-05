import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/security-kpis, compute real security KPIs from existing data.
// Metrics: MTTD (mean time to detect), MTTR (mean time to resolve),
// vulnerability density, patch latency, sandbox pass rate, adversarial win rate.

export async function GET() {
  const patches = await db.patch.findMany({
    select: {
      severity: true,
      status: true,
      sandboxPassed: true,
      adversarialWon: true,
      adversarialRounds: true,
      confidence: true,
      createdAt: true,
      approvedAt: true,
      codebaseId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const codebases = await db.codebase.findMany({ select: { id: true, name: true, sourceCode: true } });
  const scans = await db.scan.findMany({ select: { status: true, startedAt: true, completedAt: true } });
  const findings = await db.finding.findMany({ select: { severity: true, createdAt: true } });

  const total = patches.length;
  const approved = patches.filter((p) => p.status === "approved");
  const rejected = patches.filter((p) => p.status === "rejected");
  const pending = patches.filter((p) => p.status === "pending");

  // MTTR: mean time from patch creation to approval (hours)
  const resolvedTimes = approved
    .map((p) => {
      if (!p.approvedAt) return null;
      return ((p.approvedAt as Date).getTime() - (p.createdAt as Date).getTime()) / 3600000;
    })
    .filter((t): t is number => t !== null && t >= 0);
  const mttr = resolvedTimes.length > 0
    ? Math.round((resolvedTimes.reduce((s, t) => s + t, 0) / resolvedTimes.length) * 10) / 10
    : null;

  // MTTD: mean time from scan start to patch creation (approx: use scan→first patch)
  // Since patches are created during scans, MTTD ≈ scan duration
  const scanDurations = scans
    .filter((s) => s.completedAt && s.status === "completed")
    .map((s) => ((s.completedAt as Date).getTime() - (s.startedAt as Date).getTime()) / 1000)
    .filter((d) => d > 0);
  const mttd = scanDurations.length > 0
    ? Math.round(scanDurations.reduce((s, d) => s + d, 0) / scanDurations.length)
    : null;

  // Vulnerability density: vulns per 1000 lines of code
  const totalLines = codebases.reduce((s, c) => s + ((c.sourceCode as string) || "").split("\n").length, 0);
  const totalVulns = total + findings.length;
  const vulnDensity = totalLines > 0 ? Math.round((totalVulns / totalLines) * 1000 * 10) / 10 : 0;

  // Patch latency: time from vuln detection to approval (average, in hours)
  const patchLatency = mttr; // same as MTTR for this model

  // Sandbox pass rate
  const sandboxPassed = patches.filter((p) => p.sandboxPassed).length;
  const sandboxPassRate = total > 0 ? Math.round((sandboxPassed / total) * 100) : 100;

  // Adversarial win rate
  const advRounds = patches.filter((p) => (p.adversarialRounds as number) > 0).length;
  const advWon = patches.filter((p) => p.adversarialWon).length;
  const advWinRate = advRounds > 0 ? Math.round((advWon / advRounds) * 100) : 100;

  // Severity breakdown
  const sevBreakdown = {
    critical: patches.filter((p) => p.severity === "critical").length + findings.filter((f) => f.severity === "critical").length,
    high: patches.filter((p) => p.severity === "high").length + findings.filter((f) => f.severity === "high").length,
    medium: patches.filter((p) => p.severity === "medium").length + findings.filter((f) => f.severity === "medium").length,
    low: patches.filter((p) => p.severity === "low").length + findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  // Resolution rate
  const resolutionRate = total > 0 ? Math.round(((approved.length + rejected.length) / total) * 100) : 0;

  // Average confidence
  const avgConfidence = total > 0
    ? Math.round((patches.reduce((s, p) => s + (p.confidence as number), 0) / total) * 100)
    : 0;

  // 7-day trend (mock from real data: group by day)
  const now = Date.now();
  const trend: Array<{ day: string; vulns: number; resolved: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now - i * 86400000);
    const dayEnd = new Date(now - (i - 1) * 86400000);
    const dayVulns = patches.filter((p) => (p.createdAt as Date) >= dayStart && (p.createdAt as Date) < dayEnd).length
      + findings.filter((f) => (f.createdAt as Date) >= dayStart && (f.createdAt as Date) < dayEnd).length;
    const dayResolved = approved.filter((p) => p.approvedAt && p.approvedAt >= dayStart && p.approvedAt < dayEnd).length;
    trend.push({
      day: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
      vulns: dayVulns,
      resolved: dayResolved,
    });
  }

  return NextResponse.json({
    mttd_seconds: mttd,
    mttr_hours: mttr,
    patch_latency_hours: patchLatency,
    vuln_density_per_kloc: vulnDensity,
    sandbox_pass_rate: sandboxPassRate,
    adversarial_win_rate: advWinRate,
    resolution_rate: resolutionRate,
    avg_confidence: avgConfidence,
    total_vulns: totalVulns,
    pending_vulns: pending.length,
    resolved_vulns: approved.length + rejected.length,
    severity_breakdown: sevBreakdown,
    total_lines_scanned: totalLines,
    codebases_scanned: codebases.length,
    scans_completed: scans.filter((s) => s.status === "completed").length,
    trend,
    kpi_score: Math.round((sandboxPassRate * 0.2 + advWinRate * 0.2 + resolutionRate * 0.3 + avgConfidence * 0.15 + (mttr !== null && mttr < 24 ? 100 : mttr !== null ? 50 : 0) * 0.15)),
  });
}
