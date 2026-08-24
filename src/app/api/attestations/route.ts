import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  verifyAttestationChain,
  parseAttestationData,
  type AttestationRow,
} from "@/lib/sentinel/attestation";

export const dynamic = "force-dynamic";

// GET /api/attestations, list the full hash-chained ledger + verify integrity.
// Uses the canonical verifier (auto-remediation-enhance) which matches the
// formula used by /api/patches/[id]/approve: SHA-256(prevHash + patchId +
// patchedCodeHash + approvedAt). The previous implementation used `createdAt`
// instead of `approvedAt`, which caused false negatives — this is now fixed.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = (await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: { patch: { select: { patchId: true, title: true, severity: true } } },
  })) as unknown as Array<AttestationRow & {
    patch?: { patchId: string | null; title: string | null; severity: string | null };
  }>;

  const verification = verifyAttestationChain(rows);

  const attestations = rows.map((a) => {
    const link = verification.links.find((l) => l.attestationId === a.id)!;
    const patch = a.patch ?? null;
    return {
      id: a.id,
      patch_id: patch?.patchId || link.patchHumanId || a.patchId,
      title: patch?.title || "Unknown",
      severity: patch?.severity || "unknown",
      prev_hash: a.prevHash,
      hash: a.hash,
      recomputed_hash: link.recomputedHash,
      hash_ok: link.hashOk,
      link_ok: link.linkOk,
      created_at:
        a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      data: link.data,
    };
  });

  return NextResponse.json({
    chain_valid: verification.valid,
    chain_length: verification.chainLength,
    count: rows.length,
    genesis_hash: verification.genesisHash,
    latest_hash: verification.latestHash,
    tampered_at: verification.tamperedAt,
    tampered_at_human: verification.tamperedAtHuman,
    tamper_reason: verification.tamperReason,
    attestations,
    // Keep legacy field names for backward compat with existing UI clients.
    hash_formula:
      "SHA-256(prevHash + patchInternalId + patchedCodeHash + approvedAtIso)",
  });
}

// Re-export parseAttestationData so callers importing from this module still
// have access to the parser (the legacy list endpoint exposed it indirectly
// via the data field).
export { parseAttestationData };

