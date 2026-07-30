import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/data-privacy — scan for data privacy risks under DPDPA.
// Checks: PII collection without consent indicators, data retention issues,
// cross-border transfer risks (DPDPA §16), sensitive data in responses.

export async function GET() {
  // Get all VAPT findings to analyze for privacy risks
  const findings = await db.finding.findMany({
    include: { engagement: { include: { target: { select: { name: true, baseUrl: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  // Also check codebases for PII handling patterns
  const codebases = await db.codebase.findMany({
    select: { name: true, sourceCode: true },
  });

  const privacyRisks: Array<{
    risk_type: string;
    dpdpa_section: string;
    severity: string;
    description: string;
    source: string;
    recommendation: string;
  }> = [];

  // 1. Check VAPT findings for PII exposure
  for (const f of findings) {
    const text = `${f.title} ${f.description} ${f.proofResponse}`.toLowerCase();
    if (text.includes("ssn") || text.includes("social security")) {
      privacyRisks.push({
        risk_type: "Sensitive Personal Data Exposed",
        dpdpa_section: "§ 9 (Sensitive Personal Data)",
        severity: "critical",
        description: `SSN/Social Security Number exposed at ${f.endpoint} on ${f.engagement.target.name}. DPDPA classifies SSN as sensitive personal data requiring enhanced protection.`,
        source: `VAPT finding: ${f.title}`,
        recommendation: "Immediately mask or remove SSN from API responses. Implement field-level access control. Notify affected data principals.",
      });
    }
    if (text.includes("email") && f.category.includes("Exposure")) {
      privacyRisks.push({
        risk_type: "Personal Data (Email) Exposure",
        dpdpa_section: "§ 8(5) (Security Safeguards)",
        severity: "high",
        description: `Email addresses exposed at ${f.endpoint}. Under DPDPA, email is personal data and must be protected against unauthorized access.`,
        source: `VAPT finding: ${f.title}`,
        recommendation: "Restrict email exposure to authorized endpoints only. Implement data minimization — only return emails when necessary.",
      });
    }
    if (text.includes("password") && f.category.includes("Exposure")) {
      privacyRisks.push({
        risk_type: "Credential Exposure",
        dpdpa_section: "§ 8(5) (Security Safeguards)",
        severity: "critical",
        description: `Passwords or credentials exposed at ${f.endpoint}. This is a severe security safeguard failure under DPDPA.`,
        source: `VAPT finding: ${f.title}`,
        recommendation: "Rotate all exposed credentials immediately. Never store or transmit passwords in plaintext. Implement proper hashing (bcrypt/argon2).",
      });
    }
  }

  // 2. Scan codebase source for privacy patterns
  for (const cb of codebases) {
    const src = cb.sourceCode.toLowerCase();

    // Check for PII collection without consent verification
    if (src.includes("email") && src.includes("post") && !src.includes("consent")) {
      privacyRisks.push({
        risk_type: "PII Collection Without Consent Verification",
        dpdpa_section: "§ 4(1) (Consent)",
        severity: "high",
        description: `${cb.name} collects personal data (email) but has no visible consent verification mechanism. DPDPA requires explicit, informed consent before processing personal data.`,
        source: `Codebase scan: ${cb.name}`,
        recommendation: "Implement a consent collection mechanism before processing personal data. Store consent records with timestamps. Provide a withdrawal option.",
      });
    }

    // Check for plaintext password storage
    if (src.includes("password") && !src.includes("hash") && !src.includes("bcrypt") && !src.includes("argon")) {
      privacyRisks.push({
        risk_type: "Plaintext Password Storage",
        dpdpa_section: "§ 8(5) (Security Safeguards)",
        severity: "critical",
        description: `${cb.name} appears to handle passwords without hashing. Storing passwords in plaintext is a severe DPDPA violation.`,
        source: `Codebase scan: ${cb.name}`,
        recommendation: "Hash all passwords using bcrypt or argon2 before storage. Never log or transmit plaintext passwords.",
      });
    }

    // Check for cross-border data transfer indicators
    if (src.includes("aws") || src.includes("stripe") || src.includes("googleapis")) {
      privacyRisks.push({
        risk_type: "Cross-Border Data Transfer Risk",
        dpdpa_section: "§ 16 (Cross-Border Transfer)",
        severity: "medium",
        description: `${cb.name} references foreign cloud services (AWS/Stripe/Google). DPDPA §16 restricts transfer of personal data to countries not approved by the Central Government. Verify that no personal data flows to these services without authorization.`,
        source: `Codebase scan: ${cb.name}`,
        recommendation: "Audit all data flows to foreign services. Ensure personal data is only transferred to countries on the approved list. Implement data localization where required.",
      });
    }

    // Check for data retention issues (no deletion mechanism)
    if ((src.includes("insert") || src.includes("push") || src.includes("create")) && !src.includes("delete") && !src.includes("remove")) {
      privacyRisks.push({
        risk_type: "No Data Retention/Deletion Mechanism",
        dpdpa_section: "§ 10 (Data Retention)",
        severity: "medium",
        description: `${cb.name} appears to store data without a deletion mechanism. DPDPA requires that personal data be deleted when the purpose for collection is no longer served.`,
        source: `Codebase scan: ${cb.name}`,
        recommendation: "Implement data retention policies with automatic deletion. Provide data erasure capability for data principal requests (§ 11(3)(b)).",
      });
    }

    // Check for logging of sensitive data
    if (src.includes("console.log") && (src.includes("password") || src.includes("email") || src.includes("token"))) {
      privacyRisks.push({
        risk_type: "Sensitive Data in Logs",
        dpdpa_section: "§ 8(5) (Security Safeguards)",
        severity: "high",
        description: `${cb.name} logs sensitive data (passwords/emails/tokens) to console. Logs may be accessible to unauthorized parties.`,
        source: `Codebase scan: ${cb.name}`,
        recommendation: "Never log sensitive personal data. Implement log sanitization filters. Use structured logging with field-level redaction.",
      });
    }
  }

  // Compute privacy risk score
  const critical = privacyRisks.filter((r) => r.severity === "critical").length;
  const high = privacyRisks.filter((r) => r.severity === "high").length;
  const medium = privacyRisks.filter((r) => r.severity === "medium").length;
  let privacyScore = 100;
  privacyScore -= Math.min(critical * 20, 60);
  privacyScore -= Math.min(high * 10, 30);
  privacyScore -= Math.min(medium * 5, 15);
  privacyScore = Math.max(0, privacyScore);

  return NextResponse.json({
    privacy_score: privacyScore,
    privacy_status: privacyScore >= 80 ? "compliant" : privacyScore >= 50 ? "at-risk" : "non-compliant",
    total_risks: privacyRisks.length,
    critical_risks: critical,
    high_risks: high,
    medium_risks: medium,
    dpdpa_sections_assessed: ["§ 4 (Consent)", "§ 8(5) (Security Safeguards)", "§ 9 (Sensitive Personal Data)", "§ 10 (Data Retention)", "§ 11 (Data Principal Rights)", "§ 16 (Cross-Border Transfer)"],
    risks: privacyRisks,
  });
}
