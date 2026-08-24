import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/codebases/[id], full codebase incl. source + scans + patches.
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const cb = await db.codebase.findUnique({
    where: { id },
    include: {
      scans: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          stageLabel: true,
          startedAt: true,
          completedAt: true,
          _count: { select: { patches: true } },
        },
      },
      patches: {
        orderBy: { createdAt: "desc" },
        select: {
          patchId: true,
          title: true,
          severity: true,
          status: true,
          sandboxPassed: true,
        },
      },
    },
  });
  if (!cb) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: cb.id,
    name: cb.name,
    language: cb.language,
    description: cb.description,
    source_code: cb.sourceCode,
    created_at: cb.createdAt.toISOString(),
    scans: cb.scans.map((s) => ({
      id: s.id,
      status: s.status,
      stage_label: s.stageLabel,
      started_at: s.startedAt.toISOString(),
      completed_at: s.completedAt?.toISOString() ?? null,
      patch_count: s._count.patches,
    })),
    patches: cb.patches,
  });
}

// DELETE /api/codebases/[id]
export async function DELETE(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  await db.codebase.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
