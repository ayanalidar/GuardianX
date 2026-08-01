import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/rollback/[patchId] — rolls back an approved patch
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ patchId: string }> }
) {
  const { patchId } = await params;

  try {
    const patch = await db.patch.findFirst({
      where: { OR: [{ patchId }, { id: patchId }] },
      select: { id: true, patchId: true, status: true, originalCode: true, patchedCode: true, codebaseId: true, title: true },
    });

    if (!patch) {
      return NextResponse.json({ error: "Patch not found" }, { status: 404 });
    }

    if (patch.status !== "approved") {
      return NextResponse.json({ error: "Only approved patches can be rolled back" }, { status: 400 });
    }

    // Revert codebase to original code
    if (patch.originalCode) {
      await db.codebase.update({
        where: { id: patch.codebaseId as string },
        data: { sourceCode: patch.originalCode as string },
      });
    }

    // Set patch back to pending
    await db.patch.update({
      where: { id: patch.id as string },
      data: { status: "pending", approvedAt: null },
    });

    // Log to audit trail
    const { randomUUID } = await import("node:crypto");
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        action: "patch_rollback",
        entity: patch.patchId as string,
        details: JSON.stringify({ title: patch.title, revertedTo: "original_code" }),
      },
    });

    return NextResponse.json({
      ok: true,
      patch_id: patch.patchId,
      title: patch.title,
      status: "rolled_back",
      message: `Patch ${patch.patchId} rolled back. Codebase reverted to original code.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
