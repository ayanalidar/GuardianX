import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients — list all clients with pipeline summary
export async function GET() {
  try {
    const clients = await db.client.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { codebases: true, targets: true } },
      },
    });

    // For each client, compute pipeline progress from related data
    const enriched = await Promise.all(
      (clients || []).map(async (c: Record<string, unknown>) => {
        const clientId = c.id as string;
        const codebases = (await db.codebase.findMany({
          where: { clientId },
          select: { id: true, name: true },
        })) as Record<string, unknown>[];
        const targets = (await db.target.findMany({
          where: { clientId },
          select: { id: true, name: true, baseUrl: true },
        })) as Record<string, unknown>[];

        const cbCount = codebases.length;
        const targetCount = targets.length;

        // Count patches across all codebases
        let patchCount = 0;
        let pendingPatches = 0;
        let approvedPatches = 0;
        let criticalPatches = 0;
        for (const cb of codebases) {
          const patches = await db.patch.findMany({
            where: { codebaseId: cb.id as string },
            select: { id: true, status: true, severity: true },
          });
          patchCount += patches.length;
          pendingPatches += patches.filter((p) => p.status === "pending").length;
          approvedPatches += patches.filter((p) => p.status === "approved").length;
          criticalPatches += patches.filter(
            (p) => p.severity === "critical" && p.status === "pending"
          ).length;
        }

        // Count findings across all targets
        let findingCount = 0;
        let criticalFindings = 0;
        for (const t of targets) {
          const engagements = await db.engagement.findMany({
            where: { targetId: t.id as string },
            select: { id: true },
          });
          for (const e of engagements) {
            const findings = await db.finding.findMany({
              where: { engagementId: e.id as string },
              select: { id: true, severity: true },
            });
            findingCount += findings.length;
            criticalFindings += findings.filter((f) => f.severity === "critical").length;
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
          frameworks: c.frameworks ? (c.frameworks as string).split(",").map((s) => s.trim()) : [],
          status: c.status,
          created_at: (c.createdAt as Date).toISOString(),
          stats: {
            codebases: cbCount,
            targets: targetCount,
            patches: patchCount,
            pending_patches: pendingPatches,
            approved_patches: approvedPatches,
            critical_patches: criticalPatches,
            findings: findingCount,
            critical_findings: criticalFindings,
          },
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load clients" },
      { status: 500 }
    );
  }
}

// POST /api/clients — create a new client
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
