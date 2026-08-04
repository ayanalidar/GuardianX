// Cryptographic patch attestation — tamper-evident hash chain.
//
// ─── Enhanced (auto-remediation-enhance) ────────────────────────────────────
//  • Canonical hash formula: SHA-256(prevHash + patchId + patchDataHash + timestamp)
//    where:
//      – prevHash      = previous attestation's hash (genesis = "0")
//      – patchId       = the Patch's internal id (FK on Attestation)
//      – patchDataHash = SHA-256 of the patched source code (stored in
//                        `data.patchedCodeHash`)
//      – timestamp     = `data.approvedAt` (ISO 8601 string)
//    This creates an immutable chain — changing any historical patch breaks
//    all subsequent hashes.
//
//  • Backward compatibility: this formula matches exactly what the existing
//    `/api/patches/[id]/approve` route already computes. Existing attestations
//    therefore verify without re-issuance. (The legacy `/api/attestations`
//    GET verifier used `createdAt` instead of `approvedAt` — that was a bug
//    that caused false negatives; the new verifier below is the source of
//    truth.)
//
//  • Verification: re-walks the chain from genesis to a target patchId and
//    returns whether every link is intact, the chain length, and (if broken)
//    the patchId at which tampering was first detected.

import { createHash } from "node:crypto";

// Genesis prevHash — the seed of the chain.
export const GENESIS_PREV_HASH = "0";

export interface AttestationRow {
  id: string;
  patchId: string;           // FK: internal Patch.id (cuid)
  prevHash: string;
  hash: string;
  data: string;              // JSON string
  createdAt: Date | string;
}

export interface AttestationData {
  patchId?: string;          // human-readable patchId (e.g. SP-2025-0001-abcd)
  codebase?: string;
  title?: string;
  severity?: string;
  approvedAt?: string;       // ISO timestamp
  patchedCodeHash?: string;
  [k: string]: unknown;
}

export interface ChainLink {
  attestationId: string;
  patchInternalId: string;     // Attestation.patchId (FK to Patch.id)
  patchHumanId?: string;       // data.patchId (e.g. SP-...)
  prevHash: string;
  hash: string;
  recomputedHash: string;
  hashOk: boolean;
  linkOk: boolean;             // prevHash === previous link's hash
  timestamp: string;           // data.approvedAt or fallback
  patchedCodeHash?: string;
  data: AttestationData;
}

export interface ChainVerification {
  valid: boolean;
  chainLength: number;
  genesisHash: string | null;
  latestHash: string | null;
  tamperedAt: string | null;   // patchInternalId of the first broken link
  tamperedAtHuman?: string | null;
  tamperReason: string | null; // human-readable reason
  links: ChainLink[];
}

// Compute the canonical hash for an attestation.
// Mirrors the formula used by `/api/patches/[id]/approve` so existing
// attestations verify without re-issuance.
export function computeAttestationHash(
  prevHash: string,
  patchInternalId: string,
  patchedCodeHash: string,
  timestamp: string
): string {
  return createHash("sha256")
    .update(prevHash + patchInternalId + patchedCodeHash + timestamp)
    .digest("hex");
}

// Parse the JSON `data` field of an attestation, defensively.
export function parseAttestationData(raw: string | null | undefined): AttestationData {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return (v && typeof v === "object") ? (v as AttestationData) : {};
  } catch {
    return {};
  }
}

// Extract a stable timestamp from the attestation's data field. Falls back to
// `createdAt` (ISO) when `approvedAt` is missing — only used for display,
// never for hash computation (which always uses the stored timestamp from
// data, matching what approve() committed).
export function attestationTimestamp(
  data: AttestationData,
  fallbackCreatedAt: Date | string
): string {
  if (data.approvedAt) return data.approvedAt;
  if (fallbackCreatedAt instanceof Date) return fallbackCreatedAt.toISOString();
  return typeof fallbackCreatedAt === "string" ? fallbackCreatedAt : "";
}

// Verify the integrity of the entire attestation chain (genesis → latest).
// Returns a per-link breakdown + the first patchId at which tampering was
// detected (if any).
//
// Accepts the raw rows from `db.attestation.findMany({ orderBy: { createdAt: "asc" } })`.
export function verifyAttestationChain(rows: AttestationRow[]): ChainVerification {
  const links: ChainLink[] = [];
  let prevHash = GENESIS_PREV_HASH;
  let tamperedAt: string | null = null;
  let tamperedAtHuman: string | null = null;
  let tamperReason: string | null = null;

  for (const row of rows) {
    const data = parseAttestationData(row.data);
    const patchedCodeHash = data.patchedCodeHash ?? "";
    const timestamp = data.approvedAt ?? (
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? "")
    );
    const recomputedHash = computeAttestationHash(
      row.prevHash,
      row.patchId,
      patchedCodeHash,
      timestamp
    );
    const hashOk = recomputedHash === row.hash;
    const linkOk = row.prevHash === prevHash;

    links.push({
      attestationId: row.id,
      patchInternalId: row.patchId,
      patchHumanId: data.patchId,
      prevHash: row.prevHash,
      hash: row.hash,
      recomputedHash,
      hashOk,
      linkOk,
      timestamp,
      patchedCodeHash: data.patchedCodeHash,
      data,
    });

    if (!hashOk && tamperedAt === null) {
      tamperedAt = row.patchId;
      tamperedAtHuman = data.patchId ?? row.patchId;
      tamperReason = `hash mismatch: stored ${row.hash.slice(0, 12)}… but recomputed ${recomputedHash.slice(0, 12)}…`;
    }
    if (!linkOk && tamperedAt === null) {
      tamperedAt = row.patchId;
      tamperedAtHuman = data.patchId ?? row.patchId;
      tamperReason = `broken prevHash linkage: expected ${prevHash.slice(0, 12)}… but found ${row.prevHash.slice(0, 12)}…`;
    }

    prevHash = row.hash;
  }

  const valid = tamperedAt === null;
  return {
    valid,
    chainLength: links.length,
    genesisHash: links[0]?.hash ?? null,
    latestHash: links[links.length - 1]?.hash ?? null,
    tamperedAt,
    tamperedAtHuman,
    tamperReason,
    links,
  };
}

// Verify just up to (and including) a specific patchId. Used by the public
// verify API to answer "is this specific patch's attestation still intact?".
export function verifyAttestationForPatch(
  rows: AttestationRow[],
  patchInternalId: string
): ChainVerification & { found: boolean } {
  const idx = rows.findIndex((r) => r.patchId === patchInternalId);
  if (idx === -1) {
    return {
      valid: false,
      chainLength: 0,
      genesisHash: null,
      latestHash: null,
      tamperedAt: null,
      tamperedAtHuman: null,
      tamperReason: `no attestation found for patchId ${patchInternalId}`,
      links: [],
      found: false,
    };
  }
  const sub = rows.slice(0, idx + 1);
  const v = verifyAttestationChain(sub);
  return { ...v, found: true };
}

// Compute the hash that should be stored for a NEW attestation being issued.
// Used by the approve route to ensure new attestations use the canonical
// formula (the existing approve route already does this; this helper exists
// so other callers — e.g. a future "re-attest" endpoint — stay consistent).
export function issueAttestationHash(
  prevHash: string,
  patchInternalId: string,
  patchedCode: string,
  approvedAtIso: string
): { hash: string; patchedCodeHash: string; data: string } {
  const patchedCodeHash = createHash("sha256")
    .update(patchedCode || "")
    .digest("hex");
  const hash = computeAttestationHash(
    prevHash,
    patchInternalId,
    patchedCodeHash,
    approvedAtIso
  );
  return { hash, patchedCodeHash, data: "" /* filled by caller */ };
}
