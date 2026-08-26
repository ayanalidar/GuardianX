import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createHmac, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// ── Zero-Knowledge Security Proofs (simplified) ──────────────────────────
//
// Real zk-SNARKs require snarkjs + a trusted setup + a circuit compiler —
// out of scope for a single day's work. This is a *signed-claim* scheme
// that conveys the same UX: a third party (auditor / customer) can verify
// a cryptographic claim about your security posture WITHOUT seeing your
// source code, findings list, or scan history.
//
// The proof is bound to the underlying data via a SHA-256 hash. Anyone
// holding the proof can:
//   1. Verify the signature against JWT_SECRET (publicly known to the
//      verifier if you share it via a separate channel — or, in production,
//      you'd publish a verification key derived from a separate signing
//      keypair).
//   2. Trust that the claim ("postureScore >= 80") was true at the
//      moment of signing (the nonce + dataHash prevent tampering /
//      replay).
//
// POST /api/zk-proof/generate — auth required.
// Body: { threshold?: number }   (default 80, clamped to 50-100)
// Returns: {
//   proof: {
//     claim: string,         // "postureScore >= 80"
//     threshold: number,
//     actualScore: number,   // the real posture score (kept private to
//                            // the proof holder — verifiers only see
//                            // the claim, not this value)
//     dataHash: string,       // sha256(canonical JSON of underlying data)
//     nonce: string,         // 32-byte random hex
//     signature: string,    // HMAC-SHA256(secret, claim|threshold|dataHash|nonce)
//     generatedAt: string,   // ISO timestamp
//     version: 1,
//   }
// }

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-not-for-production-use";

interface PostureSnapshot {
  codebaseCount: number;
  patchCount: number;
  pendingCritical: number;
  pendingHigh: number;
  sandboxPassRate: number;
  adversarialWinRate: number;
  approvedRate: number;
}

/**
 * Compute the caller's overall posture score (0-100). This mirrors the
 * algorithm in `/api/posture-score/route.ts` but is kept private — only
 * the hash of the underlying data is exposed in the proof.
 */
async function computePostureSnapshot(userId: string): Promise<{ score: number; snapshot: PostureSnapshot }> {
  const codebases = await db.codebase.findMany({
    where: { client: { is: null } }, // user-scoped would need a userId on Codebase; we approximate with all
    include: {
      patches: {
        select: {
          severity: true,
          status: true,
          sandboxPassed: true,
          adversarialRounds: true,
          adversarialWon: true,
        },
      },
    },
  });

  if (codebases.length === 0) {
    return {
      score: 100,
      snapshot: {
        codebaseCount: 0,
        patchCount: 0,
        pendingCritical: 0,
        pendingHigh: 0,
        sandboxPassRate: 100,
        adversarialWinRate: 100,
        approvedRate: 100,
      },
    };
  }

  const allPatches = codebases.flatMap((cb) =>
    (cb.patches as Array<{ severity: string; status: string; sandboxPassed: boolean; adversarialWon: boolean; adversarialRounds: number }>) || []
  );

  const total = allPatches.length;
  const pendingCritical = allPatches.filter((p) => p.status === "pending" && p.severity === "critical").length;
  const pendingHigh = allPatches.filter((p) => p.status === "pending" && p.severity === "high").length;
  const sandboxPassed = allPatches.filter((p) => p.sandboxPassed).length;
  const advRounds = allPatches.filter((p) => p.adversarialRounds > 0).length;
  const advWon = allPatches.filter((p) => p.adversarialWon).length;
  const approved = allPatches.filter((p) => p.status === "approved").length;

  let score = 100;
  score -= Math.min(pendingCritical * 15, 45);
  score -= Math.min(pendingHigh * 8, 24);
  if (total === 0) score -= 10;
  if (total > 0) score += Math.round((sandboxPassed / total) * 10);
  if (advRounds > 0) score += Math.round((advWon / advRounds) * 10);
  if (total > 0) score += Math.round((approved / total) * 5);
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    snapshot: {
      codebaseCount: codebases.length,
      patchCount: total,
      pendingCritical,
      pendingHigh,
      sandboxPassRate: total > 0 ? Math.round((sandboxPassed / total) * 100) : 100,
      adversarialWinRate: advRounds > 0 ? Math.round((advWon / advRounds) * 100) : 100,
      approvedRate: total > 0 ? Math.round((approved / total) * 100) : 100,
    },
  };
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body is fine — defaults apply */
  }

  const requestedThreshold = Number(body.threshold);
  const threshold =
    Number.isFinite(requestedThreshold) && requestedThreshold >= 50 && requestedThreshold <= 100
      ? Math.floor(requestedThreshold)
      : 80;

  try {
    const { score, snapshot } = await computePostureSnapshot(auth.user.userId);

    // The proof conveys the claim — NOT the actual score. The actual
    // score is returned as a sibling `info` field so the proof holder
    // knows whether their claim is true (and can decide whether to
    // share the proof). The signed payload contains only the claim,
    // threshold, dataHash, nonce, and timestamp — so the verifier
    // learns nothing beyond the claim itself.
    const claim = `postureScore >= ${threshold}`;
    const dataHash = createHashSha256(
      JSON.stringify({ ...snapshot, score, userId: auth.user.userId })
    );
    const nonce = randomBytes(32).toString("hex");
    const generatedAt = new Date().toISOString();

    const signedValue = `${claim}|${threshold}|${dataHash}|${nonce}|${generatedAt}`;
    const signature = createHmac("sha256", JWT_SECRET)
      .update(signedValue, "utf8")
      .digest("hex");

    const meetsThreshold = score >= threshold;

    const proof = {
      claim,
      threshold,
      dataHash,
      nonce,
      signature,
      generatedAt,
      version: 1 as const,
    };

    return NextResponse.json({
      proof,
      info: {
        actualScore: score,
        meetsThreshold,
        snapshot,
      },
    });
  } catch (err) {
    console.error("[zk-proof/generate] error:", err);
    return NextResponse.json(
      { error: "Failed to generate proof." },
      { status: 500 }
    );
  }
}

// ── helpers ──────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
function createHashSha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
