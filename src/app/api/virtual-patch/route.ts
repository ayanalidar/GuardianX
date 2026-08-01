import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/virtual-patch, generates and deploys virtual patches (WAF/iptables rules)
// when a live codebase can't be updated immediately
// Body: { findingId?, clientId?, target?: "modsecurity" | "cloudflare" | "iptables" | "nginx" }
export async function POST(req: Request) {
  const { findingId, clientId, target = "all" } = await req.json().catch(() => ({}));

  try {
    // Gather findings to patch
    let findings: { id: string; title: string; category: string; endpoint: string; payload: string | null; severity: string }[] = [];

    if (findingId) {
      const f = await db.finding.findFirst({ where: { id: findingId }, select: { id: true, title: true, category: true, endpoint: true, payload: true, severity: true } });
      if (f) findings = [f as typeof findings[0]];
    } else {
      const codebaseFilter = clientId ? { clientId } : {};
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
      return NextResponse.json({ ok: true, rules: {}, message: "No findings to virtually patch." });
    }

    // Generate rules for each target type
    const rules: Record<string, string> = {};

    // ── ModSecurity rules ─────────────────────────────────────────────────
    if (target === "all" || target === "modsecurity") {
      rules.modsecurity = findings.map((f, i) => {
        const endpoint = f.endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const payloadPattern = f.payload ? f.payload.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
        return `# Virtual patch for: ${f.title}
SecRule REQUEST_URI "${endpoint}" \\
  "id:${10000 + i},\\
  phase:2,\\
  deny,\\
  log,\\
  msg:'Virtual Patch: ${f.title}',\\
  severity:${f.severity === "critical" ? "CRITICAL" : f.severity === "high" ? "WARNING" : "NOTICE"},\\
  tag:'virtual-patch'"${payloadPattern ? `\nSecRule ARGS|REQUEST_BODY "${payloadPattern}" "id:${10000 + i + 100},deny,log,msg:'Block payload for ${f.title}'"` : ""}`;
      }).join("\n\n");
    }

    // ── Cloudflare WAF rules ──────────────────────────────────────────────
    if (target === "all" || target === "cloudflare") {
      rules.cloudflare = findings.map((f) => {
        const endpoint = f.endpoint.replace(/"/g, '\\"');
        return `# Virtual patch for: ${f.title}
(http.request.uri.path eq "${endpoint}") or (${f.payload ? `http.request.body contains "${f.payload.slice(0, 50)}"` : "0"})`;
      }).join("\n");
    }

    // ── iptables rules ────────────────────────────────────────────────────
    if (target === "all" || target === "iptables") {
      rules.iptables = findings.map((f, i) => {
        // Block requests to the vulnerable endpoint
        return `# Virtual patch for: ${f.title}
iptables -A INPUT -m string --string "${f.endpoint}" --algo bm -j DROP
# Rule ID: vp-${i + 1}, ${f.severity}`;
      }).join("\n");
    }

    // ── Nginx rules ───────────────────────────────────────────────────────
    if (target === "all" || target === "nginx") {
      rules.nginx = findings.map((f) => {
        const endpoint = f.endpoint.replace(/[{}^$\\.*+?()|[\]]/g, "");
        return `# Virtual patch for: ${f.title}
location ${endpoint} {
  if ($request_method = POST) {
    return 403;
  }
  # Block known malicious payloads
  if ($args ~* "${f.payload?.slice(0, 30) || "MALICIOUS"}") {
    return 403;
  }
}`;
      }).join("\n\n");
    }

    // AI explanation of the virtual patches
    let explanation = "";
    try {
      const zai = await ZAI.create();
      const prompt = `Explain these virtual WAF patches in 2-3 sentences. What do they block and why?

Findings patched:
${findings.map((f) => `- ${f.title} (${f.severity}) on ${f.endpoint}`).join("\n")}

Target systems: ${Object.keys(rules).join(", ")}`;

      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
      });
      explanation = response.choices[0]?.message?.content || "";
    } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      findings_patched: findings.length,
      rules,
      explanation,
      targets: Object.keys(rules),
      message: `Virtual patches generated for ${findings.length} finding(s) across ${Object.keys(rules).length} WAF target(s).`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
