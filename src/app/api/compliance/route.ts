import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  DPDPA_FRAMEWORK,
  ISO27001_FRAMEWORK,
  SOC2_FRAMEWORK,
  collectFrameworkEvidence,
  scoreFramework,
  getManualActivityCounts,
  getRemediationCounts,
  type FrameworkId,
  type FrameworkDef,
} from "@/lib/compliance";

export const dynamic = "force-dynamic";

// ── 5-minute in-memory cache ──────────────────────────────────────────────
// Compliance evidence doesn't change every second. We cache per framework.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiresAt: number; cachedAt: string }>();

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setCached(key: string, data: unknown) {
  const now = new Date();
  cache.set(key, {
    data,
    cachedAt: now.toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ── Legacy DPDPA / GDPR / HIPAA finding→section maps (kept for backward compat) ─
const DPDPA_SECTIONS: Record<string, { section: string; title: string; requirement: string }> = {
  "Sensitive Data Exposure": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "Data Fiduciary shall implement reasonable security safeguards to prevent personal data breach.",
  },
  "PII Exposure": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "Personal data must be protected against unauthorized access, use, modification, or disclosure.",
  },
  "SQL Injection": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "Adequate technical measures must prevent unauthorized access to personal data stored in databases.",
  },
  "Path Traversal": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "File system access must be restricted to prevent unauthorized reading of personal data files.",
  },
  "XSS": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "User input must be sanitized to prevent injection attacks that could compromise data principals' personal data.",
  },
  "IDOR": {
    section: "§ 4(2)",
    title: "Purpose Limitation & Access Control",
    requirement: "Personal data shall only be processed for the specified purpose. Access must be restricted to authorized principals.",
  },
  "Open Redirect": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "Redirects must be validated to prevent phishing attacks that could lead to personal data compromise.",
  },
  "Info Disclosure": {
    section: "§ 8(6)",
    title: "Breach Notification",
    requirement: "On becoming aware of a personal data breach, the Data Fiduciary shall notify the Data Protection Board and affected Data Principals.",
  },
  "Authentication Bypass": {
    section: "§ 8(5)",
    title: "Security Safeguards",
    requirement: "Authentication mechanisms must be robust to prevent unauthorized access to personal data.",
  },
};

const GDPR_ARTICLES: Record<string, { article: string; title: string }> = {
  "Sensitive Data Exposure": { article: "Art. 32", title: "Security of Processing" },
  "PII Exposure": { article: "Art. 5(1)(f)", title: "Integrity & Confidentiality" },
  "SQL Injection": { article: "Art. 32", title: "Security of Processing" },
  "Path Traversal": { article: "Art. 32", title: "Security of Processing" },
  "XSS": { article: "Art. 32", title: "Security of Processing" },
  "IDOR": { article: "Art. 25", title: "Data Protection by Design" },
  "Open Redirect": { article: "Art. 32", title: "Security of Processing" },
  "Info Disclosure": { article: "Art. 33", title: "Notification of Breach (72h)" },
  "Authentication Bypass": { article: "Art. 32", title: "Security of Processing" },
};

const HIPAA_RULES: Record<string, { rule: string; title: string }> = {
  "Sensitive Data Exposure": { rule: "§ 164.312(a)(1)", title: "Access Control" },
  "PII Exposure": { rule: "§ 164.312(a)(1)", title: "Access Control" },
  "SQL Injection": { rule: "§ 164.312(b)", title: "Audit Controls" },
  "Path Traversal": { rule: "§ 164.312(a)(1)", title: "Access Control" },
  "XSS": { rule: "§ 164.312(e)(1)", title: "Transmission Security" },
  "IDOR": { rule: "§ 164.312(a)(1)", title: "Access Control" },
  "Info Disclosure": { rule: "§ 164.404", title: "Breach Notification" },
  "Authentication Bypass": { rule: "§ 164.312(d)", title: "Person/Entity Authentication" },
};

const FRAMEWORK_MAP: Record<FrameworkId, FrameworkDef> = {
  DPDPA: DPDPA_FRAMEWORK,
  ISO27001: ISO27001_FRAMEWORK,
  SOC2: SOC2_FRAMEWORK,
};

function isValidFramework(id: string | null): id is FrameworkId {
  return id === "DPDPA" || id === "ISO27001" || id === "SOC2";
}

// ── Legacy multi-framework summary (kept for the existing UI cards) ────────
async function buildLegacyFrameworks() {
  const findings = await db.finding.findMany({ orderBy: { createdAt: "desc" } });

  const targetNames: Record<string, string> = {};
  for (const f of findings) {
    const engId = (f as Record<string, unknown>).engagementId as string;
    if (engId && !targetNames[engId]) {
      try {
        const eng = await db.engagement.findUnique({
          where: { id: engId },
          include: { target: { select: { name: true } } },
        });
        const tgt = (eng as Record<string, unknown>)?.target as Record<string, unknown> | null;
        targetNames[engId] = (tgt?.name as string) || "unknown";
      } catch {
        targetNames[engId] = "unknown";
      }
    }
  }

  const patches = await db.patch.findMany({ where: { status: "pending" } });

  const allIssues = [
    ...findings.map((f) => {
      const fr = f as Record<string, unknown>;
      const engId = fr.engagementId as string;
      return {
        id: fr.id as string,
        title: fr.title as string,
        severity: fr.severity as string,
        category: fr.category as string,
        source: "VAPT",
        target: targetNames[engId] || "unknown",
      };
    }),
    ...patches.map((p) => {
      const pr = p as Record<string, unknown>;
      return {
        id: pr.patchId as string,
        title: pr.title as string,
        severity: pr.severity as string,
        category: pr.cve ? "SQL Injection" : "Code Vulnerability",
        source: "SAST",
        target: pr.affectedFile as string,
      };
    }),
  ];

  const mapped = allIssues.map((issue) => {
    const categoryKey = Object.keys(DPDPA_SECTIONS).find((k) =>
      issue.category.includes(k) || issue.title.includes(k)
    ) || "Info Disclosure";
    return {
      ...issue,
      dpdpa: DPDPA_SECTIONS[categoryKey] ?? null,
      gdpr: GDPR_ARTICLES[categoryKey] ?? null,
      hipaa: HIPAA_RULES[categoryKey] ?? null,
      pci_dss: { rule: "Req 6.5", title: "Vulnerability scanning & remediation" },
      iso: { control: "A.8.8", title: "Technical vulnerability management" },
      soc2: { control: "CC7.1", title: "Vulnerability detection & remediation" },
    };
  });

  const totalIssues = mapped.length;
  const criticalOpen = mapped.filter((m) => m.severity === "critical").length;
  const highOpen = mapped.filter((m) => m.severity === "high").length;

  const computeScore = (base: number) => {
    let s = base;
    s -= Math.min(criticalOpen * 20, 60);
    s -= Math.min(highOpen * 10, 30);
    return Math.max(0, Math.min(100, s));
  };

  const dpdpaScore = computeScore(100);
  const isoScore = computeScore(95);
  const soc2Score = computeScore(95);

  const frameworks = [
    {
      name: "DPDPA 2023",
      full_name: "Digital Personal Data Protection Act (India)",
      score: dpdpaScore,
      status: dpdpaScore >= 80 ? "compliant" : dpdpaScore >= 50 ? "at-risk" : "non-compliant",
      icon: "shield",
      color: dpdpaScore >= 80 ? "#10b981" : dpdpaScore >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: mapped.filter((m) => m.dpdpa).length,
      sections: [
        { section: "§ 4", title: "Purpose Limitation & Notice", status: criticalOpen > 0 ? "violated" : "compliant" },
        { section: "§ 8(5)", title: "Security Safeguards", status: criticalOpen > 0 || highOpen > 0 ? "violated" : "compliant" },
        { section: "§ 8(6)", title: "Breach Notification (72h)", status: "pending-review" },
        { section: "§ 11", title: "Data Principal Rights", status: "not-assessed" },
        { section: "§ 16", title: "Cross-Border Transfer", status: "not-assessed" },
      ],
    },
    {
      name: "GDPR",
      full_name: "General Data Protection Regulation (EU)",
      score: dpdpaScore,
      status: dpdpaScore >= 80 ? "compliant" : dpdpaScore >= 50 ? "at-risk" : "non-compliant",
      icon: "globe",
      color: dpdpaScore >= 80 ? "#10b981" : dpdpaScore >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: mapped.filter((m) => m.gdpr).length,
      sections: [
        { section: "Art. 5", title: "Principles (lawfulness, purpose, minimization)", status: criticalOpen > 0 ? "violated" : "compliant" },
        { section: "Art. 25", title: "Data Protection by Design", status: highOpen > 0 ? "at-risk" : "compliant" },
        { section: "Art. 32", title: "Security of Processing", status: criticalOpen > 0 || highOpen > 0 ? "violated" : "compliant" },
        { section: "Art. 33", title: "Breach Notification (72h)", status: "pending-review" },
        { section: "Art. 35", title: "Data Protection Impact Assessment", status: "not-assessed" },
      ],
    },
    {
      name: "HIPAA",
      full_name: "Health Insurance Portability & Accountability Act (US)",
      score: dpdpaScore,
      status: dpdpaScore >= 80 ? "compliant" : dpdpaScore >= 50 ? "at-risk" : "non-compliant",
      icon: "heart",
      color: dpdpaScore >= 80 ? "#10b981" : dpdpaScore >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: mapped.filter((m) => m.hipaa).length,
      sections: [
        { section: "§ 164.312", title: "Technical Safeguards", status: criticalOpen > 0 ? "violated" : "compliant" },
        { section: "§ 164.404", title: "Breach Notification", status: "pending-review" },
        { section: "§ 164.308", title: "Administrative Safeguards", status: "not-assessed" },
      ],
    },
    {
      name: "PCI-DSS v4.0",
      full_name: "Payment Card Industry Data Security Standard",
      score: computeScore(95),
      status: computeScore(95) >= 80 ? "compliant" : computeScore(95) >= 50 ? "at-risk" : "non-compliant",
      icon: "credit-card",
      color: computeScore(95) >= 80 ? "#10b981" : computeScore(95) >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: totalIssues,
      sections: [
        { section: "Req 6.2.4", title: "Web app vulnerability scanning", status: totalIssues > 0 ? "at-risk" : "compliant" },
        { section: "Req 6.2.3", title: "Penetration testing", status: "compliant" },
        { section: "Req 11.3.1", title: "Internal penetration testing", status: "compliant" },
        { section: "Req 11.3.2", title: "External penetration testing", status: "compliant" },
      ],
    },
    {
      name: "ISO 27001:2022",
      full_name: "Information Security Management Systems",
      score: isoScore,
      status: isoScore >= 80 ? "compliant" : isoScore >= 50 ? "at-risk" : "non-compliant",
      icon: "award",
      color: isoScore >= 80 ? "#10b981" : isoScore >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: totalIssues,
      sections: [
        { section: "A.8.8", title: "Technical vulnerability management", status: totalIssues > 0 ? "at-risk" : "compliant" },
        { section: "A.8.29", title: "Security testing in development", status: "compliant" },
        { section: "A.5.34", title: "Privacy & protection of PII", status: criticalOpen > 0 ? "violated" : "compliant" },
      ],
    },
    {
      name: "SOC 2",
      full_name: "Service Organization Control 2",
      score: soc2Score,
      status: soc2Score >= 80 ? "compliant" : soc2Score >= 50 ? "at-risk" : "non-compliant",
      icon: "check-shield",
      color: soc2Score >= 80 ? "#10b981" : soc2Score >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: totalIssues,
      sections: [
        { section: "CC7.1", title: "Vulnerability detection & monitoring", status: totalIssues > 0 ? "at-risk" : "compliant" },
        { section: "CC7.2", title: "Incident detection & response", status: "compliant" },
        { section: "CC6.6", title: "Logical access security", status: criticalOpen > 0 ? "violated" : "compliant" },
      ],
    },
  ];

  const overallScore = Math.round(frameworks.reduce((s, f) => s + f.score, 0) / frameworks.length);

  return {
    overallScore,
    frameworks,
    mapped,
    totalIssues,
    criticalOpen,
    highOpen,
  };
}

// GET /api/compliance?framework=DPDPA|ISO27001|SOC2
// Returns the full multi-framework summary (legacy) PLUS a deep dive into
// the selected framework (default DPDPA) with per-section evidence +
// the transparent score breakdown.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(req.url);
  const requested = url.searchParams.get("framework");
  const frameworkId: FrameworkId = isValidFramework(requested) ? requested : "DPDPA";

  const cacheKey = `framework:${frameworkId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...(cached.data as Record<string, unknown>),
      cached: true,
      cached_at: cached.cachedAt,
      cached_until: new Date(cached.expiresAt).toISOString(),
    });
  }

  // ── Build the deep dive for the selected framework ──────────────────────
  const frameworkDef = FRAMEWORK_MAP[frameworkId];
  const frameworkStatus = collectFrameworkEvidence(frameworkDef);
  const [manual, remediation] = await Promise.all([
    getManualActivityCounts(),
    getRemediationCounts(),
  ]);
  const scoreBreakdown = scoreFramework(frameworkStatus, manual, remediation);

  // Attach the level onto the framework status.
  const frameworkDetail = {
    ...frameworkStatus,
    level: scoreBreakdown.level,
    score: scoreBreakdown.score,
  };

  // ── Build the legacy multi-framework summary (cached separately) ────────
  const legacyCacheKey = "legacy-summary";
  let legacy = getCached(legacyCacheKey);
  if (!legacy) {
    const built = await buildLegacyFrameworks();
    setCached(legacyCacheKey, built);
    legacy = getCached(legacyCacheKey)!;
  }
  const legacyData = legacy.data as {
    overallScore: number;
    frameworks: unknown[];
    mapped: unknown[];
    totalIssues: number;
    criticalOpen: number;
    highOpen: number;
  };

  // ── DPDPA-specific findings mapping (legacy) ────────────────────────────
  const dpdpaFindings = (legacyData.mapped as Array<Record<string, unknown>>)
    .filter((m) => m.dpdpa)
    .map((m) => ({
      issue_id: m.id as string,
      title: m.title as string,
      severity: m.severity as string,
      source: m.source as string,
      target: m.target as string,
      dpdpa_section: (m.dpdpa as { section: string }).section,
      dpdpa_title: (m.dpdpa as { title: string }).title,
      dpdpa_requirement: (m.dpdpa as { requirement: string }).requirement,
      status: "open",
    }));

  const overallScore = legacyData.overallScore;

  const response = {
    // Legacy fields (backward compat)
    overall_score: overallScore,
    overall_status: overallScore >= 80 ? "compliant" : overallScore >= 50 ? "at-risk" : "non-compliant",
    total_findings: legacyData.totalIssues,
    critical_open: legacyData.criticalOpen,
    high_open: legacyData.highOpen,
    frameworks: legacyData.frameworks,
    dpdpa_findings: dpdpaFindings,
    breach_notification_required: legacyData.criticalOpen > 0,
    mapped_issues: legacyData.mapped,

    // NEW: deep dive into the selected framework
    framework_detail: frameworkDetail,

    // NEW: transparent scoring breakdown
    score_breakdown: scoreBreakdown,

    // NEW: available frameworks (for the UI selector)
    available_frameworks: ["DPDPA", "ISO27001", "SOC2"] as FrameworkId[],
    selected_framework: frameworkId,
  };

  setCached(cacheKey, response);

  return NextResponse.json({
    ...response,
    cached: false,
    cached_at: new Date().toISOString(),
  });
}
