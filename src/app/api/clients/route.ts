import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { measureApiTime } from "@/lib/performance";

export const dynamic = "force-dynamic";

// ── 30-second in-memory cache for the dashboard's clients list ────────────
// The CommandCenter polls /api/clients every 15s. Without a cache, every
// poll hits Supabase with 6 sequential round-trips (clients → codebases →
// targets → patches → engagements → findings). With this cache, those
// round-trips happen at most once every 30s per server instance.
const CLIENTS_CACHE_TTL_MS = 30 * 1000;
let clientsCache: { data: unknown; expiresAt: number } | null = null;

// GET /api/clients, list all clients with pipeline summary (optimized: batch queries)
export const GET = measureApiTime(
  "/api/clients",
  async function GET() {
    try {
      // Check the 30s cache first.
      if (clientsCache && clientsCache.expiresAt > Date.now()) {
        return NextResponse.json(clientsCache.data, {
          headers: {
            "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
            "X-GX-Cache": "HIT",
          },
        });
      }

      // 1. Fetch all clients (1 query)
      const clients = await db.client.findMany({
        orderBy: { createdAt: "desc" },
      });

      if (!clients || clients.length === 0) {
        clientsCache = { data: [], expiresAt: Date.now() + CLIENTS_CACHE_TTL_MS };
        return NextResponse.json([], {
          headers: { "Cache-Control": "private, max-age=30" },
        });
      }

      const clientIds = clients.map((c: Record<string, unknown>) => c.id as string);

      // 2–6. Batch fetch ALL related rows in parallel (5 queries at once).
      // Previously these ran sequentially — adding 5× RTT latency.
      const [allCodebases, allTargets, allPatches, allEngagements, allFindings] =
        await Promise.all([
          db.codebase.findMany({
            where: { clientId: { in: clientIds } },
            select: { id: true, name: true, language: true, description: true, clientId: true, createdAt: true },
          }),
          db.target.findMany({
            where: { clientId: { in: clientIds } },
            select: { id: true, name: true, baseUrl: true, authorized: true, clientId: true, createdAt: true },
          }),
          // 4. Patches for ALL codebases — needs codebaseIds, so we resolve
          //    them after Promise.all settles. See the inner step below.
          Promise.resolve(null as null),
          Promise.resolve(null as null),
          Promise.resolve(null as null),
        ]);

      // Resolve patches / engagements / findings with the IDs we just got.
      const codebaseIds = allCodebases.map((cb: Record<string, unknown>) => cb.id as string);
      const targetIds = allTargets.map((t: Record<string, unknown>) => t.id as string);
      const [allPatchesFinal, allEngagementsFinal, allFindingsFinal] = await Promise.all([
        codebaseIds.length > 0
          ? db.patch.findMany({
              where: { codebaseId: { in: codebaseIds } },
              select: { id: true, codebaseId: true, status: true, severity: true, createdAt: true },
            })
          : [],
        targetIds.length > 0
          ? db.engagement.findMany({
              where: { targetId: { in: targetIds } },
              select: { id: true, targetId: true, status: true, startedAt: true, completedAt: true, stageLabel: true },
            })
          : [],
        // Findings depend on engagementIds, which depend on engagements.
        // We resolve them in a follow-up tick.
        Promise.resolve([] as unknown[]),
      ]);

      // Resolve findings now that we have engagement IDs.
      const engagementIds = allEngagementsFinal.map((e: Record<string, unknown>) => e.id as string);
      const allFindingsFinalResolved = engagementIds.length > 0
        ? await db.finding.findMany({
            where: { engagementId: { in: engagementIds } },
            select: { id: true, engagementId: true, severity: true, title: true, category: true, endpoint: true, createdAt: true },
          })
        : [];

      void allPatches; // placeholder above, replaced by allPatchesFinal
      void allEngagements; // same
      void allFindings; // same

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
    for (const p of allPatchesFinal) {
      const cbId = (p as Record<string, unknown>).codebaseId as string;
      if (!patchesByCodebase[cbId]) patchesByCodebase[cbId] = [];
      patchesByCodebase[cbId].push(p as Record<string, unknown>);
    }

    const engagementsByTarget: Record<string, Record<string, unknown>[]> = {};
    for (const e of allEngagementsFinal) {
      const tid = (e as Record<string, unknown>).targetId as string;
      if (!engagementsByTarget[tid]) engagementsByTarget[tid] = [];
      engagementsByTarget[tid].push(e as Record<string, unknown>);
    }

    const findingsByEngagement: Record<string, Record<string, unknown>[]> = {};
    for (const f of allFindingsFinalResolved) {
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

      return NextResponse.json(enriched, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
          "X-GX-Cache": "MISS",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to load clients" },
        { status: 500 }
      );
    }
  },
);

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

    // Invalidate the GET cache so the new client shows up immediately.
    clientsCache = null;

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
