import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/guardian-chat, natural language interface to the entire platform
// Body: { message: string, history?: {role, content}[] }
export async function POST(req: Request) {
  const { message, history = [] } = await req.json().catch(() => ({}));

  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  try {
    // Gather platform state for context
    const clients = await db.client.findMany({
      include: { _count: { select: { codebases: true, targets: true } } },
    });

    let totalPatches = 0;
    let pendingPatches = 0;
    let criticalPatches = 0;
    let totalFindings = 0;
    let criticalFindings = 0;
    const clientData: string[] = [];

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true, name: true } });
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true, name: true, baseUrl: true } });

      let cp = 0, pp = 0, crp = 0;
      for (const cb of codebases) {
        const patches = await db.patch.findMany({ where: { codebaseId: cb.id }, select: { status: true, severity: true, title: true } });
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

      clientData.push(`${c.name}: status=${c.status}, authorized=${c.authorized}, codebases=${codebases.length}, targets=${targets.length}, patches=${cp}(${pp} pending, ${crp} critical), critical_findings=${cf}`);
    }

    // Build system prompt
    const systemPrompt = `You are Guardian, the AI security assistant for the GuardianX platform. You have real-time access to the platform's data. Answer the user's question concisely and helpfully.

Current platform state:
- Total clients: ${clients.length}
- Total patches: ${totalPatches} (${pendingPatches} pending, ${criticalPatches} critical)
- Total findings: ${totalFindings} (${criticalFindings} critical)

Client details:
${clientData.join("\n")}

Rules:
- Be concise (max 3-4 sentences unless asked for detail)
- Use the real data above to answer questions
- If asked "what should I prioritize", recommend the client with most critical findings/patches
- If asked for a summary, give bullet points
- If you don't know something, say so`;

    const zai = await ZAI.create();
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const response = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const reply = response.choices[0]?.message?.content || "I couldn't process that request.";

    return NextResponse.json({
      reply,
      context: {
        clients: clients.length,
        total_patches: totalPatches,
        pending_patches: pendingPatches,
        critical_patches: criticalPatches,
        total_findings: totalFindings,
        critical_findings: criticalFindings,
      },
    });
  } catch (err) {
    return NextResponse.json({
      reply: "I'm having trouble connecting to the platform data right now. Please try again.",
      error: err instanceof Error ? err.message : "unknown",
    }, { status: 200 });
  }
}
