import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/anomaly-detection, detects unusual patterns in security events
export async function GET() {
  try {
    const anomalies: { severity: "critical" | "warning" | "info"; title: string; detail: string; client?: string }[] = [];

    // 1. Check for spike in critical findings (more than 2 in last hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    try {
      const recentFindings = await db.finding.findMany({
        where: { createdAt: { gte: oneHourAgo } },
        select: { severity: true, title: true, createdAt: true },
      });
      const criticalRecent = recentFindings.filter((f) => f.severity === "critical");
      if (criticalRecent.length >= 3) {
        anomalies.push({
          severity: "critical",
          title: "Critical Finding Spike",
          detail: `${criticalRecent.length} critical findings in the last hour, possible coordinated attack or new 0-day exploit in the wild.`,
        });
      }
    } catch { /* ignore */ }

    // 2. Check for scans stuck in "analyzing" for too long
    try {
      const scans = await db.scan.findMany({
        where: { status: { in: ["analyzing", "patching", "sandboxing"] } },
        select: { id: true, startedAt: true, status: true },
      });
      for (const s of scans) {
        const elapsed = Date.now() - new Date(s.startedAt as string).getTime();
        if (elapsed > 300000) { // > 5 minutes
          anomalies.push({
            severity: "warning",
            title: "Scan Running Too Long",
            detail: `Scan ${s.id} has been in "${s.status}" state for ${Math.round(elapsed / 60000)} minutes, may be stuck.`,
          });
        }
      }
    } catch { /* ignore */ }

    // 3. Check for canary triggers (data exfiltration detected)
    try {
      const triggeredCanaries = await db.canary.findMany({
        where: { detected: true },
        select: { label: true, canaryType: true, detectedOn: true, targetId: true },
      });
      for (const c of triggeredCanaries) {
        anomalies.push({
          severity: "critical",
          title: "Canary Token Triggered",
          detail: `Canary "${c.label}" (${c.canaryType}) was triggered${c.detectedOn ? ` on ${c.detectedOn}` : ""}, active data exfiltration detected!`,
        });
      }
    } catch { /* ignore */ }

    // 4. Check for clients with many pending patches (review bottleneck)
    const clients = await db.client.findMany({ select: { id: true, name: true } });
    for (const c of clients) {
      try {
        const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true } });
        let pending = 0;
        let critical = 0;
        for (const cb of codebases) {
          const patches = await db.patch.findMany({ where: { codebaseId: cb.id, status: "pending" }, select: { severity: true } });
          pending += patches.length;
          critical += patches.filter((p) => p.severity === "critical").length;
        }
        if (critical >= 3) {
          anomalies.push({
            severity: "warning",
            title: "Patch Review Bottleneck",
            detail: `${c.name as string} has ${critical} critical patches pending review, remediation is blocked.`,
            client: c.name as string,
          });
        }
      } catch { /* ignore */ }
    }

    // 5. Check for unauthorized clients with active scans (shouldn't happen)
    try {
      const unauthorizedTargets = await db.target.findMany({
        where: { authorized: false },
        select: { name: true, baseUrl: true },
      });
      for (const t of unauthorizedTargets) {
        anomalies.push({
          severity: "info",
          title: "Unauthorized Target",
          detail: `Target "${t.name}" (${t.baseUrl}) is not yet authorized for testing.`,
        });
      }
    } catch { /* ignore */ }

    const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
    const warningCount = anomalies.filter((a) => a.severity === "warning").length;

    return NextResponse.json({
      anomalies,
      count: anomalies.length,
      critical: criticalCount,
      warnings: warningCount,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
