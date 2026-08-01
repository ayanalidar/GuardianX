import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/client-portal?clientId=xxx — read-only security dashboard for a client
// Returns the client's security posture (findings, patches, compliance, risk score)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, description: true, frameworks: true, status: true, authorized: true, targetUrl: true },
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const codebases = await db.codebase.findMany({ where: { clientId }, select: { id: true, name: true, language: true } });
    const targets = await db.target.findMany({ where: { clientId }, select: { id: true, name: true, baseUrl: true, authorized: true } });

    let totalPatches = 0;
    let pendingPatches = 0;
    let approvedPatches = 0;
    let criticalPatches = 0;
    let totalFindings = 0;
    let criticalFindings = 0;
    const recentFindings: { title: string; severity: string; endpoint: string; category: string }[] = [];
    const recentPatches: { title: string; severity: string; status: string; patchId: string }[] = [];

    for (const cb of codebases) {
      const patches = await db.patch.findMany({
        where: { codebaseId: cb.id },
        select: { id: true, patchId: true, title: true, severity: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      totalPatches += patches.length;
      pendingPatches += patches.filter((p) => p.status === "pending").length;
      approvedPatches += patches.filter((p) => p.status === "approved").length;
      criticalPatches += patches.filter((p) => p.severity === "critical" && p.status === "pending").length;
      for (const p of patches.slice(0, 5)) {
        recentPatches.push({ title: p.title as string, severity: p.severity as string, status: p.status as string, patchId: p.patchId as string });
      }
    }

    for (const t of targets) {
      const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
      for (const e of engs) {
        const findings = await db.finding.findMany({
          where: { engagementId: e.id },
          select: { id: true, title: true, severity: true, endpoint: true, category: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        totalFindings += findings.length;
        criticalFindings += findings.filter((f) => f.severity === "critical").length;
        for (const f of findings.slice(0, 5)) {
          recentFindings.push({ title: f.title as string, severity: f.severity as string, endpoint: f.endpoint as string, category: f.category as string });
        }
      }
    }

    // Compute risk score
    let riskScore = 0;
    riskScore += criticalFindings * 15;
    riskScore += (totalFindings - criticalFindings) * 5;
    riskScore += criticalPatches * 10;
    riskScore += pendingPatches * 2;
    if (!client.authorized) riskScore += 20;
    riskScore = Math.min(100, riskScore);
    const riskLevel = riskScore >= 70 ? "CRITICAL" : riskScore >= 40 ? "ELEVATED" : riskScore >= 20 ? "MODERATE" : "LOW";

    return NextResponse.json({
      client: {
        name: client.name,
        description: client.description,
        status: client.status,
        frameworks: client.frameworks ? (client.frameworks as string).split(",") : [],
        target_url: client.targetUrl,
      },
      stats: {
        codebases: codebases.length,
        targets: targets.length,
        total_patches: totalPatches,
        pending_patches: pendingPatches,
        approved_patches: approvedPatches,
        critical_patches: criticalPatches,
        total_findings: totalFindings,
        critical_findings: criticalFindings,
      },
      risk: { score: riskScore, level: riskLevel },
      recent_findings: recentFindings.slice(0, 5),
      recent_patches: recentPatches.slice(0, 5),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
