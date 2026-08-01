import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineCall } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/attack-replay, replays a stored exploit against the current (patched) code
// to verify the fix still holds after code changes
// Body: { patchId: string }
export async function POST(req: Request) {
  const { patchId } = await req.json().catch(() => ({}));
  if (!patchId) return NextResponse.json({ error: "patchId required" }, { status: 400 });

  try {
    const patch = await db.patch.findFirst({
      where: { OR: [{ patchId }, { id: patchId }] },
      select: { id: true, patchId: true, title: true, exploitCode: true, status: true, codebaseId: true },
    });

    if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });
    if (!patch.exploitCode) return NextResponse.json({ error: "No exploit stored for this patch" }, { status: 400 });

    // Get current codebase code (may have been modified since patch)
    const codebase = await db.codebase.findUnique({
      where: { id: patch.codebaseId as string },
      select: { sourceCode: true, name: true },
    });

    if (!codebase) return NextResponse.json({ error: "Codebase not found" }, { status: 404 });

    // Run exploit against current code via engine
    const result = await engineCall("/api/run-exploit", { patchId: patch.id, target: "patched" });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.error,
        message: "Replay failed, engine unreachable",
      }, { status: 502 });
    }

    const exploitResult = result.data as { success: boolean; blocked: boolean; detail: string };

    return NextResponse.json({
      ok: true,
      patch_id: patch.patchId,
      title: patch.title,
      replay_result: exploitResult.blocked ? "BLOCKED" : exploitResult.success ? "EXPLOITED" : "INCONCLUSIVE",
      verdict: exploitResult.blocked
        ? "✅ Fix holds, exploit was blocked against current code"
        : exploitResult.success
          ? "⚠️ REGRESSION, exploit succeeded! Fix may have been reverted."
          : "Inconclusive, needs manual review",
      detail: exploitResult.detail,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
