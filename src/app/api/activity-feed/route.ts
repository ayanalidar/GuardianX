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

    // ── 0. Batch-fetch all client names (1 query instead of N) ─────────────
    const allClients = await db.client.findMany({ select: { id: true, name: true } });
    const clientNameMap: Record<string, string> = {};
    for (const c of allClients) {
      clientNameMap[c.id as string] = c.name as string;
    }
    const getClientNameFast = (clientId: string | null | undefined) =>
      (clientId && clientNameMap[clientId]) || "Unassigned";

    // ── 1. Recent scans (SAST) — batch-resolve codebase → client ────────────
    const scans = await db.scan.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    });

    // Batch-fetch codebases for these scans
    const scanCbIds = [...new Set(scans.map((s: Record<string, unknown>) => s.codebaseId as string).filter(Boolean))];
    const scanCodebases = scanCbIds.length > 0
      ? await db.codebase.findMany({ where: { id: { in: scanCbIds } }, select: { id: true, name: true, clientId: true } })
      : [];
    const cbMap: Record<string, Record<string, unknown>> = {};
    for (const cb of scanCodebases) { cbMap[cb.id as string] = cb as Record<string, unknown>; }

    for (const s of scans) {
      const sr = s as Record<string, unknown>;
      const cb = cbMap[sr.codebaseId as string];
      const clientName = getClientNameFast(cb?.clientId as string);
      events.push({
        id: `scan-${sr.id}`,
        type: "scan",
        action: sr.status === "completed" ? "scan_completed" : sr.status === "failed" ? "scan_failed" : "scan_started",
        client: clientName,
        detail: `SAST scan on ${cb?.name || "unknown"} — ${sr.stageLabel || sr.status}`,
        severity: sr.status === "completed" ? "success" : sr.status === "failed" ? "error" : "info",
        ts: (sr.startedAt as Date).toISOString(),
      });
      if (sr.completedAt) {
        events.push({
          id: `scan-${sr.id}-done`,
          type: "scan",
          action: "scan_finished",
          client: clientName,
          detail: `Scan finished — ${sr.status}`,
          severity: sr.status === "completed" ? "success" : "error",
          ts: (sr.completedAt as Date).toISOString(),
        });
      }
    }

    // ── 2. Recent patches — batch-resolve codebase → client ─────────────────
    const patches = await db.patch.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    // Reuse cbMap from scans + fetch any additional codebases
    const patchCbIds = [...new Set(patches.map((p: Record<string, unknown>) => p.codebaseId as string).filter(Boolean))];
    const missingCbIds = patchCbIds.filter((id) => !cbMap[id]);
    if (missingCbIds.length > 0) {
      const extraCbs = await db.codebase.findMany({ where: { id: { in: missingCbIds } }, select: { id: true, name: true, clientId: true } });
      for (const cb of extraCbs) { cbMap[cb.id as string] = cb as Record<string, unknown>; }
    }

    for (const p of patches) {
      const pr = p as Record<string, unknown>;
      const cb = cbMap[pr.codebaseId as string];
      const clientName = getClientNameFast(cb?.clientId as string);
      events.push({
        id: `patch-${pr.id}`,
        type: "patch",
        action: pr.status === "approved" ? "patch_approved" : pr.status === "rejected" ? "patch_rejected" : "patch_created",
        client: clientName,
        detail: `${(pr.severity as string)?.toUpperCase() || "UNKNOWN"} patch: ${pr.title} (${pr.patchId})`,
        severity: pr.status === "approved" ? "success" : pr.status === "rejected" ? "warning" : pr.severity === "critical" ? "error" : "info",
        ts: (pr.createdAt as Date).toISOString(),
      });
      if (pr.approvedAt) {
        events.push({
          id: `patch-${pr.id}-approved`,
          type: "patch",
          action: "patch_deployed",
          client: clientName,
          detail: `Patch deployed to runtime: ${pr.title}`,
          severity: "success",
          ts: (pr.approvedAt as Date).toISOString(),
        });
      }
    }

    // ── 3. Recent engagements (DAST) — batch-resolve target → client ────────
    const engagements = await db.engagement.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    });

    const engTargetIds = [...new Set(engagements.map((e: Record<string, unknown>) => e.targetId as string).filter(Boolean))];
    const engTargets = engTargetIds.length > 0
      ? await db.target.findMany({ where: { id: { in: engTargetIds } }, select: { id: true, name: true, clientId: true } })
      : [];
    const targetMap: Record<string, Record<string, unknown>> = {};
    for (const t of engTargets) { targetMap[t.id as string] = t as Record<string, unknown>; }

    for (const e of engagements) {
      const er = e as Record<string, unknown>;
      const tgt = targetMap[er.targetId as string];
      const clientName = getClientNameFast(tgt?.clientId as string);
      events.push({
        id: `eng-${er.id}`,
        type: "engagement",
        action: er.status === "completed" ? "engagement_completed" : er.status === "failed" ? "engagement_failed" : "engagement_started",
        client: clientName,
        detail: `DAST VAPT on ${tgt?.name || "unknown"} — ${er.stageLabel || er.status}`,
        severity: er.status === "completed" ? "success" : er.status === "failed" ? "error" : "info",
        ts: (er.startedAt as Date).toISOString(),
      });
    }

    // ── 4. Recent findings (batch-resolve engagement → target → client) ─────
    const findings = await db.finding.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    // Batch-fetch engagements for these findings
    const findingEngIds = [...new Set(findings.map((f: Record<string, unknown>) => f.engagementId as string).filter(Boolean))];
    const findingEngagements = findingEngIds.length > 0
      ? await db.engagement.findMany({ where: { id: { in: findingEngIds } }, select: { id: true, targetId: true } })
      : [];
    const engToTarget: Record<string, string> = {};
    for (const e of findingEngagements) {
      engToTarget[e.id as string] = e.targetId as string;
    }

    // Batch-fetch targets for these engagements
    const findingTargetIds = [...new Set(Object.values(engToTarget).filter(Boolean))];
    const findingTargets = findingTargetIds.length > 0
      ? await db.target.findMany({ where: { id: { in: findingTargetIds } }, select: { id: true, clientId: true } })
      : [];
    const targetToClientForFindings: Record<string, string> = {};
    for (const t of findingTargets) {
      targetToClientForFindings[t.id as string] = getClientNameFast(t.clientId as string);
    }

    for (const f of findings) {
      const fr = f as Record<string, unknown>;
      const engId = fr.engagementId as string;
      const targetId = engToTarget[engId];
      const clientName = targetId ? (targetToClientForFindings[targetId] || "Unassigned") : "Unassigned";
      events.push({
        id: `finding-${fr.id}`,
        type: "finding",
        action: "finding_detected",
        client: clientName,
        detail: `${(fr.severity as string)?.toUpperCase() || "UNKNOWN"} finding: ${fr.title} on ${fr.endpoint}`,
        severity: fr.severity === "critical" ? "error" : fr.severity === "high" ? "warning" : "info",
        ts: (fr.createdAt as Date).toISOString(),
      });
    }

    // ── 5. Recent canaries ──────────────────────────────────────────────────
    const canaries = await db.canary.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // ── 5b. Batch-fetch target→client mapping for canaries ──────────────────
    const canaryTargetIds = canaries.map((c: Record<string, unknown>) => c.targetId as string).filter(Boolean);
    const canaryTargets = canaryTargetIds.length > 0
      ? await db.target.findMany({ where: { id: { in: canaryTargetIds } }, select: { id: true, clientId: true } })
      : [];
    const targetToClient: Record<string, string> = {};
    for (const t of canaryTargets) {
      targetToClient[t.id as string] = getClientNameFast(t.clientId as string);
    }

    for (const c of canaries) {
      const clientName = c.targetId ? (targetToClient[c.targetId as string] || "Unassigned") : "Unassigned";
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
