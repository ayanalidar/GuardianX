import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// POST /api/patches/[id]/copilot, AI remediation copilot.
// Body: { action: "generate-fix" | "explain" | "hardened-fix", instruction?: string }
// Returns: { code?, explanation, suggestions }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "generate-fix" || body?.action === "explain" || body?.action === "hardened-fix"
    ? body.action : "explain";
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: { codebase: { select: { name: true } } },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

  const z = await sdk();

  let system: string;
  let user: string;

  if (action === "generate-fix" || action === "hardened-fix") {
    system = [
      "You are GuardianX's Remediation Copilot. You write improved, production-ready security fixes.",
      "Given the original vulnerable code and the current patch, produce an IMPROVED version that is more robust.",
      action === "hardened-fix"
        ? "Focus on defense-in-depth: add input validation, rate limiting, logging, and fail-safe defaults."
        : "Focus on correctness, minimal changes, and clarity.",
      "Respond with STRICT JSON only.",
    ].join(" ");
    user = [
      `File: ${patch.codebase.name}`,
      `Vulnerability: ${patch.title} (${patch.severity})`,
      "",
      "Original vulnerable code:",
      "```js",
      patch.originalCode,
      "```",
      "",
      "Current patch:",
      "```js",
      patch.patchedCode,
      "```",
      "",
      instruction ? `Additional instruction: ${instruction}` : "No additional instruction.",
      "",
      'Respond with: {"code":string,"explanation":string,"suggestions":[string]}',
      "- code: the COMPLETE improved file.",
      "- explanation: under 100 words on what you changed and why.",
      "- suggestions: 2-4 bullet points for further hardening.",
    ].join("\n");
  } else { // explain
    // explain
    system = "You are GuardianX's Remediation Copilot. Explain security patches clearly to developers. Respond with STRICT JSON.";
    user = [
      `File: ${patch.codebase.name}`,
      `Vulnerability: ${patch.title} (${patch.severity})`,
      "",
      "Original code:",
      "```js",
      patch.originalCode.slice(0, 1500),
      "```",
      "",
      "Patched code:",
      "```js",
      patch.patchedCode.slice(0, 1500),
      "```",
      "",
      'Explain the fix. Respond with: {"explanation":string,"suggestions":[string]}',
      "- explanation: under 150 words, developer-friendly.",
      "- suggestions: 2-4 actionable next steps.",
    ].join("\n");
  }

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: { code?: string; explanation?: string; suggestions?: string[] };
  try {
    // strip code fences
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.search(/[[{]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
    parsed = JSON.parse(s);
  } catch {
    parsed = { explanation: raw.slice(0, 500), suggestions: [] };
  }

  return NextResponse.json({
    action,
    code: parsed.code ?? null,
    explanation: parsed.explanation ?? "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  });
}
