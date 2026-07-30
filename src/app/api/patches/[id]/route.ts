import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// GET /api/patches/[id] — full patch detail incl. chat history, exploit + adversarial transcript.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: {
      codebase: { select: { id: true, name: true } },
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

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
    exploit_original_result: safeJson(patch.exploitOriginalResult, null),
    exploit_patched_result: safeJson(patch.exploitPatchedResult, null),
    // adversarial arena
    adversarial_rounds: patch.adversarialRounds,
    adversarial_won: patch.adversarialWon,
    adversarial_transcript: safeJson(patch.adversarialTranscript, []),
    status: patch.status,
    created_at: patch.createdAt.toISOString(),
    approved_at: patch.approvedAt?.toISOString() ?? null,
    chat: patch.chatMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.createdAt.toISOString(),
    })),
  });
}

