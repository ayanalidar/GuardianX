import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/correlation, cross-module vulnerability correlation.
// Connects findings across SAST + DAST + SCA + dark web + canary hits.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const [patches, findings, canaries, honeypots, scaDeps] = await Promise.all([
    db.patch.findMany({ where: { status: "pending" }, select: { patchId: true, title: true, severity: true, cve: true, affectedFile: true, aiExplanation: true, codebaseId: true } }),
    db.finding.findMany({ select: { id: true, title: true, severity: true, category: true, endpoint: true, description: true, engagementId: true } }),
    db.canary.findMany({ where: { detected: true }, select: { id: true, label: true, canaryValue: true, detectedOn: true } }),
    db.honeypotHit.findMany({ take: 10, orderBy: { timestamp: "desc" }, select: { endpoint: true, ipAddress: true, timestamp: true } }),
    db.codebase.findMany({ select: { id: true, name: true } }),
  ]);

  const correlations: Array<{
    title: string;
    severity: string;
    sources: string[];
    description: string;
    relatedFindings: string[];
  }> = [];

  // Group by codebase
  const cbMap = new Map(scaDeps.map(c => [c.id, c.name]));

  for (const patch of patches) {
    const cbName = cbMap.get(patch.codebaseId) ?? "unknown";
    const relatedFindings: string[] = [`${patch.patchId} (SAST)`];

    // Check if a DAST finding matches the same vuln
    const matchingDast = findings.filter(f =>
      f.title.toLowerCase().includes(patch.title.toLowerCase().split(" ")[0]) ||
      f.category.toLowerCase().includes(patch.severity)
    );
    matchingDast.forEach(f => relatedFindings.push(`${f.id} (DAST: ${f.endpoint})`));

    // Check if canary was detected (data exfiltration related to this vuln)
    if (canaries.length > 0 && (patch.severity === "critical" || patch.severity === "high")) {
      relatedFindings.push(`${canaries.length} canary breach(es) (Exfil)`);
    }

    // Check if honeypot was triggered (recon preceding the attack)
    if (honeypots.length > 0 && patch.severity === "critical") {
      relatedFindings.push(`${honeypots.length} honeypot hit(s) (Recon)`);
    }

    if (relatedFindings.length > 1) {
      correlations.push({
        title: `Correlated threat: ${patch.title}`,
        severity: patch.severity,
        sources: [...new Set(relatedFindings.map(f => f.split("(")[1]?.replace(")", "") ?? "SAST"))],
        description: `Codebase "${cbName}" has a ${patch.severity} SAST finding that correlates with ${relatedFindings.length - 1} other finding(s). This indicates a multi-vector attack surface.`,
        relatedFindings,
      });
    }
  }

  return NextResponse.json({
    total_correlations: correlations.length,
    correlations: correlations.sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1)),
    modules_correlated: {
      sast: patches.length,
      dast: findings.length,
      canary_breaches: canaries.length,
      honeypot_hits: honeypots.length,
    },
  });
}
