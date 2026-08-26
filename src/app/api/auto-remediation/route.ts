import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/auto-remediation, generates fix code for DAST findings
// Body: { findingId?: string, clientId?: string }
// For each finding, AI generates the specific remediation code
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { findingId, clientId } = await req.json().catch(() => ({}));

  try {
    // Gather findings to remediate
    let findings: { id: string; title: string; severity: string; category: string; endpoint: string; method: string; payload: string | null; description: string; proofResponse: string | null }[] = [];

    if (findingId) {
      const f = await db.finding.findFirst({ where: { id: findingId }, select: { id: true, title: true, severity: true, category: true, endpoint: true, method: true, payload: true, description: true, proofResponse: true } });
      if (f) findings = [f as typeof findings[0]];
    } else {
      const targets = clientId
        ? await db.target.findMany({ where: { clientId }, select: { id: true } })
        : await db.target.findMany({ select: { id: true } });
      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id as string }, select: { id: true } });
        for (const e of engs) {
          const fs = await db.finding.findMany({ where: { engagementId: e.id as string }, select: { id: true, title: true, severity: true, category: true, endpoint: true, method: true, payload: true, description: true, proofResponse: true } });
          findings = findings.concat(fs as typeof findings);
        }
      }
    }

    if (findings.length === 0) {
      return NextResponse.json({ ok: true, remediations: [], message: "No findings to remediate." });
    }

    const remediations: { finding_id: string; title: string; severity: string; fix_code: string; fix_explanation: string; language: string }[] = [];

    for (const f of findings.slice(0, 10)) {
      let fixCode = "";
      let fixExplanation = "";

      try {
        const zai = await ZAI.create();
        const prompt = `You are a senior security engineer. Generate the specific remediation code for this vulnerability.

Vulnerability:
- Title: ${f.title}
- Category: ${f.category}
- Severity: ${f.severity}
- Endpoint: ${f.endpoint}
- Method: ${f.method}
- Payload: ${f.payload || "N/A"}
- Description: ${f.description}
- Evidence: ${(f.proofResponse || "").slice(0, 200)}

Generate:
1. The specific code fix (in the most likely language for this technology)
2. A brief explanation of what the fix does

Format:
\`\`\`language
// code here
\`\`\`

Explanation: ...`;

        const response = await zai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          thinking: { type: "disabled" },
        });
        const content = response.choices[0]?.message?.content || "";

        // Extract code block
        const codeMatch = content.match(/```(\w+)?\s*([\s\S]*?)```/);
        if (codeMatch) {
          fixCode = codeMatch[2].trim();
        } else {
          fixCode = content;
        }

        // Extract explanation
        const explMatch = content.match(/Explanation:\s*(.+)/i);
        if (explMatch) {
          fixExplanation = explMatch[1].trim();
        } else {
          fixExplanation = content.replace(/```[\s\S]*?```/g, "").trim().slice(0, 200);
        }
      } catch {
        // Fallback: template-based remediation
        const templates: Record<string, { code: string; explanation: string }> = {
          "SQL Injection": {
            code: `// Fix: Use parameterized queries\nconst query = "SELECT * FROM users WHERE email = ?";\ndb.query(query, [email]);`,
            explanation: "Replace string concatenation with parameterized queries to prevent SQL injection.",
          },
          "XSS": {
            code: `// Fix: Encode user input before rendering\nconst escapeHtml = (str) => str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));\nres.send(escapeHtml(userInput));`,
            explanation: "HTML-encode all user input before rendering to prevent XSS.",
          },
          "Path Traversal": {
            code: `// Fix: Validate and sanitize file paths\nconst path = require('path');\nconst safePath = path.resolve(baseDir, userInput);\nif (!safePath.startsWith(baseDir)) throw new Error('Invalid path');`,
            explanation: "Validate that resolved path stays within allowed directory.",
          },
        };
        const template = templates[f.category] || {
          code: `// Apply input validation + output encoding\n// Sanitize all user inputs\n// Use security headers\n// Implement rate limiting`,
          explanation: "Apply defense-in-depth: input validation, output encoding, security headers, and rate limiting.",
        };
        fixCode = template.code;
        fixExplanation = template.explanation;
      }

      // Update the finding with remediation
      await db.finding.update({
        where: { id: f.id as string },
        data: { remediation: `FIX CODE:\n${fixCode}\n\nEXPLANATION:\n${fixExplanation}` },
      });

      remediations.push({
        finding_id: f.id as string,
        title: f.title as string,
        severity: f.severity as string,
        fix_code: fixCode,
        fix_explanation: fixExplanation,
        language: f.category === "SQL Injection" ? "javascript" : "javascript",
      });
    }

    return NextResponse.json({
      ok: true,
      remediations,
      count: remediations.length,
      message: `Generated remediation code for ${remediations.length} finding(s). Fixes saved to findings and included in VAPT report.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
