import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

// GET /api/attestations — list the full hash-chained ledger + verify integrity.
export async function GET() {
  const attestations = await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: { patch: { select: { patchId: true, title: true, severity: true } } },
  });

  // Verify the chain: recompute each hash and check prevHash linkage
  let chainValid = true;
  let prevHash = "0";
  const verified = attestations.map((a) => {
    const expectedPrev = prevHash;
    const dataObj = JSON.parse(a.data);
    const recomputed = createHash("sha256")
      .update(a.prevHash + a.patchId + dataObj.patchedCodeHash + a.createdAt.toISOString())
      .digest("hex");
    const hashOk = recomputed === a.hash;
    const linkOk = a.prevHash === expectedPrev;
    if (!hashOk || !linkOk) chainValid = false;
    prevHash = a.hash;
    return {
      id: a.id,
      patch_id: a.patch.patchId,
      title: a.patch.title,
      severity: a.patch.severity,
      prev_hash: a.prevHash,
      hash: a.hash,
      hash_ok: hashOk,
      link_ok: linkOk,
      created_at: a.createdAt.toISOString(),
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
