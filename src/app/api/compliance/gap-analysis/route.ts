import { NextResponse } from "next/server";
import {
  DPDPA_FRAMEWORK,
  ISO27001_FRAMEWORK,
  SOC2_FRAMEWORK,
  collectFrameworkEvidence,
  computeGaps,
  getManualActivityCounts,
  getRemediationCounts,
  scoreFramework,
  type FrameworkId,
  type FrameworkDef,
} from "@/lib/compliance";

export const dynamic = "force-dynamic";

const FRAMEWORK_MAP: Record<FrameworkId, FrameworkDef> = {
  DPDPA: DPDPA_FRAMEWORK,
  ISO27001: ISO27001_FRAMEWORK,
  SOC2: SOC2_FRAMEWORK,
};

function isValidFramework(id: string | null): id is FrameworkId {
  return id === "DPDPA" || id === "ISO27001" || id === "SOC2";
}

// GET /api/compliance/gap-analysis?framework=DPDPA
// Returns prioritised gaps for the selected framework.
// Sort order: impact (high first), then effort (low first = quick wins).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("framework");
  const frameworkId: FrameworkId = isValidFramework(requested) ? requested : "DPDPA";

  const frameworkDef = FRAMEWORK_MAP[frameworkId];
  const frameworkStatus = collectFrameworkEvidence(frameworkDef);
  const [manual, remediation] = await Promise.all([
    getManualActivityCounts(),
    getRemediationCounts(),
  ]);
  const scoreBreakdown = scoreFramework(frameworkStatus, manual, remediation);
  const gaps = computeGaps({ ...frameworkStatus, level: scoreBreakdown.level, score: scoreBreakdown.score });

  // Summary counts by impact
  const summary = {
    framework: frameworkId,
    score: scoreBreakdown.score,
    level: scoreBreakdown.level,
    total_gaps: gaps.length,
    high_impact: gaps.filter((g) => g.impact === "high").length,
    medium_impact: gaps.filter((g) => g.impact === "medium").length,
    low_impact: gaps.filter((g) => g.impact === "low").length,
    quick_wins: gaps.filter((g) => g.impact === "high" && g.effort === "low").length,
    automated_pass_rate: scoreBreakdown.automatedPassRate,
    manual_score: scoreBreakdown.manualScore,
    remediation_score: scoreBreakdown.remediationScore,
  };

  return NextResponse.json({
    ...summary,
    gaps,
    recommendations: scoreBreakdown.recommendations,
    generated_at: new Date().toISOString(),
  });
}
