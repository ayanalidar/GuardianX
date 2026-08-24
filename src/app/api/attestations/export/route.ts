import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  verifyAttestationChain,
  GENESIS_PREV_HASH,
  type AttestationRow,
} from "@/lib/sentinel/attestation";

export const dynamic = "force-dynamic";

// GET /api/attestations/export
// Exports the FULL attestation hash chain as a JSON file — for compliance
// audits. The export includes:
//   • every attestation row (id, patchId, prevHash, hash, data, createdAt)
//   • the recomputed hash for each row (so an auditor can independently
//     verify the chain without re-running the verification code)
//   • the overall chain verification result (valid/chainLength/tamperedAt)
//   • a schemaVersion field so future format changes are detectable
//
// Returns Content-Disposition: attachment; filename="guardianx-attestations-<ts>.json"

export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = (await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      patch: {
        select: {
          patchId: true,
          title: true,
          severity: true,
          affectedFile: true,
          cve: true,
          status: true,
          approvedAt: true,
          codebase: { select: { name: true } },
        },
      },
    },
  })) as unknown as Array<AttestationRow & {
    patch?: {
      patchId: string | null;
      title: string | null;
      severity: string | null;
      affectedFile: string | null;
      cve: string | null;
      status: string | null;
      approvedAt: Date | string | null;
      codebase?: { name: string | null } | null;
    };
  }>;

  const verification = verifyAttestationChain(rows);

  const exported = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    issuer: "GuardianX Autonomous Security Operations Platform",
    description:
      "Tamper-evident hash chain of all cryptographic patch attestations. " +
      "Each entry's hash = SHA-256(prevHash + patchId + patchedCodeHash + approvedAt). " +
      "Changing any historical patch breaks every subsequent hash. Re-verify " +
      "by recomputing each hash with the formula above and comparing to the stored value.",
    hashFormula: "SHA-256(prevHash + patchInternalId + patchedCodeHash + approvedAtIso)",
    genesisPrevHash: GENESIS_PREV_HASH,
    chainLength: verification.chainLength,
    verification: {
      valid: verification.valid,
      tamperedAt: verification.tamperedAt,
      tamperedAtHuman: verification.tamperedAtHuman,
      tamperReason: verification.tamperReason,
      genesisHash: verification.genesisHash,
      latestHash: verification.latestHash,
    },
    attestations: rows.map((row) => {
      const link = verification.links.find((l) => l.attestationId === row.id);
      const patch = row.patch ?? null;
      return {
        attestationId: row.id,
        patchInternalId: row.patchId,
        patchHumanId: patch?.patchId ?? link?.patchHumanId ?? null,
        prevHash: row.prevHash,
        storedHash: row.hash,
        recomputedHash: link?.recomputedHash ?? null,
        hashOk: link?.hashOk ?? null,
        linkOk: link?.linkOk ?? null,
        data: link?.data ?? null,
        patchTitle: patch?.title ?? null,
        patchSeverity: patch?.severity ?? null,
        patchCve: patch?.cve ?? null,
        patchStatus: patch?.status ?? null,
        affectedFile: patch?.affectedFile ?? null,
        codebase: patch?.codebase?.name ?? null,
        approvedAt:
          patch?.approvedAt instanceof Date
            ? patch.approvedAt.toISOString()
            : patch?.approvedAt ?? null,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt ?? ""),
      };
    }),
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `guardianx-attestations-${ts}.json`;

  return new NextResponse(JSON.stringify(exported, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
