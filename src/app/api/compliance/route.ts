import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// DPDPA 2023 sections relevant to security findings
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

// GDPR articles
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

// HIPAA Security Rule
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

const SEV_WEIGHT: Record<string, number> = { critical: 0, high: 20, medium: 40, low: 60, info: 80 };

// GET /api/compliance, multi-framework compliance status
export async function GET() {
  const findings = await db.finding.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Resolve engagement → target names separately (dispatcher can't do nested includes)
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

  // Also pull patch findings (from SAST)
  const patches = await db.patch.findMany({
    where: { status: "pending" },
  });

  // Combine all security issues
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

  // Map each issue to frameworks
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

  // Compute per-framework compliance score
  const totalIssues = mapped.length;
  const criticalOpen = mapped.filter((m) => m.severity === "critical").length;
  const highOpen = mapped.filter((m) => m.severity === "high").length;

  const computeScore = (base: number) => {
    let s = base;
    s -= Math.min(criticalOpen * 20, 60);
    s -= Math.min(highOpen * 10, 30);
    return Math.max(0, Math.min(100, s));
  };

  const frameworks = [
    {
      name: "DPDPA 2023",
      full_name: "Digital Personal Data Protection Act (India)",
      score: computeScore(100),
      status: computeScore(100) >= 80 ? "compliant" : computeScore(100) >= 50 ? "at-risk" : "non-compliant",
      icon: "shield",
      color: computeScore(100) >= 80 ? "#10b981" : computeScore(100) >= 50 ? "#f59e0b" : "#ef4444",
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
      score: computeScore(100),
      status: computeScore(100) >= 80 ? "compliant" : computeScore(100) >= 50 ? "at-risk" : "non-compliant",
      icon: "globe",
      color: computeScore(100) >= 80 ? "#10b981" : computeScore(100) >= 50 ? "#f59e0b" : "#ef4444",
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
      score: computeScore(100),
      status: computeScore(100) >= 80 ? "compliant" : computeScore(100) >= 50 ? "at-risk" : "non-compliant",
      icon: "heart",
      color: computeScore(100) >= 80 ? "#10b981" : computeScore(100) >= 50 ? "#f59e0b" : "#ef4444",
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
      score: computeScore(95),
      status: computeScore(95) >= 80 ? "compliant" : computeScore(95) >= 50 ? "at-risk" : "non-compliant",
      icon: "award",
      color: computeScore(95) >= 80 ? "#10b981" : computeScore(95) >= 50 ? "#f59e0b" : "#ef4444",
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
      score: computeScore(95),
      status: computeScore(95) >= 80 ? "compliant" : computeScore(95) >= 50 ? "at-risk" : "non-compliant",
      icon: "check-shield",
      color: computeScore(95) >= 80 ? "#10b981" : computeScore(95) >= 50 ? "#f59e0b" : "#ef4444",
      mapped_findings: totalIssues,
      sections: [
        { section: "CC7.1", title: "Vulnerability detection & monitoring", status: totalIssues > 0 ? "at-risk" : "compliant" },
        { section: "CC7.2", title: "Incident detection & response", status: "compliant" },
        { section: "CC6.6", title: "Logical access security", status: criticalOpen > 0 ? "violated" : "compliant" },
      ],
    },
  ];

  const overallScore = Math.round(frameworks.reduce((s, f) => s + f.score, 0) / frameworks.length);

  // DPDPA-specific findings mapping
  const dpdpaFindings = mapped
    .filter((m) => m.dpdpa)
    .map((m) => ({
      issue_id: m.id,
      title: m.title,
      severity: m.severity,
      source: m.source,
      target: m.target,
      dpdpa_section: m.dpdpa!.section,
      dpdpa_title: m.dpdpa!.title,
      dpdpa_requirement: m.dpdpa!.requirement,
      status: "open",
    }));

  return NextResponse.json({
    overall_score: overallScore,
    overall_status: overallScore >= 80 ? "compliant" : overallScore >= 50 ? "at-risk" : "non-compliant",
    total_findings: totalIssues,
    critical_open: criticalOpen,
    high_open: highOpen,
    frameworks,
    dpdpa_findings: dpdpaFindings,
    breach_notification_required: criticalOpen > 0,
    mapped_issues: mapped,
  });
}
