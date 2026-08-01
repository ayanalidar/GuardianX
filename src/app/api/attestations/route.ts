import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

// GET /api/attestations, list the full hash-chained ledger + verify integrity.
export async function GET() {
  const attestations = await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: { patch: { select: { patchId: true, title: true, severity: true } } },
  });

  // Verify the chain: recompute each hash and check prevHash linkage
  let chainValid = true;
  let prevHash = "0";
  const verified = attestations.map((a: Record<string, unknown>) => {
    const expectedPrev = prevHash;
    const dataObj = JSON.parse((a.data as string) || "{}");
    const recomputed = createHash("sha256")
      .update((a.prevHash as string) + (a.patchId as string) + (dataObj.patchedCodeHash || "") + (a.createdAt as Date).toISOString())
      .digest("hex");
    const hashOk = recomputed === (a.hash as string);
    const linkOk = (a.prevHash as string) === expectedPrev;
    if (!hashOk || !linkOk) chainValid = false;
    prevHash = a.hash as string;
    const patch = a.patch as Record<string, unknown> | null;
    return {
      id: a.id,
      patch_id: patch?.patchId || a.patchId,
      title: patch?.title || "Unknown",
      severity: patch?.severity || "unknown",
      prev_hash: a.prevHash,
      hash: a.hash,
      hash_ok: hashOk,
      link_ok: linkOk,
      created_at: (a.createdAt as Date).toISOString(),
      data: dataObj,
    };
  });

  return NextResponse.json({
    chain_valid: chainValid,
    count: attestations.length,
    genesis_hash: attestations[0]?.hash ?? null,
    latest_hash: attestations[attestations.length - 1]?.hash ?? null,
    attestations: verified,
  });
}
