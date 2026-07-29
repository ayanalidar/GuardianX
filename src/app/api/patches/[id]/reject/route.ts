import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/reject
// Marks a pending patch as rejected (will not be applied).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const patch = await db.patch.findFirst({
      where: {
        OR: [{ patchId: id }, { id }],
      },
    });

    if (!patch) {
      return NextResponse.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }

    if (patch.status !== "pending") {
      return NextResponse.json(
        {
          error: `Patch is already ${patch.status}`,
          patch_id: patch.patchId,
          status: patch.status,
        },
        { status: 409 }
      );
    }

    const updated = await db.patch.update({
      where: { id: patch.id },
      data: { status: "rejected" },
    });

    return NextResponse.json({
      patch_id: updated.patchId,
      status: updated.status,
      message: "Patch rejected.",
    });
  } catch (error) {
    console.error(`[POST /api/patches/${id}/reject] error:`, error);
    return NextResponse.json(
      { error: "Failed to reject patch" },
      { status: 500 }
    );
  }
}
