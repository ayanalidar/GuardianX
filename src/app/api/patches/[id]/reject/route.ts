import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/reject
export async function POST(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

  const updated = await db.patch.update({
    where: { id: patch.id },
    data: { status: "rejected" },
  });

  return NextResponse.json({
    patch_id: updated.patchId,
    status: updated.status,
    message: "Patch rejected.",
  });
}
