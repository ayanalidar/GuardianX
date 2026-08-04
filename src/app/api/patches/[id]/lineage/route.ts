import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/[id]/lineage
// Returns the full lineage (version chain) of a patch:
//   Patch v1 → (bypassed by attack X) → Patch v2 → (bypassed by Y) → Patch v3 (current)
//
// Walks the `supersedes` field (added in auto-remediation-enhance) back to
// the root patch, then returns the chain in chronological order with the
// bypass reason for each supersession (extracted from the adversarial
// transcript of the prior patch).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Resolve the patch (by human-readable patchId OR internal id).
  const start = (await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    select: {
      id: true,
      patchId: true,
      title: true,
      severity: true,
      cve: true,
      affectedFile: true,
      status: true,
      confidence: true,
      supersedes: true,
      language: true,
      createdAt: true,
      approvedAt: true,
      adversarialRounds: true,
      adversarialWon: true,
      adversarialTranscript: true,
      patchExplanation: true,
    },
  })) as {
    id: string;
    patchId: string;
    title: string;
    severity: string;
    cve: string | null;
    affectedFile: string;
    status: string;
    confidence: number;
    supersedes: string | null;
    language: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    adversarialRounds: number;
    adversarialWon: boolean;
    adversarialTranscript: string | null;
    patchExplanation: string | null;
  } | null;

  if (!start) {
    return NextResponse.json({ error: "Patch not found" }, { status: 404 });
  }

  // Walk backwards via `supersedes` until we hit a patch with no supersedes.
  // Defensive: cap at 50 hops to avoid infinite loops if there's a cycle.
  const chain: Array<{
    patchId: string;
    internalId: string;
    title: string;
    severity: string;
    cve: string | null;
    status: string;
    confidence: number;
    language: string;
    createdAt: string;
    approvedAt: string | null;
    adversarialRounds: number;
    adversarialWon: boolean;
    supersedes: string | null;
    patchExplanation: unknown;
    supersededBy: string | null;       // forward-link, filled after the walk
    supersededByReason: string | null; // bypass technique that necessitated the next patch
  }> = [];

  let cursor: typeof start | null = start;
  const visited = new Set<string>();
  for (let hop = 0; hop < 50 && cursor; hop++) {
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);
    chain.unshift({
      patchId: cursor.patchId,
      internalId: cursor.id,
      title: cursor.title,
      severity: cursor.severity,
      cve: cursor.cve,
      status: cursor.status,
      confidence: cursor.confidence,
      language: cursor.language ?? "javascript",
      createdAt: cursor.createdAt instanceof Date ? cursor.createdAt.toISOString() : String(cursor.createdAt),
      approvedAt: cursor.approvedAt instanceof Date ? cursor.approvedAt.toISOString() : (cursor.approvedAt ?? null),
      adversarialRounds: cursor.adversarialRounds,
      adversarialWon: cursor.adversarialWon,
      supersedes: cursor.supersedes,
      patchExplanation: safeJson(cursor.patchExplanation, null),
      supersededBy: null,
      supersededByReason: null,
    });
    if (!cursor.supersedes) break;
    // Look up the prior patch by its human-readable patchId.
    const prior = (await db.patch.findFirst({
      where: { patchId: cursor.supersedes },
      select: {
        id: true, patchId: true, title: true, severity: true, cve: true,
        affectedFile: true, status: true, confidence: true, supersedes: true,
        language: true, createdAt: true, approvedAt: true,
        adversarialRounds: true, adversarialWon: true, adversarialTranscript: true,
        patchExplanation: true,
      },
    })) as typeof start | null;
    cursor = prior;
  }

  // Forward-fill the supersededBy links + bypass reasons.
  // For patch i in chain, if patch i+1 exists, then patch i was superseded by
  // patch i+1, and the reason is the last successful attacker bypass in
  // patch i's adversarial transcript.
  for (let i = 0; i < chain.length - 1; i++) {
    const current = chain[i];
    const next = chain[i + 1];
    current.supersededBy = next.patchId;
    // Look up the bypass reason from the current patch's transcript.
    const fullCurrent = (await db.patch.findFirst({
      where: { id: current.internalId },
      select: { adversarialTranscript: true },
    })) as { adversarialTranscript: string | null } | null;
    const transcript = safeJson<
      Array<{ outcome?: string; attackerTechnique?: string; bypassFound?: boolean; bypassResult?: { success?: boolean; detail?: string } }>
    >(fullCurrent?.adversarialTranscript ?? null, []);
    // Find the last round where attacker won / bypass succeeded.
    const wonRound = [...transcript]
      .reverse()
      .find((r) => r.outcome === "attacker-won" || r.bypassResult?.success);
    current.supersededByReason = wonRound
      ? `${wonRound.attackerTechnique ?? "unknown"} — ${wonRound.bypassResult?.detail ?? "bypass confirmed"}`
      : "patch was superseded (reason not recorded in transcript)";
  }

  return NextResponse.json({
    patch_id: start.patchId,
    title: start.title,
    lineage_depth: chain.length,
    is_current: chain[chain.length - 1]?.patchId === start.patchId,
    lineage: chain,
  });
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
