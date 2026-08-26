import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/clients/[id]/pipeline, computes the 7-stage pipeline status
//
// Stages:
//   1. onboarding , client created, needs assets + authorization
//   2. scanning   , SAST + DAST + SCA scans running/done
//   3. testing    , exploits generated, attack chains synthesized
//   4. patching   , AI patches generated, pending review
//   5. verifying  , patches approved, re-testing
//   6. defending  , canaries/honeypots deployed, monitoring active
//   7. compliant  , VAPT report generated, compliance mapped
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;

  try {
    const client = await db.client.findUnique({
      where: { id },
      include: {
        codebases: true,
        targets: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const codebases = (client.codebases || []) as Record<string, unknown>[];
    const targets = (client.targets || []) as Record<string, unknown>[];

    // ── Gather all related data ──────────────────────────────────────────
    let scans: Record<string, unknown>[] = [];
    let patches: Record<string, unknown>[] = [];
    let engagements: Record<string, unknown>[] = [];
    let findings: Record<string, unknown>[] = [];
    let canaries: Record<string, unknown>[] = [];

    for (const cb of codebases) {
      const cbScans = await db.scan.findMany({ where: { codebaseId: cb.id as string } });
      scans = scans.concat(cbScans);
      const cbPatches = await db.patch.findMany({ where: { codebaseId: cb.id as string } });
      patches = patches.concat(cbPatches);
    }

    for (const t of targets) {
      const tEngs = await db.engagement.findMany({ where: { targetId: t.id as string } });
      engagements = engagements.concat(tEngs);
      const tCanaries = await db.canary.findMany({ where: { targetId: t.id as string } });
      canaries = canaries.concat(tCanaries);
      for (const e of tEngs) {
        const eFindings = await db.finding.findMany({ where: { engagementId: e.id as string } });
        findings = findings.concat(eFindings);
      }
    }

    // ── Compute stage statuses ───────────────────────────────────────────
    const hasAssets = codebases.length > 0 || targets.length > 0;
    const isAuthorized = client.authorized === true;
    const hasScans = scans.length > 0;
    const scansCompleted = scans.filter((s) => s.status === "completed").length;
    const hasPatches = patches.length > 0;
    const pendingPatches = patches.filter((p) => p.status === "pending").length;
    const approvedPatches = patches.filter((p) => p.status === "approved").length;
    const hasExploits = patches.filter((p) => p.exploitCode).length > 0;
    const hasFindings = findings.length > 0;
    const hasCanaries = canaries.length > 0;

    const stages = [
      {
        id: 1,
        key: "onboarding",
        label: "Onboard",
        desc: "Client details, assets, authorization",
        status: hasAssets && isAuthorized ? "completed" : hasAssets ? "in-progress" : "pending",
        metrics: {
          codebases: codebases.length,
          targets: targets.length,
          authorized: isAuthorized,
        },
      },
      {
        id: 2,
        key: "scanning",
        label: "Scan",
        desc: "SAST + DAST + SCA vulnerability scanning",
        status: scansCompleted > 0 ? "completed" : hasScans ? "in-progress" : "pending",
        metrics: {
          scans: scans.length,
          scans_completed: scansCompleted,
          engagements: engagements.length,
        },
      },
      {
        id: 3,
        key: "testing",
        label: "Test",
        desc: "Exploit PoCs, attack chains, business logic",
        status: hasExploits || hasFindings ? "completed" : hasScans ? "in-progress" : "pending",
        metrics: {
          exploits: patches.filter((p) => p.exploitCode).length,
          findings: findings.length,
          critical_findings: findings.filter((f) => f.severity === "critical").length,
        },
      },
      {
        id: 4,
        key: "patching",
        label: "Patch",
        desc: "AI patches + adversarial arena + sandbox",
        status: approvedPatches > 0 ? "completed" : pendingPatches > 0 ? "in-progress" : "pending",
        metrics: {
          patches: patches.length,
          pending: pendingPatches,
          approved: approvedPatches,
        },
      },
      {
        id: 5,
        key: "verifying",
        label: "Verify",
        desc: "Re-run exploits against patched code",
        status: approvedPatches > 0 ? "completed" : "pending",
        metrics: {
          approved: approvedPatches,
          sandbox_passed: patches.filter((p) => p.sandboxPassed).length,
        },
      },
      {
        id: 6,
        key: "defending",
        label: "Defend",
        desc: "Canaries, honeypots, runtime monitor, exfil defense",
        status: hasCanaries ? "completed" : "pending",
        metrics: {
          canaries: canaries.length,
          active_canaries: canaries.filter((c) => c.isActive).length,
        },
      },
      {
        id: 7,
        key: "compliant",
        label: "Comply",
        desc: "VAPT report, compliance mapping, breach readiness",
        status: client.status === "compliant" ? "completed" : "pending",
        metrics: {
          frameworks: client.frameworks ? (client.frameworks as string).split(",") : [],
          findings_mapped: findings.length,
        },
      },
    ];

    // Compute overall progress
    const completedStages = stages.filter((s) => s.status === "completed").length;
    const progress = Math.round((completedStages / 7) * 100);

    // Determine current stage (first non-completed)
    const currentStage = stages.find((s) => s.status !== "completed") || stages[6];

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        status: client.status,
        authorized: client.authorized,
      },
      stages,
      progress,
      current_stage: currentStage.key,
      summary: {
        codebases: codebases.length,
        targets: targets.length,
        scans: scans.length,
        patches: patches.length,
        findings: findings.length,
        canaries: canaries.length,
        critical_findings: findings.filter((f) => f.severity === "critical").length,
        pending_patches: pendingPatches,
        approved_patches: approvedPatches,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute pipeline" },
      { status: 500 }
    );
  }
}
