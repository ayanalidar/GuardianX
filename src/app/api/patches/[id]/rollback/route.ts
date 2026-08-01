import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/rollback, revert an approved patch.
// Restores the original (vulnerable) code to the codebase, marks the patch
// as "rolled-back", and records the rollback timestamp + reason.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "Manual rollback";

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });
  if (patch.status !== "approved") {
    return NextResponse.json(
      { error: `Cannot rollback, patch status is "${patch.status}" (only approved patches can be rolled back)` },
      { status: 409 }
    );
  }

  // Restore the original code to the codebase
  await db.codebase.update({
    where: { id: patch.codebaseId },
    data: { sourceCode: patch.originalCode },
  });

  // Mark the patch as rolled-back
  const updated = await db.patch.update({
    where: { id: patch.id },
    data: {
      status: "rolled-back",
      // Store rollback metadata in a comment-style field, we don't have a
      // dedicated column, so we use the aiReasoning field appended with rollback info.
      aiReasoning: `${patch.aiReasoning}\n\n[ROLLBACK ${new Date().toISOString()}] Reason: ${reason}`,
    },
  });

  return NextResponse.json({
    patch_id: updated.patchId,
    status: updated.status,
    message: `Patch rolled back. The codebase has been restored to its original (pre-patch) state. The vulnerability is now re-exposed, consider re-scanning.`,
    reason,
    rolled_back_at: new Date().toISOString(),
  });
}
