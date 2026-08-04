/**
 * Real-time compliance scoring + gap analysis.
 *
 * Scoring formula (transparent, shown in the UI):
 *
 *   final_score = (automatedPassRate * 0.60)
 *               + (manualScore        * 0.20)
 *               + (remediationScore   * 0.20)
 *
 *   - automatedPassRate  0-100  : % of automated checks that PASS.
 *                                 (manual checks count as 50% — they need sign-off)
 *   - manualScore        0-100  : derived from audit log activity + attestation
 *                                 count (proves manual review is happening).
 *   - remediationScore   0-100  : % of findings/patches that map to DPDPA
 *                                 controls and have been remediated (approved,
 *                                 rolled back, or contained).
 *
 * Compliance level:
 *   - compliant     score >= 80
 *   - at-risk       50 <= score < 80
 *   - non-compliant score < 50
 *
 * Gap analysis:
 *   For every control whose status is "fail", emit a GapItem with impact +
 *   effort. Quick wins (high impact, low effort) surface first.
 */

import { db } from "@/lib/db";
import type {
  ComplianceLevel,
  ComplianceScoreBreakdown,
  FrameworkStatus,
  GapItem,
  SectionStatus,
  ControlStatus,
} from "./types";

// ── Findings → DPDPA control mapping ───────────────────────────────────────
// Same map used by /api/compliance for finding→section mapping.
const FINDING_CATEGORY_TO_DPDPA_SECTION: Record<string, string> = {
  "Sensitive Data Exposure": "sec-8",
  "PII Exposure": "sec-8",
  "SQL Injection": "sec-8",
  "Path Traversal": "sec-8",
  XSS: "sec-8",
  IDOR: "sec-4",
  "Open Redirect": "sec-8",
  "Info Disclosure": "sec-8",
  "Authentication Bypass": "sec-8",
};

function impactForSection(sectionId: string): "high" | "medium" | "low" {
  // Sections whose failure attracts the highest penalties / is core to DPDPA.
  const HIGH = new Set(["sec-6", "sec-8", "sec-9", "sec-11", "sec-25"]);
  const MEDIUM = new Set(["sec-4", "sec-5", "sec-12", "sec-20"]);
  if (HIGH.has(sectionId)) return "high";
  if (MEDIUM.has(sectionId)) return "medium";
  return "low";
}

function effortForCheckType(checkType: string): "low" | "medium" | "high" {
  // Quick wins: small, well-scoped code changes.
  const LOW = new Set([
    "privacy-policy-link",
    "privacy-policy-exists",
    "privacy-policy-linked",
    "privacy-policy-purpose",
    "privacy-policy-lawful-basis",
    "signup-minimal-fields",
    "grievance-contact",
    "user-correction-endpoint",
    "account-deletion-endpoint",
    "data-export-endpoint",
    "audit-log-endpoint",
    "attestation-ledger",
    "audit-export-endpoint",
    "breach-notification-endpoint",
    "user-self-access",
    "vuln-management",
    "encryption-evidence",
    "auth-strong",
    "two-factor-endpoint",
    "incident-response-endpoint",
    "siem-endpoint",
    "anomaly-detection-endpoint",
    "data-privacy-scanner",
    "backup-evidence",
    "tls-config",
    "legitimate-use-doc",
  ]);
  const HIGH = new Set([
    "consent-manager-integration",
    "physical-access-control",
    "security-awareness-training",
    "nomination-mechanism",
    "exemptions-documented",
  ]);
  if (LOW.has(checkType)) return "low";
  if (HIGH.has(checkType)) return "high";
  return "medium";
}

// ── Public API ─────────────────────────────────────────────────────────────

export function levelFromScore(score: number): ComplianceLevel {
  if (score >= 80) return "compliant";
  if (score >= 50) return "at-risk";
  return "non-compliant";
}

export interface ManualActivityCounts {
  auditLogEntries: number;
  attestationCount: number;
  patchApprovals: number;
}

/**
 * Pull counts of human-driven activity that count as "manual evidence":
 * audit-log entries, attestations (signed patch ledger entries), and
 * approved patches. Used to score the 20% manual weight.
 */
export async function getManualActivityCounts(): Promise<ManualActivityCounts> {
  try {
    const [auditCount, attestationCount, patches] = await Promise.all([
      db.auditLog.count({}),
      db.attestation.count({}),
      db.patch.findMany({
        where: { status: "approved" },
        select: { patchId: true },
      }),
    ]);
    return {
      auditLogEntries: auditCount,
      attestationCount,
      patchApprovals: patches.length,
    };
  } catch {
    // DB may not be initialised in some environments — degrade gracefully.
    return { auditLogEntries: 0, attestationCount: 0, patchApprovals: 0 };
  }
}

/**
 * Pull findings + patches so we can compute how many map to DPDPA controls
 * and how many of those have been remediated.
 */
export async function getRemediationCounts(): Promise<{
  totalMapped: number;
  remediated: number;
}> {
  try {
    const [findings, patches] = await Promise.all([
      db.finding.findMany({ select: { title: true, severity: true, category: true } }),
      db.patch.findMany({ where: { status: "pending" }, select: { title: true, severity: true } }),
    ]);

    // Map findings to DPDPA sections.
    const mappedFindings = findings.filter((f) => {
      const cat = (f as { category?: string }).category || "";
      const title = (f as { title?: string }).title || "";
      return Object.keys(FINDING_CATEGORY_TO_DPDPA_SECTION).some(
        (k) => cat.includes(k) || title.includes(k)
      );
    });

    // Remediated = findings that aren't open? We don't track per-finding status
    // in the schema, but pending patches are OPEN, so:
    //   remediated = mappedFindings.length - pendingPatchesMapped.length
    // (approximate; treats pending patches as "not yet remediated")
    const mappedPendingPatches = patches.filter((p) => {
      const title = (p as { title?: string }).title || "";
      return Object.keys(FINDING_CATEGORY_TO_DPDPA_SECTION).some((k) => title.includes(k));
    });

    const totalMapped = mappedFindings.length + mappedPendingPatches.length;
    const remediated = Math.max(0, mappedFindings.length - mappedPendingPatches.length);
    return { totalMapped, remediated };
  } catch {
    return { totalMapped: 0, remediated: 0 };
  }
}

export function scoreFramework(
  frameworkStatus: FrameworkStatus,
  manual: ManualActivityCounts,
  remediation: { totalMapped: number; remediated: number }
): ComplianceScoreBreakdown {
  // ── Automated pass rate (60% weight) ──
  const allChecks = frameworkStatus.sections.flatMap((s) => s.controls.flatMap((c) => c.evidence));
  const pass = allChecks.filter((c) => c.status === "pass").length;
  const manual_ = allChecks.filter((c) => c.status === "manual").length;
  const fail = allChecks.filter((c) => c.status === "fail").length;
  const total = allChecks.length;
  // Automated pass rate: pass counts as 1.0, manual as 0.5 (pending sign-off), fail as 0.
  const automatedPassRate =
    total === 0
      ? 0
      : Math.round(((pass + manual_ * 0.5) / total) * 100);

  // ── Manual activity score (20% weight) ──
  // Saturating function: 100 audit log entries + 10 attestations + 5 patch approvals = 100%.
  const manualScore = Math.min(
    100,
    Math.round(
      (manual.auditLogEntries / 100) * 50 +
        (manual.attestationCount / 10) * 30 +
        (manual.patchApprovals / 5) * 20
    )
  );

  // ── Remediation score (20% weight) ──
  // If there are no mapped findings, give the benefit of the doubt (100%) —
  // there's nothing to remediate. Otherwise it's remediated / total.
  const remediationScore =
    remediation.totalMapped === 0
      ? 100
      : Math.round((remediation.remediated / remediation.totalMapped) * 100);

  const score = Math.round(
    automatedPassRate * 0.6 + manualScore * 0.2 + remediationScore * 0.2
  );

  const gaps = computeGaps(frameworkStatus);
  const recommendations = gaps.flatMap((g) =>
    g.recommendation ? [g.recommendation] : []
  ).slice(0, 10);

  return {
    score,
    level: levelFromScore(score),
    automatedPassRate,
    manualScore,
    remediationScore,
    gaps: gaps.map((g) => `${g.section} (${g.sectionTitle}): ${g.gap}`),
    recommendations,
  };
}

export function computeGaps(frameworkStatus: FrameworkStatus): GapItem[] {
  const gaps: GapItem[] = [];
  for (const section of frameworkStatus.sections as SectionStatus[]) {
    for (const control of section.controls as ControlStatus[]) {
      // Generate a gap for every failing automated check.
      for (const check of control.evidence) {
        if (check.status === "fail") {
          gaps.push({
            sectionId: section.id,
            section: section.section,
            sectionTitle: section.title,
            controlId: control.id,
            controlTitle: control.title,
            gap: `${check.description}: ${check.evidence}`,
            impact: impactForSection(section.id),
            effort: effortForCheckType(check.checkType),
            recommendation: control.recommendations[0] || "Implement the missing control.",
          });
        }
      }
      // If a control has no automated checks at all (all manual), surface it too.
      if (control.evidence.length === 0) {
        gaps.push({
          sectionId: section.id,
          section: section.section,
          sectionTitle: section.title,
          controlId: control.id,
          controlTitle: control.title,
          gap: "No automated checks defined for this control — manual evidence required.",
          impact: impactForSection(section.id),
          effort: "medium",
          recommendation: control.recommendations[0] || "Document and supply manual evidence.",
        });
      }
    }
  }
  // Sort by impact (high → low), then effort (low → high = quick wins first).
  const impactRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const effortRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  gaps.sort((a, b) => {
    if (impactRank[a.impact] !== impactRank[b.impact]) {
      return impactRank[a.impact] - impactRank[b.impact];
    }
    return effortRank[a.effort] - effortRank[b.effort];
  });
  return gaps;
}
