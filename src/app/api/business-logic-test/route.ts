import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() { if (!zaiPromise) zaiPromise = ZAI.create(); return zaiPromise; }

// POST /api/business-logic-test — AI generates business logic attack scenarios.
// Body: { targetUrl, description? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { targetUrl } = body;
  const base = targetUrl || "http://localhost:3004";

  // Crawl endpoints
  const endpoints = ["/login", "/api/login", "/api/user/1", "/api/user/2", "/comments", "/redirect", "/admin"];

  const z = await sdk();
  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: "You are a business logic penetration tester. Given a list of endpoints, identify business logic vulnerabilities: race conditions, price manipulation, workflow bypass, privilege escalation, IDOR chains. Respond with STRICT JSON only." },
      { role: "user", content: `Target: ${base}\nEndpoints: ${JSON.stringify(endpoints)}\n\nGenerate business logic test scenarios. Respond with: {"tests":[{"title":string,"category":"race_condition|price_manipulation|workflow_bypass|privilege_escalation|idor_chain","description":string,"steps":[string],"severity":"critical|high|medium"}]}` },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { tests?: Array<{ title: string; category: string; description: string; steps: string[]; severity: string }> };
  try {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.search(/[[{]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
    parsed = JSON.parse(s);
  } catch { parsed = { tests: [] }; }

  return NextResponse.json({
    target: base,
    tests: parsed.tests || [],
    total: (parsed.tests || []).length,
    categories: [...new Set((parsed.tests || []).map(t => t.category))],
  });
}
