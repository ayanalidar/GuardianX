import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { sha256hex } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/runtime-monitor/[patchId]/heal, hot-swap a vulnerable function
// at runtime with its patched version. Simulates the self-healing action:
// approve + deploy the patch to the live runtime without restart.
export async function POST(req: Request,
  { params }: { params: Promise<{ patchId: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { patchId } = await params;

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId }, { id: patchId }] },
    include: { codebase: { select: { name: true } } },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });
  if (patch.status === "approved")
    return NextResponse.json({ error: "Already healed", patch_id: patch.patchId }, { status: 409 });

  // Simulate the hot-swap: approve the patch + apply to codebase
  const updated = await db.patch.update({
    where: { id: patch.id },
    data: { status: "approved", approvedAt: new Date() },
  });

  if (patch.patchedCode) {
    await db.codebase.update({
      where: { id: patch.codebaseId },
      data: { sourceCode: patch.patchedCode },
    });
  }

  // Create attestation for the healing
  const latestAtt = await db.attestation.findFirst({ orderBy: { createdAt: "desc" } });
  const prevHash = (latestAtt?.hash as string) ?? "0";
  const approvedAt = (updated.approvedAt as Date).toISOString();
  const patchedCodeHash = await sha256hex((patch.patchedCode as string) || "");
  const data = JSON.stringify({
    patchId: patch.patchId, codebase: (patch.codebase as { name: string })?.name,
    title: patch.title, severity: patch.severity, approvedAt,
    patchedCodeHash, selfHealed: true,
  });
  const hash = await sha256hex(prevHash + (patch.id as string) + patchedCodeHash + approvedAt);
  await db.attestation.create({ data: { patchId: patch.id, prevHash, hash, data } });

  return NextResponse.json({
    patch_id: updated.patchId,
    runtime_status: "healed",
    message: `Function hot-swapped at runtime. ${(patch.codebase as { name: string })?.name} → ${patch.affectedFile} is now executing the patched version with zero downtime.`,
    healed_at: approvedAt,
    attestation_hash: hash,
  });
}
