import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/[id]
// Returns the full detail of a single patch, including diff payload and sandbox logs.
export async function GET(
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

    const payload = {
      patch_id: patch.patchId,
      internal_id: patch.id,
      title: patch.title,
      severity: patch.severity,
      cve: patch.cve,
      affected_file: patch.affectedFile,
      ai_explanation: patch.aiExplanation,
      diff_payload: patch.diffPayload,
      sandbox_logs: patch.sandboxLogs,
      sandbox_passed: patch.sandboxPassed,
      status: patch.status,
      created_at: patch.createdAt.toISOString(),
      approved_at: patch.approvedAt?.toISOString() ?? null,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error(`[GET /api/patches/${id}] error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch patch detail" },
      { status: 500 }
    );
  }
}
