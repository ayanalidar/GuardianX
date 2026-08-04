/**
 * ISO/IEC 27001:2022 — Annex A control framework.
 *
 * Annex A contains 93 controls grouped into 4 themes:
 *   - A.5  Organizational controls (37)
 *   - A.6  People controls (8)
 *   - A.7  Physical controls (14)
 *   - A.8  Technological controls (34)
 *
 * For GuardianX's compliance dashboard we surface a curated subset of
 * Annex A controls that map directly to evidence GuardianX can collect
 * automatically (vulnerability management, access control, logging, etc.).
 * The full 93-control list can be loaded later for an external audit.
 */

import type { FrameworkDef } from "./types";

export const ISO27001_FRAMEWORK: FrameworkDef = {
  id: "ISO27001",
  name: "ISO 27001:2022",
  fullName: "ISO/IEC 27001:2022 — Information Security Management Systems",
  description:
    "International standard for establishing, implementing, maintaining, and continually improving an Information Security Management System (ISMS). Annex A enumerates 93 controls across organizational, people, physical, and technological themes.",
  sections: [
    {
      id: "iso-a5",
      section: "A.5",
      title: "Organizational Controls",
      description: "Controls addressing information security policies, roles, asset management, and supplier relationships.",
      controls: [
        {
          id: "iso-a5-1",
          title: "Policies for information security",
          ref: "A.5.1",
          description: "An information security policy is approved, published, and communicated.",
          automatedChecks: [
            {
              id: "iso-a5-1-policy",
              checkType: "privacy-policy-exists",
              description: "A published security / privacy policy exists.",
              expectedEvidence: "Public privacy policy page + internal security policy doc.",
            },
          ],
          manualEvidence: ["Approved ISMS policy document.", "Annual policy review record."],
          recommendations: ["Publish the ISMS policy on the internal wiki and review annually."],
        },
        {
          id: "iso-a5-24",
          title: "Information security incident management planning",
          ref: "A.5.24",
          description: "An incident management plan is defined and tested.",
          automatedChecks: [
            {
              id: "iso-a5-24-incident",
              checkType: "incident-response-endpoint",
              description: "Incident management endpoints exist.",
              expectedEvidence: "/api/incidents + /api/playbooks support IR workflows.",
            },
          ],
          manualEvidence: ["Tabletop exercise report.", "Incident response runbook."],
          recommendations: ["Run quarterly tabletop exercises and update the runbook."],
        },
        {
          id: "iso-a5-34",
          title: "Privacy and protection of PII",
          ref: "A.5.34",
          description: "PII is identified and protected in accordance with applicable laws (e.g. DPDPA).",
          automatedChecks: [
            {
              id: "iso-a5-34-privacy",
              checkType: "privacy-policy-exists",
              description: "Privacy notice exists.",
              expectedEvidence: "/privacy page exists.",
            },
            {
              id: "iso-a5-34-data-privacy",
              checkType: "data-privacy-scanner",
              description: "Automated privacy risk scanner exists.",
              expectedEvidence: "/api/data-privacy scans codebases and findings for PII exposure.",
            },
          ],
          manualEvidence: ["PII inventory.", "DPIA reports."],
          recommendations: ["Maintain a PII inventory and re-scan monthly."],
        },
      ],
    },
    {
      id: "iso-a6",
      section: "A.6",
      title: "People Controls",
      description: "Controls addressing background checks, terms of employment, awareness, and disciplinary process.",
      controls: [
        {
          id: "iso-a6-3",
          title: "Information security awareness, education, and training",
          ref: "A.6.3",
          description: "Personnel receive appropriate security awareness training.",
          automatedChecks: [
            {
              id: "iso-a6-3-awareness",
              checkType: "security-awareness-training",
              description: "Security awareness material is documented and accessible.",
              expectedEvidence: "Onboarding doc / wiki page covering security awareness.",
            },
          ],
          manualEvidence: ["Training completion records per employee."],
          recommendations: ["Add a security-awareness module to onboarding and re-train annually."],
        },
      ],
    },
    {
      id: "iso-a7",
      section: "A.7",
      title: "Physical Controls",
      description: "Controls addressing offices, facilities, equipment, and physical access.",
      controls: [
        {
          id: "iso-a7-2",
          title: "Physical entry",
          ref: "A.7.2",
          description: "Physical access to information processing facilities is restricted.",
          automatedChecks: [
            {
              id: "iso-a7-2-physical",
              checkType: "physical-access-control",
              description: "Physical access control policy is documented.",
              expectedEvidence: "Office access badge policy document.",
            },
          ],
          manualEvidence: ["Badge access logs.", "Visitor sign-in register."],
          recommendations: ["Implement badge-based access and review logs monthly."],
        },
      ],
    },
    {
      id: "iso-a8",
      section: "A.8",
      title: "Technological Controls",
      description: "Controls addressing technical security measures — access control, encryption, logging, vulnerability management.",
      controls: [
        {
          id: "iso-a8-2",
          title: "Privileged access rights",
          ref: "A.8.2",
          description: "Privileged access rights are restricted, logged, and reviewed.",
          automatedChecks: [
            {
              id: "iso-a8-2-rbac",
              checkType: "auth-strong",
              description: "Role-based access control is implemented.",
              expectedEvidence: "Middleware enforces admin / analyst / viewer roles.",
            },
            {
              id: "iso-a8-2-2fa",
              checkType: "two-factor-endpoint",
              description: "Two-factor authentication is supported.",
              expectedEvidence: "/api/2fa implements TOTP 2FA.",
            },
          ],
          manualEvidence: ["Quarterly privileged-access review."],
          recommendations: ["Require 2FA for all admin accounts."],
        },
        {
          id: "iso-a8-5",
          title: "Secure authentication",
          ref: "A.8.5",
          description: "Strong authentication mechanisms are implemented (bcrypt + JWT + 2FA).",
          automatedChecks: [
            {
              id: "iso-a8-5-auth",
              checkType: "auth-strong",
              description: "Strong password hashing + JWT.",
              expectedEvidence: "src/lib/auth.ts uses bcrypt (12 rounds) + signed JWT.",
            },
          ],
          manualEvidence: ["Password policy document."],
          recommendations: ["Enforce ≥12 char passwords + breach-list checking."],
        },
        {
          id: "iso-a8-15",
          title: "Logging",
          ref: "A.8.15",
          description: "Logs recording user activities, exceptions, faults, and information security events are produced, stored, and reviewed.",
          automatedChecks: [
            {
              id: "iso-a8-15-logging",
              checkType: "audit-log-endpoint",
              description: "Audit log endpoint exists.",
              expectedEvidence: "/api/audit-log returns system activity trail.",
            },
            {
              id: "iso-a8-15-siem",
              checkType: "siem-endpoint",
              description: "SIEM ingestion endpoint exists.",
              expectedEvidence: "/api/siem/ingest accepts event data.",
            },
          ],
          manualEvidence: ["Log retention policy.", "Log review schedule."],
          recommendations: ["Forward audit logs to /api/siem/ingest for retention + search."],
        },
        {
          id: "iso-a8-8",
          title: "Management of technical vulnerabilities",
          ref: "A.8.8",
          description: "Information about technical vulnerabilities is obtained and corrective action taken.",
          automatedChecks: [
            {
              id: "iso-a8-8-vuln",
              checkType: "vuln-management",
              description: "Vulnerability management pipeline exists.",
              expectedEvidence: "Patches, findings, scans tables are populated.",
            },
          ],
          manualEvidence: ["Monthly vulnerability scan report.", "Penetration test report."],
          recommendations: ["Run weekly SAST scans and quarterly third-party pen tests."],
        },
        {
          id: "iso-a8-24",
          title: "Use of cryptography",
          ref: "A.8.24",
          description: "Cryptography is used appropriately and effectively.",
          automatedChecks: [
            {
              id: "iso-a8-24-crypto",
              checkType: "encryption-evidence",
              description: "AES-256-GCM is used for credential encryption.",
              expectedEvidence: "src/lib/sentinel/crypto.ts implements AES-256-GCM.",
            },
          ],
          manualEvidence: ["Key management policy."],
          recommendations: ["Rotate encryption keys annually."],
        },
      ],
    },
  ],
};
