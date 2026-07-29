import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/pending
// Returns all patches that are pending human review.
export async function GET() {
  try {
    const patches = await db.patch.findMany({
      where: { status: "pending" },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        patchId: true,
        title: true,
        severity: true,
        cve: true,
        affectedFile: true,
        aiExplanation: true,
        sandboxPassed: true,
        createdAt: true,
      },
    });

    // Map internal camelCase fields to the snake_case contract the frontend expects.
    const payload = patches.map((p) => ({
      patch_id: p.patchId,
      internal_id: p.id,
      title: p.title,
      severity: p.severity,
      cve: p.cve,
      affected_file: p.affectedFile,
      ai_explanation: p.aiExplanation,
      sandbox_passed: p.sandboxPassed,
      created_at: p.createdAt.toISOString(),
    }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/patches/pending] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending patches" },
      { status: 500 }
    );
  }
}
