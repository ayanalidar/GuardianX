import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// GET /api/patches/[id], full patch detail incl. chat history, exploit + adversarial transcript.
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: {
      codebase: { select: { id: true, name: true } },
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

  // New auto-remediation-enhance fields are nullable; read defensively.
  const p = patch as Record<string, unknown>;
  const language = typeof p.language === "string" ? p.language : "javascript";
  const supersedes = typeof p.supersedes === "string" ? p.supersedes : null;
  const patchExplanation = safeJson(p.patchExplanation as string | null, null);
  const confidenceBreakdown = safeJson(p.confidenceBreakdown as string | null, null);
  const multiVectorSandbox = safeJson(p.multiVectorSandbox as string | null, null);

  return NextResponse.json({
    patch_id: patch.patchId,
    internal_id: patch.id,
    codebase: patch.codebase,
    title: patch.title,
    severity: patch.severity,
    cve: patch.cve,
    affected_file: patch.affectedFile,
    ai_explanation: patch.aiExplanation,
    ai_reasoning: patch.aiReasoning,
    confidence: patch.confidence,
    original_code: patch.originalCode,
    patched_code: patch.patchedCode,
    diff_payload: patch.diffPayload,
    test_code: patch.testCode,
    sandbox_logs: patch.sandboxLogs,
    sandbox_passed: patch.sandboxPassed,
    // exploit playground
    exploit_code: patch.exploitCode ?? null,
    exploit_original_result: safeJson(patch.exploitOriginalResult as string | null, null),
    exploit_patched_result: safeJson(patch.exploitPatchedResult as string | null, null),
    // adversarial arena
    adversarial_rounds: patch.adversarialRounds,
    adversarial_won: patch.adversarialWon,
    adversarial_transcript: safeJson(patch.adversarialTranscript as string | null, []),
    status: patch.status,
    created_at: (patch.createdAt as Date).toISOString(),
    approved_at: (patch.approvedAt as Date | null)?.toISOString() ?? null,
    chat: (patch.chatMessages as Array<{ id: string; role: string; content: string; createdAt: Date }>).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.createdAt.toISOString(),
    })),
    // ── auto-remediation-enhance ───────────────────────────────────────
    language,
    patch_explanation: patchExplanation,
    confidence_breakdown: confidenceBreakdown,
    multi_vector_sandbox: multiVectorSandbox,
    supersedes,
  });
}

