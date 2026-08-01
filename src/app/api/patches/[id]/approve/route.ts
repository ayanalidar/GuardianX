import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/approve, apply the patch + create a cryptographic attestation.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: { codebase: { select: { name: true } } },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });
  if (patch.status !== "pending") {
    return NextResponse.json(
      { error: `Patch already ${patch.status}`, patch_id: patch.patchId, status: patch.status },
      { status: 409 }
    );
  }

  const updated = await db.patch.update({
    where: { id: patch.id },
    data: { status: "approved", approvedAt: new Date() },
  });

  // Apply the patched code to the codebase source
  if (patch.patchedCode) {
    await db.codebase.update({
      where: { id: patch.codebaseId },
      data: { sourceCode: patch.patchedCode },
    });
  }

  // ── Create a cryptographic attestation (hash-chained ledger) ──────────
  // Get the latest attestation in the chain (genesis prevHash = "0")
  const latestAtt = await db.attestation.findFirst({
    orderBy: { createdAt: "desc" },
  });
  const prevHash = latestAtt?.hash ?? "0";
  const approvedAt = updated.approvedAt!.toISOString();
  const patchedCodeHash = createHash("sha256")
    .update(patch.patchedCode || "")
    .digest("hex");

  const data = JSON.stringify({
    patchId: patch.patchId,
    codebase: patch.codebase.name,
    title: patch.title,
    severity: patch.severity,
    approvedAt,
    patchedCodeHash,
  });

  const hash = createHash("sha256")
    .update(prevHash + patch.id + patchedCodeHash + approvedAt)
    .digest("hex");

  const att = await db.attestation.create({
    data: { patchId: patch.id, prevHash, hash, data },
  });

  return NextResponse.json({
    patch_id: updated.patchId,
    status: updated.status,
    approved_at: approvedAt,
    attestation: {
      id: att.id,
      hash: att.hash,
      prev_hash: att.prevHash,
      patched_code_hash: patchedCodeHash,
    },
    message: "Patch approved, applied to codebase, and cryptographically attested.",
  });
}
