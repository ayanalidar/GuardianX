import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() { if (!zaiPromise) zaiPromise = ZAI.create(); return zaiPromise; }

// GET /api/attack-chains — list all synthesized attack chains
export async function GET() {
  const chains = await db.attackChain.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json((chains || []).map((c: Record<string, unknown>) => {
    let steps: unknown = [];
    let findingIds: unknown = [];
    try {
      const stepsRaw = (c.steps as string) || "[]";
      if (stepsRaw.startsWith("[")) {
        steps = JSON.parse(stepsRaw);
      } else {
        steps = [];
      }
    } catch { steps = []; }
    try {
      const idsRaw = (c.findingIds as string) || "[]";
      if (idsRaw.startsWith("[")) {
        findingIds = JSON.parse(idsRaw);
      } else if (idsRaw.includes(",")) {
        findingIds = idsRaw.split(",").map((s: string) => s.trim());
      } else {
        findingIds = [];
      }
    } catch { findingIds = []; }
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      severity: c.severity,
      steps,
      findingIds,
      created_at: (c.createdAt as Date).toISOString(),
    };
  }));
}

// POST /api/attack-chains — AI-synthesize attack chains from current findings
export async function POST() {
  const patches = await db.patch.findMany({ where: { status: "pending" }, select: { patchId: true, title: true, severity: true, cve: true, affectedFile: true, aiExplanation: true } });
  const findings = await db.finding.findMany({ select: { id: true, title: true, severity: true, category: true, endpoint: true, description: true } });

  if (patches.length === 0 && findings.length === 0) {
    return NextResponse.json({ chains: [], message: "No findings to chain." });
  }

  const z = await sdk();
  const allFindings = [
    ...patches.map(p => ({ id: p.patchId, type: "SAST", title: p.title, severity: p.severity, detail: p.aiExplanation, file: p.affectedFile })),
    ...findings.map(f => ({ id: f.id, type: "DAST", title: f.title, severity: f.severity, detail: f.description, endpoint: f.endpoint })),
  ];

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: "You are a senior penetration tester. Given a list of security findings, identify attack chains — sequences of 2-4 vulnerabilities that when combined lead to full system compromise. Respond with STRICT JSON only." },
      { role: "user", content: `Findings:\n${JSON.stringify(allFindings, null, 2)}\n\nSynthesize attack chains. Respond with: {"chains":[{"title":string,"description":string,"severity":"critical|high|medium","steps":[{"step":number,"finding_id":string,"action":string,"result":string}]}]}` },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { chains?: Array<{ title: string; description: string; severity: string; steps: unknown[] }> };
  try {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.search(/[[{]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
    parsed = JSON.parse(s);
  } catch { parsed = { chains: [] }; }

  const created: Array<{ id: string; title: string; severity: string }> = [];
  for (const chain of (parsed.chains || []).slice(0, 5)) {
    const c = await db.attackChain.create({
      data: { title: chain.title, description: chain.description, severity: chain.severity, steps: JSON.stringify(chain.steps || []), findingIds: JSON.stringify(allFindings.map(f => f.id)) },
    });
    created.push(c);
  }

  return NextResponse.json({ chains: created, total: created.length });
}
