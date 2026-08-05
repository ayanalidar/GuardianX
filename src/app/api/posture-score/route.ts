import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/posture-score, compute a 0-100 security posture score per codebase.
export async function GET() {
  const codebases = await db.codebase.findMany({
    include: {
      patches: {
        select: {
          severity: true, status: true, sandboxPassed: true,
          adversarialWon: true, adversarialRounds: true,
        },
      },
    },
  });

  const scores = codebases.map((cb) => {
    const patches = (cb.patches as Array<{ severity: string; status: string; sandboxPassed: boolean; adversarialWon: boolean; adversarialRounds: number }>) || [];
    const total = patches.length;
    const pending = patches.filter((p) => p.status === "pending");
    const approved = patches.filter((p) => p.status === "approved");
    const pendingCritical = pending.filter((p) => p.severity === "critical").length;
    const pendingHigh = pending.filter((p) => p.severity === "high").length;
    const sandboxPassed = patches.filter((p) => p.sandboxPassed).length;
    const advRounds = patches.filter((p) => p.adversarialRounds > 0).length;
    const advWon = patches.filter((p) => p.adversarialWon).length;

    let score = 100;
    score -= Math.min(pendingCritical * 15, 45);
    score -= Math.min(pendingHigh * 8, 24);
    if (total === 0) score -= 10;
    if (total > 0) score += Math.round((sandboxPassed / total) * 10);
    if (advRounds > 0) score += Math.round((advWon / advRounds) * 10);
    if (total > 0) score += Math.round((approved.length / total) * 5);
    score = Math.max(0, Math.min(100, score));

    let grade: string, color: string;
    if (score >= 90) { grade = "A"; color = "#10b981"; }
    else if (score >= 75) { grade = "B"; color = "#84cc16"; }
    else if (score >= 60) { grade = "C"; color = "#f59e0b"; }
    else if (score >= 40) { grade = "D"; color = "#f97316"; }
    else { grade = "F"; color = "#ef4444"; }

    return {
      codebase_id: cb.id, codebase_name: cb.name,
      score, grade, color,
      total_patches: total, pending: pending.length, approved: approved.length,
      pending_critical: pendingCritical, pending_high: pendingHigh,
      sandbox_pass_rate: total > 0 ? Math.round((sandboxPassed / total) * 100) : 100,
      adversarial_win_rate: advRounds > 0 ? Math.round((advWon / advRounds) * 100) : 100,
    };
  });

  const overall = scores.length > 0
    ? Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length) : 100;
  let overallGrade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 40 ? "D" : "F";

  return NextResponse.json({ overall, overall_grade: overallGrade, codebases: scores });
}
