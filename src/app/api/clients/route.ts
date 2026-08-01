import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients, list all clients with pipeline summary (optimized: batch queries)
export async function GET() {
  try {
    // 1. Fetch all clients (1 query)
    const clients = await db.client.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (!clients || clients.length === 0) {
      return NextResponse.json([]);
    }

    const clientIds = clients.map((c: Record<string, unknown>) => c.id as string);

    // 2. Batch fetch ALL codebases for ALL clients (1 query)
    const allCodebases = await db.codebase.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true, name: true, language: true, description: true, clientId: true, createdAt: true },
    });

    // 3. Batch fetch ALL targets for ALL clients (1 query)
    const allTargets = await db.target.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true, name: true, baseUrl: true, authorized: true, clientId: true, createdAt: true },
    });

    // 4. Batch fetch ALL patches for ALL codebases (1 query)
    const codebaseIds = allCodebases.map((cb: Record<string, unknown>) => cb.id as string);
    const allPatches = codebaseIds.length > 0
      ? await db.patch.findMany({
          where: { codebaseId: { in: codebaseIds } },
          select: { id: true, codebaseId: true, status: true, severity: true, createdAt: true },
        })
      : [];

    // 5. Batch fetch ALL engagements for ALL targets (1 query)
    const targetIds = allTargets.map((t: Record<string, unknown>) => t.id as string);
    const allEngagements = targetIds.length > 0
      ? await db.engagement.findMany({
          where: { targetId: { in: targetIds } },
          select: { id: true, targetId: true, status: true, startedAt: true, completedAt: true, stageLabel: true },
        })
      : [];

    // 6. Batch fetch ALL findings for ALL engagements (1 query)
    const engagementIds = allEngagements.map((e: Record<string, unknown>) => e.id as string);
    const allFindings = engagementIds.length > 0
      ? await db.finding.findMany({
          where: { engagementId: { in: engagementIds } },
          select: { id: true, engagementId: true, severity: true, title: true, category: true, endpoint: true, createdAt: true },
        })
      : [];

    // 7. Build lookup maps for O(1) access
    const codebasesByClient: Record<string, Record<string, unknown>[]> = {};
    for (const cb of allCodebases) {
      const cid = (cb as Record<string, unknown>).clientId as string;
      if (!codebasesByClient[cid]) codebasesByClient[cid] = [];
      codebasesByClient[cid].push(cb as Record<string, unknown>);
    }

    const targetsByClient: Record<string, Record<string, unknown>[]> = {};
    for (const t of allTargets) {
      const cid = (t as Record<string, unknown>).clientId as string;
      if (!targetsByClient[cid]) targetsByClient[cid] = [];
      targetsByClient[cid].push(t as Record<string, unknown>);
    }

    const patchesByCodebase: Record<string, Record<string, unknown>[]> = {};
    for (const p of allPatches) {
      const cbId = (p as Record<string, unknown>).codebaseId as string;
      if (!patchesByCodebase[cbId]) patchesByCodebase[cbId] = [];
      patchesByCodebase[cbId].push(p as Record<string, unknown>);
    }

    const engagementsByTarget: Record<string, Record<string, unknown>[]> = {};
    for (const e of allEngagements) {
      const tid = (e as Record<string, unknown>).targetId as string;
      if (!engagementsByTarget[tid]) engagementsByTarget[tid] = [];
      engagementsByTarget[tid].push(e as Record<string, unknown>);
    }

    const findingsByEngagement: Record<string, Record<string, unknown>[]> = {};
    for (const f of allFindings) {
      const eid = (f as Record<string, unknown>).engagementId as string;
      if (!findingsByEngagement[eid]) findingsByEngagement[eid] = [];
      findingsByEngagement[eid].push(f as Record<string, unknown>);
    }

    // 8. Build enriched client objects using the maps (no more queries!)
    const enriched = clients.map((c: Record<string, unknown>) => {
      const clientId = c.id as string;
      const codebases = codebasesByClient[clientId] || [];
      const targets = targetsByClient[clientId] || [];

      // Count patches
      let patchCount = 0;
      let pendingPatches = 0;
      let approvedPatches = 0;
      let criticalPatches = 0;
      for (const cb of codebases) {
        const cbPatches = patchesByCodebase[cb.id as string] || [];
        patchCount += cbPatches.length;
        pendingPatches += cbPatches.filter((p) => p.status === "pending").length;
        approvedPatches += cbPatches.filter((p) => p.status === "approved").length;
        criticalPatches += cbPatches.filter((p) => p.severity === "critical" && p.status === "pending").length;
      }

      // Count findings
      let findingCount = 0;
      let criticalFindings = 0;
      for (const t of targets) {
        const tEngagements = engagementsByTarget[t.id as string] || [];
        for (const e of tEngagements) {
          const eFindings = findingsByEngagement[e.id as string] || [];
          findingCount += eFindings.length;
          criticalFindings += eFindings.filter((f) => f.severity === "critical").length;
        }
      }

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        contact_name: c.contactName,
        contact_email: c.contactEmail,
        contact_phone: c.contactPhone,
        target_url: c.targetUrl,
        repo_url: c.repoUrl,
        scope: c.scope,
        authorized: c.authorized,
        frameworks: c.frameworks ? (c.frameworks as string).split(",").map((s: string) => s.trim()) : [],
        status: c.status,
        created_at: (c.createdAt as Date).toISOString(),
        stats: {
          codebases: codebases.length,
          targets: targets.length,
          patches: patchCount,
          pending_patches: pendingPatches,
          approved_patches: approvedPatches,
          critical_patches: criticalPatches,
          findings: findingCount,
          critical_findings: criticalFindings,
        },
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load clients" },
      { status: 500 }
    );
  }
}

// POST /api/clients, create a new client
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    name,
    description,
    contactName,
    contactEmail,
    contactPhone,
    targetUrl,
    repoUrl,
    scope,
    frameworks,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const client = await db.client.create({
      data: {
        name,
        description: description || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        targetUrl: targetUrl || null,
        repoUrl: repoUrl || null,
        scope: scope || null,
        frameworks: Array.isArray(frameworks) ? frameworks.join(",") : frameworks || null,
        authorized: false,
        status: "onboarding",
      },
    });

    return NextResponse.json(
      { id: client.id, name: client.name, status: client.status, message: "Client created" },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create client" },
      { status: 500 }
    );
  }
}
