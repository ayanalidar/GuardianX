import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/activity-feed — aggregates real recent events from ALL services
// Returns a unified timeline of everything happening across GuardianX:
// scans, engagements, patches, findings, canaries, engagements, attestations
export async function GET() {
  try {
    const events: Array<{
      id: string;
      type: "scan" | "engagement" | "patch" | "finding" | "canary" | "attestation" | "system";
      action: string;
      client: string;
      detail: string;
      severity: "info" | "success" | "warning" | "error";
      ts: string;
    }> = [];

    // ── 1. Recent scans (SAST) ──────────────────────────────────────────────
    const scans = await db.scan.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { codebase: { select: { name: true, clientId: true } } },
    });

    for (const s of scans) {
      const cb = s.codebase as Record<string, unknown> | null;
      const clientName = cb?.clientId ? await getClientName(cb.clientId as string) : "Unassigned";
      events.push({
        id: `scan-${s.id}`,
        type: "scan",
        action: s.status === "completed" ? "scan_completed" : s.status === "failed" ? "scan_failed" : "scan_started",
        client: clientName,
        detail: `SAST scan on ${cb?.name || "unknown"} — ${s.stageLabel || s.status}`,
        severity: s.status === "completed" ? "success" : s.status === "failed" ? "error" : "info",
        ts: (s.startedAt as Date).toISOString(),
      });
      if (s.completedAt) {
        events.push({
          id: `scan-${s.id}-done`,
          type: "scan",
          action: "scan_finished",
          client: clientName,
          detail: `Scan finished — ${s.status}`,
          severity: s.status === "completed" ? "success" : "error",
          ts: (s.completedAt as Date).toISOString(),
        });
      }
    }

    // ── 2. Recent patches ───────────────────────────────────────────────────
    const patches = await db.patch.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { codebase: { select: { name: true, clientId: true } } },
    });

    for (const p of patches) {
      const cb = p.codebase as Record<string, unknown> | null;
      const clientName = cb?.clientId ? await getClientName(cb.clientId as string) : "Unassigned";
      events.push({
        id: `patch-${p.id}`,
        type: "patch",
        action: p.status === "approved" ? "patch_approved" : p.status === "rejected" ? "patch_rejected" : "patch_created",
        client: clientName,
        detail: `${p.severity?.toUpperCase() || "UNKNOWN"} patch: ${p.title} (${p.patchId})`,
        severity: p.status === "approved" ? "success" : p.status === "rejected" ? "warning" : p.severity === "critical" ? "error" : "info",
        ts: (p.createdAt as Date).toISOString(),
      });
      if (p.approvedAt) {
        events.push({
          id: `patch-${p.id}-approved`,
          type: "patch",
          action: "patch_deployed",
          client: clientName,
          detail: `Patch deployed to runtime: ${p.title}`,
          severity: "success",
          ts: (p.approvedAt as Date).toISOString(),
        });
      }
    }

    // ── 3. Recent engagements (DAST) ─────────────────────────────────────────
    const engagements = await db.engagement.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { target: { select: { name: true, clientId: true } } },
    });

    for (const e of engagements) {
      const tgt = e.target as Record<string, unknown> | null;
      const clientName = tgt?.clientId ? await getClientName(tgt.clientId as string) : "Unassigned";
      events.push({
        id: `eng-${e.id}`,
        type: "engagement",
        action: e.status === "completed" ? "engagement_completed" : e.status === "failed" ? "engagement_failed" : "engagement_started",
        client: clientName,
        detail: `DAST VAPT on ${tgt?.name || "unknown"} — ${e.stageLabel || e.status}`,
        severity: e.status === "completed" ? "success" : e.status === "failed" ? "error" : "info",
        ts: (e.startedAt as Date).toISOString(),
      });
    }

    // ── 4. Recent findings ──────────────────────────────────────────────────
    const findings = await db.finding.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { engagement: { include: { target: { select: { name: true, clientId: true } } } } },
    });

    for (const f of findings) {
      const eng = f.engagement as Record<string, unknown> | null;
      const tgt = eng?.target as Record<string, unknown> | null;
      const clientName = tgt?.clientId ? await getClientName(tgt.clientId as string) : "Unassigned";
      events.push({
        id: `finding-${f.id}`,
        type: "finding",
        action: "finding_detected",
        client: clientName,
        detail: `${f.severity?.toUpperCase() || "UNKNOWN"} finding: ${f.title} on ${f.endpoint}`,
        severity: f.severity === "critical" ? "error" : f.severity === "high" ? "warning" : "info",
        ts: (f.createdAt as Date).toISOString(),
      });
    }

    // ── 5. Recent canaries ──────────────────────────────────────────────────
    const canaries = await db.canary.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const c of canaries) {
      const clientName = c.targetId ? await getClientNameByTarget(c.targetId as string) : "Unassigned";
      events.push({
        id: `canary-${c.id}`,
        type: "canary",
        action: c.detected ? "canary_triggered" : "canary_deployed",
        client: clientName,
        detail: `Canary "${c.label}" ${c.detected ? "TRIGGERED — data exfiltration detected!" : "deployed"} on ${c.injectedEndpoint}`,
        severity: c.detected ? "error" : "info",
        ts: (c.createdAt as Date).toISOString(),
      });
    }

    // ── 6. Recent attestations ──────────────────────────────────────────────
    const attestations = await db.attestation.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const a of attestations) {
      events.push({
        id: `att-${a.id}`,
        type: "attestation",
        action: "attestation_created",
        client: "System",
        detail: `Cryptographic attestation added to hash chain — patch ${a.patchId}`,
        severity: "success",
        ts: (a.createdAt as Date).toISOString(),
      });
    }

    // ── Sort all events by timestamp (most recent first) ─────────────────────
    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    // ── Compute active processes (currently running) ─────────────────────────
    const activeScans = scans.filter((s) => s.status === "queued" || s.status === "analyzing" || s.status === "patching" || s.status === "sandboxing");
    const activeEngagements = engagements.filter((e) => e.status === "queued" || e.status === "crawling" || e.status === "planning" || e.status === "attacking" || e.status === "analyzing");
    const pendingPatches = patches.filter((p) => p.status === "pending");

    return NextResponse.json({
      events: events.slice(0, 50),
      active_processes: {
        sast_scans: activeScans.length,
        dast_engagements: activeEngagements.length,
        pending_patches: pendingPatches.length,
        total_active: activeScans.length + activeEngagements.length,
      },
      active_details: {
        scans: activeScans.map((s) => ({
          id: s.id,
          status: s.status,
          stage: s.stageLabel,
          codebase: (s.codebase as Record<string, unknown>)?.name,
        })),
        engagements: activeEngagements.map((e) => ({
          id: e.id,
          status: e.status,
          stage: e.stageLabel,
          target: (e.target as Record<string, unknown>)?.name,
        })),
      },
      stats: {
        total_events: events.length,
        critical: events.filter((e) => e.severity === "error").length,
        warnings: events.filter((e) => e.severity === "warning").length,
        successes: events.filter((e) => e.severity === "success").length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load activity feed" },
      { status: 500 }
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function getClientName(clientId: string): Promise<string> {
  try {
    const c = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
    return c?.name || "Unassigned";
  } catch {
    return "Unassigned";
  }
}

async function getClientNameByTarget(targetId: string): Promise<string> {
  try {
    const t = await db.target.findUnique({ where: { id: targetId }, select: { clientId: true } });
    if (!t?.clientId) return "Unassigned";
    return await getClientName(t.clientId as string);
  } catch {
    return "Unassigned";
  }
}
