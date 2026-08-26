import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/threat-briefing, AI-generated 3-bullet threat briefing
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    // Gather current state
    const clients = await db.client.findMany({
      include: {
        _count: { select: { codebases: true, targets: true } },
      },
    });

    let totalPatches = 0;
    let pendingPatches = 0;
    let criticalPatches = 0;
    let totalFindings = 0;
    let criticalFindings = 0;
    const clientStates: string[] = [];

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true } });
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true } });

      let cp = 0, pp = 0, crp = 0;
      for (const cb of codebases) {
        const patches = await db.patch.findMany({ where: { codebaseId: cb.id }, select: { status: true, severity: true } });
        cp += patches.length;
        pp += patches.filter((p) => p.status === "pending").length;
        crp += patches.filter((p) => p.severity === "critical" && p.status === "pending").length;
      }
      totalPatches += cp;
      pendingPatches += pp;
      criticalPatches += crp;

      let cf = 0;
      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
        for (const e of engs) {
          const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { severity: true } });
          totalFindings += findings.length;
          cf += findings.filter((f) => f.severity === "critical").length;
          criticalFindings += cf;
        }
      }

      clientStates.push(`${c.name}: status=${c.status}, patches=${cp}(${pp} pending, ${crp} critical), critical_findings=${cf}, authorized=${c.authorized}`);
    }

    // Generate AI briefing
    let briefing: string[];
    try {
      const zai = await ZAI.create();
      const prompt = `You are the GuardianX AI Security Analyst. Generate a 3-bullet threat briefing based on this current security state. Be concise, actionable, and specific. Each bullet should be 1-2 sentences max.

Current state:
- Total clients: ${clients.length}
- Total patches: ${totalPatches} (${pendingPatches} pending, ${criticalPatches} critical)
- Total findings: ${totalFindings} (${criticalFindings} critical)
- Client details: ${clientStates.join("; ")}

Format: 3 bullets, each starting with an emoji (🔴 for critical, 🟡 for warning, 🟢 for positive). Focus on: 1) What's critical right now, 2) What's improving or needs attention, 3) Recommended next action.`;

      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
      });
      const content = response.choices[0]?.message?.content || "";
      briefing = content.split("\n").filter((l: string) => l.trim().startsWith("🔴") || l.trim().startsWith("🟡") || l.trim().startsWith("🟢")).slice(0, 3);
      if (briefing.length === 0) {
        // Fallback: split by newlines and take first 3 non-empty lines
        briefing = content.split("\n").filter((l: string) => l.trim()).slice(0, 3);
      }
    } catch {
      // Fallback if AI fails
      briefing = [
        criticalPatches > 0 ? `🔴 ${criticalPatches} critical patches awaiting approval across clients. Review and deploy immediately.` : "🟢 No critical patches pending. All systems stable.",
        pendingPatches > 0 ? `🟡 ${pendingPatches} patches pending review. Average risk decreasing as patches are applied.` : "🟢 All patches processed. Pipeline flowing smoothly.",
        criticalFindings > 0 ? `🔴 ${criticalFindings} critical findings detected. Prioritize remediation for affected clients.` : "🟢 No critical findings. Continue regular scanning schedule.",
      ];
    }

    return NextResponse.json({
      briefing,
      generated_at: new Date().toISOString(),
      summary: {
        clients: clients.length,
        total_patches: totalPatches,
        pending_patches: pendingPatches,
        critical_patches: criticalPatches,
        total_findings: totalFindings,
        critical_findings: criticalFindings,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
