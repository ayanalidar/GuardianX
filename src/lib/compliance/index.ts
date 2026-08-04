/**
 * Barrel export for the compliance module.
 */

export * from "./types";
export { DPDPA_FRAMEWORK, DPDPA_SECTION_LIST } from "./dpdpa-framework";
export { ISO27001_FRAMEWORK } from "./iso27001-framework";
export { SOC2_FRAMEWORK } from "./soc2-framework";
export {
  runCheck,
  collectControlEvidence,
  collectSectionEvidence,
  collectFrameworkEvidence,
} from "./evidence-collector";
export {
  levelFromScore,
  scoreFramework,
  computeGaps,
  getManualActivityCounts,
  getRemediationCounts,
} from "./scorer";

import type { FrameworkDef, FrameworkId } from "./types";
import { DPDPA_FRAMEWORK } from "./dpdpa-framework";
import { ISO27001_FRAMEWORK } from "./iso27001-framework";
import { SOC2_FRAMEWORK } from "./soc2-framework";

export const FRAMEWORKS: Record<FrameworkId, FrameworkDef> = {
  DPDPA: DPDPA_FRAMEWORK,
  ISO27001: ISO27001_FRAMEWORK,
  SOC2: SOC2_FRAMEWORK,
};

export function getFramework(id: FrameworkId): FrameworkDef {
  return FRAMEWORKS[id] ?? DPDPA_FRAMEWORK;
}

export const FRAMEWORK_LIST: FrameworkDef[] = [DPDPA_FRAMEWORK, ISO27001_FRAMEWORK, SOC2_FRAMEWORK];
