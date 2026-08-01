import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/waf-rules — generates WAF rules (ModSecurity + Cloudflare) for findings
// that can't be patched immediately (virtual patching)
// Body: { findingId?: string, clientId?: string }
export async function POST(req: Request) {
  const { findingId, clientId } = await req.json().catch(() => ({}));

  try {
    // Gather findings to generate rules for
    let findings: { id: string; title: string; category: string; endpoint: string; payload: string | null; severity: string }[] = [];

    if (findingId) {
      const f = await db.finding.findFirst({ where: { id: findingId }, select: { id: true, title: true, category: true, endpoint: true, payload: true, severity: true } });
      if (f) findings = [f as typeof findings[0]];
    } else {
      // Get all open findings (optionally filtered by client)
      const targets = clientId
        ? await db.target.findMany({ where: { clientId }, select: { id: true } })
        : await db.target.findMany({ select: { id: true } });
      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
        for (const e of engs) {
          const fs = await db.finding.findMany({ where: { engagementId: e.id }, select: { id: true, title: true, category: true, endpoint: true, payload: true, severity: true } });
          findings = findings.concat(fs as typeof findings);
        }
      }
    }

    if (findings.length === 0) {
      return NextResponse.json({ ok: true, rules: [], message: "No findings to generate WAF rules for." });
    }

    // Generate WAF rules using AI
    let aiRules: string = "";
    try {
      const zai = await ZAI.create();
      const prompt = `Generate WAF virtual patch rules for these security findings. Output BOTH ModSecurity and Cloudflare WAF rule syntax for each finding.

Findings:
${findings.map((f, i) => `${i + 1}. ${f.title} [${f.severity}] — ${f.category} on ${f.endpoint}${f.payload ? ` (payload: ${f.payload.slice(0, 80)})` : ""}`).join("\n")}

Format each rule as:
### Finding N: [title]
**ModSecurity:**
\`\`\`
SecRule ... 
\`\`\`
**Cloudflare:**
\`\`\`
(http.request.uri.path contains "...") 
\`\`\``;

      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
      });
      aiRules = response.choices[0]?.message?.content || "";
    } catch {
      // Fallback: generate basic rules
      aiRules = findings.map((f) => `### ${f.title}\n**ModSecurity:**\nSecRule REQUEST_URI "${f.endpoint}" "id:$(date +%s),deny,log,msg:'${f.title} blocked by WAF'"\n\n**Cloudflare:**\n(http.request.uri.path eq "${f.endpoint}")`).join("\n\n");
    }

    return NextResponse.json({
      ok: true,
      rules: aiRules,
      findings_count: findings.length,
      findings: findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity, endpoint: f.endpoint })),
      message: `Generated WAF rules for ${findings.length} finding(s).`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
