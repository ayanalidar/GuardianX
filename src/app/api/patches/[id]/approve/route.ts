import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/approve — apply the patch to the codebase.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });
  if (patch.status !== "pending") {
    return NextResponse.json(
      { error: `Patch already ${patch.status}`, patch_id: patch.patchId, status: patch.status },
      { status: 409 }
    );
  }

  // "Apply" the patch: update the codebase source to the patched version.
  const updated = await db.patch.update({
    where: { id: patch.id },
    data: { status: "approved", approvedAt: new Date() },
  });

  if (patch.patchedCode) {
    await db.codebase.update({
      where: { id: patch.codebaseId },
      data: { sourceCode: patch.patchedCode },
    });
  }

  return NextResponse.json({
    patch_id: updated.patchId,
    status: updated.status,
    approved_at: updated.approvedAt?.toISOString(),
    message: "Patch approved and applied to the codebase source.",
  });
}
