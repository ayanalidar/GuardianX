import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  verifyAttestationChain,
  verifyAttestationForPatch,
  type AttestationRow,
} from "@/lib/sentinel/attestation";

export const dynamic = "force-dynamic";

// POST /api/attestations/verify
// Body: { patchId?: string }
//   - If patchId is provided, verify the chain from genesis → that patch only.
//   - Otherwise, verify the entire chain end-to-end.
//
// Returns: {
//   valid: boolean,
//   chainLength: number,
//   tamperedAt?: string,        // patchInternalId of the first broken link
//   tamperedAtHuman?: string,   // human-readable patchId (SP-...)
//   tamperReason?: string,
//   genesisHash, latestHash,
//   links: ChainLink[]
// }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let patchId: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body === "object" && typeof body.patchId === "string") {
      patchId = body.patchId;
    }
  } catch {
    // No body or invalid JSON — verify entire chain.
  }

  // Fetch all attestations in chain order. We always fetch the full chain
  // because verification is by-definition a chain-walk from genesis.
  const rows = (await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: { patch: { select: { patchId: true, title: true, severity: true, status: true } } },
  })) as unknown as Array<AttestationRow & {
    patch?: { patchId: string | null; title: string | null; severity: string | null; status: string | null };
  }>;

  if (rows.length === 0) {
    return NextResponse.json({
      valid: true,
      chainLength: 0,
      genesisHash: null,
      latestHash: null,
      tamperedAt: null,
      tamperedAtHuman: null,
      tamperReason: null,
      message: "No attestations issued yet — chain is vacuously valid.",
      links: [],
    });
  }

  // If the caller gave us a human-readable patchId (SP-...), resolve it to
  // the internal patch.id so we can match against Attestation.patchId.
  let internalPatchId: string | undefined = patchId;
  if (patchId && patchId.startsWith("SP-")) {
    const patch = await db.patch.findFirst({
      where: { patchId },
      select: { id: true },
    });
    internalPatchId = (patch as { id?: string })?.id ?? undefined;
  }

  if (internalPatchId) {
    const result = verifyAttestationForPatch(rows, internalPatchId);
    return NextResponse.json({
      ...result,
      targetPatchId: patchId,
      targetInternalPatchId: internalPatchId,
    });
  }

  const result = verifyAttestationChain(rows);
  return NextResponse.json(result);
}

// GET — convenience: verify the entire chain (same as POST without body).
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = (await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: { patch: { select: { patchId: true, title: true, severity: true } } },
  })) as unknown as Array<AttestationRow & {
    patch?: { patchId: string | null; title: string | null; severity: string | null };
  }>;

  if (rows.length === 0) {
    return NextResponse.json({
      valid: true,
      chainLength: 0,
      genesisHash: null,
      latestHash: null,
      tamperedAt: null,
      tamperedAtHuman: null,
      tamperReason: null,
      links: [],
    });
  }

  const result = verifyAttestationChain(rows);
  return NextResponse.json(result);
}
