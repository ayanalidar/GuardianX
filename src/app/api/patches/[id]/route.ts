import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/[id] — full patch detail incl. chat history.
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
