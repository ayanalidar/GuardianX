import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/executive-summary?clientId=xxx — AI-generated executive summary
// Reads all findings + patches and writes a C-suite-friendly summary
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  try {
    // Gather all data for this client (or all if no clientId)
    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true } });

    let totalPatches = 0, pendingPatches = 0, approvedPatches = 0, criticalPatches = 0;
    let totalFindings = 0, criticalFindings = 0, highFindings = 0;
    const patchTitles: string[] = [];
    const findingTitles: string[] = [];

    for (const cb of codebases) {
      const patches = await db.patch.findMany({
        where: { codebaseId: cb.id as string },
        select: { title: true, severity: true, status: true },
      });
      totalPatches += patches.length;
      pendingPatches += patches.filter((p) => p.status === "pending").length;
      approvedPatches += patches.filter((p) => p.status === "approved").length;
      criticalPatches += patches.filter((p) => p.severity === "critical" && p.status === "pending").length;
      for (const p of patches.slice(0, 5)) {
        patchTitles.push(`[${p.severity}] ${p.title} (${p.status})`);
      }
    }

    const targets = clientId
      ? await db.target.findMany({ where: { clientId }, select: { id: true, name: true } })
      : await db.target.findMany({ select: { id: true, name: true } });

    for (const t of targets) {
      const engs = await db.engagement.findMany({ where: { targetId: t.id as string }, select: { id: true } });
      for (const e of engs) {
        const findings = await db.finding.findMany({
          where: { engagementId: e.id as string },
          select: { title: true, severity: true, category: true, endpoint: true },
        });
        totalFindings += findings.length;
        criticalFindings += findings.filter((f) => f.severity === "critical").length;
        highFindings += findings.filter((f) => f.severity === "high").length;
        for (const f of findings.slice(0, 5)) {
          findingTitles.push(`[${f.severity}] ${f.title} on ${f.endpoint}`);
        }
      }
    }

    const clientName = clientId
      ? ((await db.client.findUnique({ where: { id: clientId }, select: { name: true } }))?.name as string)
      : "All Clients";

    // Generate AI executive summary
    let summary: string;
    try {
      const zai = await ZAI.create();
      const prompt = `You are a Chief Information Security Officer (CISO) writing an executive summary for the board of directors.

Security Assessment Results for: ${clientName}

STATISTICS:
- Total vulnerabilities found: ${totalPatches + totalFindings}
- Critical (unpatched): ${criticalPatches + criticalFindings}
- High severity: ${highFindings}
- Pending remediation: ${pendingPatches}
- Already fixed: ${approvedPatches}

KEY FINDINGS:
${patchTitles.concat(findingTitles).slice(0, 10).join("\n")}

Write a professional executive summary with these sections:
1. OVERALL RISK ASSESSMENT (1-2 sentences with risk level: Critical/High/Medium/Low)
2. KEY FINDINGS (3-4 bullet points, non-technical language)
3. BUSINESS IMPACT (what happens if not fixed — in business terms)
4. RECOMMENDED ACTIONS (3-5 prioritized next steps)

Keep it concise (max 300 words). Write for C-suite executives, not engineers.
Format with clear section headers.`;

      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
      });
      summary = response.choices[0]?.message?.content || "";
    } catch {
      // Fallback: template-based summary
      const riskLevel = criticalPatches + criticalFindings > 0 ? "CRITICAL" : highFindings > 0 ? "HIGH" : "MEDIUM";
      summary = `## OVERALL RISK ASSESSMENT
The security assessment of ${clientName} reveals a ${riskLevel} risk level with ${criticalPatches + criticalFindings} critical vulnerabilities requiring immediate attention.

## KEY FINDINGS
• ${totalPatches + totalFindings} total vulnerabilities identified across ${codebases.length} codebases and ${targets.length} live targets
• ${criticalPatches + criticalFindings} critical issues require immediate remediation
• ${pendingPatches} patches are pending review and deployment
• ${approvedPatches} vulnerabilities have been successfully remediated

## BUSINESS IMPACT
• Critical vulnerabilities could lead to data breaches, financial loss, and regulatory penalties
• Unpatched systems are actively exploitable by attackers
• Compliance violations (DPDPA, GDPR) may result in fines up to ₹250 crore

## RECOMMENDED ACTIONS
1. Immediately patch all critical vulnerabilities (Priority 1)
2. Review and approve pending security patches
3. Deploy canary tokens and honeypots for breach detection
4. Schedule regular VAPT assessments (quarterly minimum)
5. Implement security training for development team`;
    }

    return NextResponse.json({
      client: clientName,
      summary,
      stats: {
        total_vulnerabilities: totalPatches + totalFindings,
        critical: criticalPatches + criticalFindings,
        high: highFindings,
        pending: pendingPatches,
        fixed: approvedPatches,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
