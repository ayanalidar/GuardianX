import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/pending — all patches awaiting human review.
export async function GET() {
  const patches = await db.patch.findMany({
    where: { status: "pending" },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    include: { codebase: { select: { name: true } } },
  });

  return NextResponse.json(
    patches.map((p) => ({
      patch_id: p.patchId,
      internal_id: p.id,
      codebase_name: p.codebase.name,
      title: p.title,
      severity: p.severity,
      cve: p.cve,
      affected_file: p.affectedFile,
      ai_explanation: p.aiExplanation,
      confidence: p.confidence,
      sandbox_passed: p.sandboxPassed,
      has_exploit: !!p.exploitCode,
      exploit_confirmed:
        !!p.exploitOriginalResult &&
        /"success":\s*true/.test(p.exploitOriginalResult),
      adversarial_rounds: p.adversarialRounds,
      adversarial_won: p.adversarialWon,
      created_at: p.createdAt.toISOString(),
    }))
  );
}
