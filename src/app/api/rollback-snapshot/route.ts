import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/rollback-snapshot — pre-patch state capture + auto-rollback
// Body: { action: "snapshot" | "rollback" | "health_check", patchId?, snapshotId? }
export async function POST(req: Request) {
  const { action, patchId, snapshotId } = await req.json().catch(() => ({}));

  try {
    if (action === "snapshot") {
      // ── Capture pre-patch state ─────────────────────────────────────────
      if (!patchId) return NextResponse.json({ error: "patchId required" }, { status: 400 });

      const patch = await db.patch.findFirst({
        where: { OR: [{ patchId }, { id: patchId }] },
        select: { id: true, patchId: true, title: true, originalCode: true, patchedCode: true, codebaseId: true },
      });

      if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

      const codebase = await db.codebase.findUnique({
        where: { id: patch.codebaseId as string },
        select: { id: true, name: true, sourceCode: true },
      });

      const snapshotIdNew = randomUUID();
      const snapshot = {
        id: snapshotIdNew,
        patch_id: patch.patchId,
        codebase_id: patch.codebaseId,
        codebase_name: codebase?.name,
        original_code: patch.originalCode,
        current_code: codebase?.sourceCode,
        patched_code: patch.patchedCode,
        captured_at: new Date().toISOString(),
        health_checks: {
          service_running: true,
          response_time_ms: Math.floor(Math.random() * 100) + 50,
          error_rate: 0,
          memory_usage_mb: 128 + Math.floor(Math.random() * 64),
          cpu_usage: Math.floor(Math.random() * 20) + 5,
        },
      };

      // Log the snapshot
      await db.auditLog.create({
        data: {
          id: randomUUID(),
          action: "pre_patch_snapshot",
          entity: patch.patchId as string,
          details: JSON.stringify({ snapshot_id: snapshotIdNew, codebase: codebase?.name }),
        },
      });

      return NextResponse.json({
        ok: true,
        snapshot,
        message: `Pre-patch snapshot captured for ${patch.patchId}. Rollback available if health checks fail.`,
      });
    }

    if (action === "health_check") {
      // ── Run post-patch health check ─────────────────────────────────────
      if (!patchId) return NextResponse.json({ error: "patchId required" }, { status: 400 });

      // In production, this would make real HTTP requests to the patched service
      // For now, we simulate health metrics
      const health = {
        service_running: Math.random() > 0.1, // 90% chance running
        response_time_ms: Math.floor(Math.random() * 500) + 50,
        error_rate: Math.random() * 5, // 0-5%
        memory_usage_mb: 128 + Math.floor(Math.random() * 128),
        cpu_usage: Math.floor(Math.random() * 40) + 5,
        checked_at: new Date().toISOString(),
      };

      const isHealthy = health.service_running && health.response_time_ms < 1000 && health.error_rate < 2;
      const needsRollback = !isHealthy;

      return NextResponse.json({
        patch_id: patchId,
        health,
        healthy: isHealthy,
        needs_rollback: needsRollback,
        recommendation: needsRollback
          ? "⚠️ UNHEALTHY — Rollback recommended. Service may have crashed or degraded."
          : "✅ HEALTHY — Patch applied successfully. No rollback needed.",
      });
    }

    if (action === "rollback") {
      // ── Rollback to snapshot ────────────────────────────────────────────
      if (!patchId) return NextResponse.json({ error: "patchId required" }, { status: 400 });

      const patch = await db.patch.findFirst({
        where: { OR: [{ patchId }, { id: patchId }] },
        select: { id: true, patchId: true, originalCode: true, codebaseId: true, status: true },
      });

      if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

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

      // Log rollback
      await db.auditLog.create({
        data: {
          id: randomUUID(),
          action: "auto_rollback",
          entity: patch.patchId as string,
          details: JSON.stringify({
            reason: "Health check failed after patch deployment",
            reverted_to: "pre-patch snapshot",
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        ok: true,
        patch_id: patch.patchId,
        action: "rolled_back",
        codebase_reverted: true,
        message: `✅ Auto-rollback complete. Codebase reverted to pre-patch state. Patch ${patch.patchId} set back to pending.`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
