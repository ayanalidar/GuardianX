import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { getUserFromRequest } from "@/lib/auth";
import {
  GENESIS_PREV_HASH,
  computeAttestationHash,
} from "@/lib/sentinel/attestation";
import { onPatchApproved } from "@/lib/memory-vault/memory-writer";

export const dynamic = "force-dynamic";

// POST /api/patches/[id]/approve, apply the patch + create a cryptographic attestation.
// The attestation is appended to the tamper-evident hash chain
// (genesis prevHash = "0"). Hash formula:
//   SHA-256(prevHash + patch.id + patchedCodeHash + approvedAtIso)
// This matches the canonical verifier in src/lib/sentinel/attestation.ts so
// every issued attestation verifies without re-issuance.
export async function POST(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
  // Get the latest attestation in the chain (genesis prevHash = GENESIS_PREV_HASH)
  const latestAtt = await db.attestation.findFirst({
    orderBy: { createdAt: "desc" },
  });
  const prevHash = (latestAtt?.hash as string | undefined) ?? GENESIS_PREV_HASH;
  const approvedAt = (updated.approvedAt as Date).toISOString();
  const patchedCodeHash = createHash("sha256")
    .update((patch.patchedCode as string) || "")
    .digest("hex");

  const data = JSON.stringify({
    patchId: patch.patchId,
    codebase: (patch.codebase as { name: string })?.name,
    title: patch.title,
    severity: patch.severity,
    cve: patch.cve ?? null,
    affectedFile: patch.affectedFile,
    approvedAt,
    patchedCodeHash,
    // Schema version — lets us evolve the data shape without breaking the
    // hash chain (the hash is computed from the four canonical fields only).
    schemaVersion: 1,
  });

  const hash = computeAttestationHash(prevHash, patch.id as string, patchedCodeHash, approvedAt);

  const att = await db.attestation.create({
    data: { patchId: patch.id, prevHash, hash, data },
  });

  // ── Memory Vault: record the approval so Guardian AI can later say ─────
  // "You patched SQL Injection in login.js last Tuesday." Fire-and-forget.
  onPatchApproved(user.userId, {
    id: patch.id as string,
    patchId: patch.patchId as string,
    title: patch.title as string,
    severity: patch.severity as string,
    affectedFile: patch.affectedFile as string | undefined,
    status: "approved",
    approvedAt: updated.approvedAt as Date,
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
      chain_prev_hash: prevHash,
      verify_url: `/attestations/${updated.patchId}`,
    },
    message: "Patch approved, applied to codebase, and cryptographically attested.",
  });
}
