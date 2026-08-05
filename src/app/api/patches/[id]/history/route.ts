import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeJson(s: string | null, fallback: unknown) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function hash(s: string | null | undefined): string {
  const str = s ?? "";
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return `sha:${Math.abs(h).toString(16).padStart(8, "0")}`;
}

// GET /api/patches/[id]/history, return the full version timeline of a patch.
// Extracts iterations from: original code → AI patch → each adversarial defender iteration → final.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: { codebase: { select: { name: true } } },
  });

  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

  const versions: Array<{
    version: number;
    label: string;
    source: string;
    technique: string | null;
    reasoning: string | null;
    timestamp: string;
    code_hash: string;
    code_preview: string;
  }> = [];

  // Version 0: Original vulnerable code
  versions.push({
    version: 0,
    label: "Original (Vulnerable)",
    source: "codebase",
    technique: null,
    reasoning: null,
    timestamp: (patch.createdAt as Date).toISOString(),
    code_hash: hash(patch.originalCode as string),
    code_preview: ((patch.originalCode as string) || "").slice(0, 300),
  });

  // Version 1: Initial AI patch (before adversarial loop)
  versions.push({
    version: 1,
    label: "Initial AI Patch",
    source: "ai-patcher",
    technique: "AI-generated fix",
    reasoning: patch.aiReasoning,
    timestamp: (patch.createdAt as Date).toISOString(),
    code_hash: hash(patch.patchedCode as string), // This is the FINAL patched code; v1 may differ
    code_preview: ((patch.patchedCode as string) || "").slice(0, 300),
  });

  // Versions 2+: Adversarial defender iterations
  const transcript = safeJson(patch.adversarialTranscript as string | null, []) as Array<{
    round: number;
    defender?: { technique: string; reasoning: string; patchedCode: string };
    attackerTechnique?: string;
    outcome?: string;
  }>;

  for (const round of transcript) {
    if (round.defender && round.defender.patchedCode) {
      versions.push({
        version: versions.length,
        label: `Adversarial Round ${round.round}, Defender Iteration`,
        source: "ai-defender",
        technique: round.defender.technique,
        reasoning: round.defender.reasoning,
        timestamp: (patch.createdAt as Date).toISOString(),
        code_hash: hash(round.defender.patchedCode),
        code_preview: round.defender.patchedCode.slice(0, 300),
      });
    }
  }

  // Final version (current patchedCode)
  if (versions.length > 2) {
    // Update last version to be "Final"
    versions[versions.length - 1].label = `Final Patch (after ${transcript.length} adversarial round${transcript.length === 1 ? "" : "s"})`;
  }

  return NextResponse.json({
    patch_id: patch.patchId,
    title: patch.title,
    codebase: (patch.codebase as { name: string })?.name,
    adversarial_rounds: patch.adversarialRounds,
    adversarial_won: patch.adversarialWon,
    total_versions: versions.length,
    versions,
  });
}
