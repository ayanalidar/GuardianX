import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE /api/scans/[id], remove a scan record (cascades to patches + events
// per the Prisma schema's onDelete: Cascade on Scan.patches / Scan.events).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = getUserFromRequest(req);

  try {
    // Fetch the codebaseId BEFORE deleting so we can record it in the audit trail.
    const existing = await db.scan.findUnique({
      where: { id },
      select: { codebaseId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    await db.scan.delete({ where: { id } });

    // Audit AFTER the delete succeeds — never mask the success.
    await auditLog("scan.deleted", "scan", user?.email ?? "anonymous", {
      scanId: id,
      codebaseId: existing.codebaseId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete scan" },
      { status: 500 }
    );
  }
}
