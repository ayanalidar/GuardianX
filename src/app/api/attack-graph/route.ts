import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/attack-graph, builds a Directed Acyclic Graph (DAG) of attack paths
// Models how low-severity issues on separate hosts can chain into full compromise
// Body: { clientId?: string }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { clientId } = await req.json().catch(() => ({}));

  try {
    // Gather all findings for the client (or all clients)
    const targets = clientId
      ? await db.target.findMany({ where: { clientId }, select: { id: true, name: true, baseUrl: true, clientId: true } })
      : await db.target.findMany({ select: { id: true, name: true, baseUrl: true, clientId: true } });

    const allFindings: { id: string; title: string; severity: string; category: string; endpoint: string; target: string; clientId: string | null }[] = [];

    for (const t of targets) {
      const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
      for (const e of engs) {
        const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { id: true, title: true, severity: true, category: true, endpoint: true } });
        for (const f of findings) {
          allFindings.push({
            id: f.id as string,
            title: f.title as string,
            severity: f.severity as string,
            category: f.category as string,
            endpoint: f.endpoint as string,
            target: t.name as string,
            clientId: t.clientId as string | null,
          });
        }
      }
    }

    // Also gather SAST patches (vulns from code)
    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true, clientId: true } });
    for (const cb of codebases) {
      const patches = await db.patch.findMany({ where: { codebaseId: cb.id }, select: { id: true, title: true, severity: true, affectedFile: true } });
      for (const p of patches) {
        allFindings.push({
          id: p.id as string,
          title: p.title as string,
          severity: p.severity as string,
          category: "SAST",
          endpoint: p.affectedFile as string,
          target: cb.name as string,
          clientId: cb.clientId as string | null,
        });
      }
    }

    // ── Build DAG nodes and edges ─────────────────────────────────────────
    const nodes = allFindings.map((f) => ({
      id: f.id,
      label: f.title,
      severity: f.severity,
      category: f.category,
      target: f.target,
      endpoint: f.endpoint,
    }));

    // AI generates attack chains
    let attackChains: { title: string; description: string; severity: string; steps: { finding_id: string; technique: string }[] }[] = [];
    try {
      const zai = await ZAI.create();
      const prompt = `You are an elite red team analyst. Given these vulnerabilities, model how they can be chained into attack paths.

Vulnerabilities:
${allFindings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} (${f.category}) on ${f.target}/${f.endpoint}`).join("\n")}

Model 3-5 realistic attack chains where low-severity issues combine into full compromise.
Format as JSON array:
[{
  "title": "Chain name",
  "description": "How the chain works",
  "severity": "critical|high|medium",
  "steps": [{"finding_id": "vuln number from list", "technique": "what the attacker does"}]
}]`;

      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
      });
      const content = response.choices[0]?.message?.content || "[]";
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        attackChains = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: simple rule-based chains
      const hasInfo = allFindings.some((f) => f.severity === "info" || f.severity === "low");
      const hasMedium = allFindings.some((f) => f.severity === "medium");
      const hasHigh = allFindings.some((f) => f.severity === "high" || f.severity === "critical");

      if (hasInfo && hasMedium) {
        attackChains.push({
          title: "Info Disclosure → Privilege Escalation",
          description: "Information leaked via low-severity finding enables targeting of medium-severity vuln",
          severity: "high",
          steps: [
            { finding_id: "info", technique: "Gather leaked system info" },
            { finding_id: "medium", technique: "Use leaked info to exploit medium vuln" },
          ],
        });
      }
      if (hasMedium && hasHigh) {
        attackChains.push({
          title: "Medium Vuln → Full Compromise",
          description: "Medium-severity vulnerability provides foothold for critical exploitation",
          severity: "critical",
          steps: [
            { finding_id: "medium", technique: "Exploit medium vuln for initial access" },
            { finding_id: "high", technique: "Escalate to full system compromise" },
          ],
        });
      }
    }

    // Save attack chains
    for (const chain of attackChains) {
      await db.attackChain.create({
        data: {
          id: randomUUID(),
          title: chain.title,
          description: chain.description,
          severity: chain.severity,
          steps: JSON.stringify(chain.steps),
          findingIds: chain.steps.map((s) => s.finding_id).join(","),
        },
      });
    }

    // Build edges from attack chains
    const edges: { from: string; to: string; technique: string }[] = [];
    for (const chain of attackChains) {
      for (let i = 0; i < chain.steps.length - 1; i++) {
        edges.push({
          from: chain.steps[i].finding_id,
          to: chain.steps[i + 1].finding_id,
          technique: chain.steps[i + 1].technique,
        });
      }
    }

    return NextResponse.json({
      nodes,
      edges,
      attack_chains: attackChains,
      total_vulnerabilities: nodes.length,
      total_chains: attackChains.length,
      message: `Attack graph built: ${nodes.length} vulnerabilities → ${attackChains.length} attack paths modeled.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
