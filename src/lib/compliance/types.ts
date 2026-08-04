/**
 * Shared compliance framework types.
 *
 * Used by:
 *  - dpdpa-framework.ts, iso27001-framework.ts, soc2-framework.ts
 *  - evidence-collector.ts (produces AutomatedCheck results)
 *  - scorer.ts (aggregates section/control status into a 0-100 score)
 *  - /api/compliance routes (returns the assembled tree)
 *  - compliance-dashboard.tsx (renders the tree, gaps, gauge)
 */

export type FrameworkId = "DPDPA" | "ISO27001" | "SOC2";

export type CheckStatus = "pass" | "fail" | "manual";

export type ComplianceLevel = "compliant" | "at-risk" | "non-compliant";

/**
 * One concrete automated check that GuardianX can run against its own
 * codebase / API surface. The `checkType` string is interpreted by the
 * evidence-collector (which performs the actual fs / route probing).
 */
export interface AutomatedCheckDef {
  id: string;
  description: string;
  /** Machine key matched in evidence-collector.ts → COLLECTORS map. */
  checkType: string;
  /** What evidence an auditor expects to see for this control. */
  expectedEvidence: string;
}

export interface ControlDef {
  id: string;
  title: string;
  description: string;
  /** DPDPA section reference, ISO Annex A ref, or SOC 2 criteria ref. */
  ref: string;
  automatedChecks: AutomatedCheckDef[];
  /** Evidence types that must be produced manually (e.g. signed policy). */
  manualEvidence: string[];
  recommendations: string[];
}

export interface SectionDef {
  id: string;
  section: string;
  title: string;
  description: string;
  controls: ControlDef[];
}

export interface FrameworkDef {
  id: FrameworkId;
  name: string;
  fullName: string;
  description: string;
  sections: SectionDef[];
}

// ── Runtime status (produced by evidence-collector + scorer) ───────────────

export interface AutomatedCheckResult {
  id: string;
  checkType: string;
  description: string;
  status: CheckStatus;
  evidence: string;
  collectedAt: string;
}

export interface ControlStatus {
  id: string;
  title: string;
  ref: string;
  status: CheckStatus;
  score: number;
  evidence: AutomatedCheckResult[];
  requiredEvidence: string[];
  recommendations: string[];
  lastChecked: string;
}

export interface SectionStatus {
  id: string;
  section: string;
  title: string;
  description: string;
  status: CheckStatus;
  score: number;
  controls: ControlStatus[];
  lastChecked: string;
}

export interface FrameworkStatus {
  id: FrameworkId;
  name: string;
  fullName: string;
  description: string;
  score: number;
  level: ComplianceLevel;
  sections: SectionStatus[];
  lastChecked: string;
}

export interface GapItem {
  sectionId: string;
  section: string;
  sectionTitle: string;
  controlId: string;
  controlTitle: string;
  gap: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  recommendation: string;
}

export interface ComplianceScoreBreakdown {
  /** 0-100 weighted score. */
  score: number;
  level: ComplianceLevel;
  /** % of automated checks that pass — 60% weight. */
  automatedPassRate: number;
  /** 0-100 score from manual checks (audit log / attestation activity) — 20% weight. */
  manualScore: number;
  /** 0-100 score from remediated findings mapped to DPDPA controls — 20% weight. */
  remediationScore: number;
  gaps: string[];
  recommendations: string[];
}
