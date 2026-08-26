/**
 * SOC 2 — Trust Services Criteria (TSC) framework.
 *
 * SOC 2 evaluates service organizations against five Trust Services Criteria:
 *   - Security (Common Criteria, always required) — CC1–CC9
 *   - Availability                          — A1
 *   - Processing Integrity                  — PI1
 *   - Confidentiality                       — C1
 *   - Privacy                               — P1–P8
 *
 * GuardianX surfaces a curated subset whose evidence can be collected
 * automatically — vulnerability detection (CC7.1), access control (CC6.x),
 * incident response (CC7.3 / CC7.4), monitoring (CC7.2), etc.
 */

import type { FrameworkDef } from "./types";

export const SOC2_FRAMEWORK: FrameworkDef = {
  id: "SOC2",
  name: "SOC 2",
  fullName: "SOC 2 — Trust Services Criteria (AICPA)",
  description:
    "AICPA auditing framework for service organizations, evaluating controls relevant to Security, Availability, Processing Integrity, Confidentiality, and Privacy. The Security (Common Criteria) section is always required; the others are optional.",
  sections: [
    {
      id: "soc2-cc",
      section: "CC",
      title: "Common Criteria (Security)",
      description: "The Security criteria are required for every SOC 2 examination and address the suitability of design + operating effectiveness of controls.",
      controls: [
        {
          id: "soc2-cc1",
          title: "Control environment",
          ref: "CC1",
          description: "Management establishes structure, accountability, and tone at the top.",
          automatedChecks: [
            {
              id: "soc2-cc1-policy",
              checkType: "privacy-policy-exists",
              description: "A published security / privacy policy exists.",
              expectedEvidence: "/privacy page + internal policy doc.",
            },
          ],
          manualEvidence: ["Org chart with security roles.", "Code of conduct."],
          recommendations: ["Publish an annual security accountability statement."],
        },
        {
          id: "soc2-cc6-1",
          title: "Logical access security",
          ref: "CC6.1",
          description: "Logical and physical access controls are implemented to permit only authorized use.",
          automatedChecks: [
            {
              id: "soc2-cc6-1-auth",
              checkType: "auth-strong",
              description: "Strong authentication is enforced.",
              expectedEvidence: "bcrypt + JWT auth, admin / analyst / viewer RBAC.",
            },
            {
              id: "soc2-cc6-1-2fa",
              checkType: "two-factor-endpoint",
              description: "2FA is supported.",
              expectedEvidence: "/api/2fa implements TOTP.",
            },
          ],
          manualEvidence: ["Access review records.", "Termination checklist."],
          recommendations: ["Run quarterly access reviews and remove stale accounts."],
        },
        {
          id: "soc2-cc6-6",
          title: "Logical access security over assets",
          ref: "CC6.6",
          description: "Public-facing system components are protected against unauthorized access.",
          automatedChecks: [
            {
              id: "soc2-cc6-6-middleware",
              checkType: "auth-strong",
              description: "API middleware enforces auth on protected routes.",
              expectedEvidence: "src/middleware.ts requires a JWT on all /api/* routes.",
            },
          ],
          manualEvidence: ["Network diagram.", "Firewall ruleset."],
          recommendations: ["Review middleware PUBLIC_ROUTES list quarterly."],
        },
        {
          id: "soc2-cc7-1",
          title: "Vulnerability detection & remediation",
          ref: "CC7.1",
          description: "The entity detects vulnerabilities and remediates them within SLA.",
          automatedChecks: [
            {
              id: "soc2-cc7-1-vuln",
              checkType: "vuln-management",
              description: "Vulnerability management pipeline exists.",
              expectedEvidence: "Patches, findings, scans are populated by SAST + VAPT.",
            },
          ],
          manualEvidence: ["MTTR report.", "SLA breach log."],
          recommendations: ["Enforce SLA: critical ≤ 7 days, high ≤ 30 days."],
        },
        {
          id: "soc2-cc7-2",
          title: "Incident detection & response",
          ref: "CC7.2",
          description: "Anomalous events are detected and responded to.",
          automatedChecks: [
            {
              id: "soc2-cc7-2-anomaly",
              checkType: "anomaly-detection-endpoint",
              description: "Anomaly detection + SIEM exist.",
              expectedEvidence: "/api/anomaly-detection + /api/siem/ingest exist.",
            },
            {
              id: "soc2-cc7-2-incident",
              checkType: "incident-response-endpoint",
              description: "Incident response endpoints exist.",
              expectedEvidence: "/api/incidents supports create / contain / timeline.",
            },
          ],
          manualEvidence: ["IR runbook.", "Post-incident review reports."],
          recommendations: ["Wire anomaly detection to /api/alerts for on-call notification."],
        },
        {
          id: "soc2-cc7-3",
          title: "Security event evaluation",
          ref: "CC7.3",
          description: "Security events are evaluated to determine impact and response.",
          automatedChecks: [
            {
              id: "soc2-cc7-3-correlation",
              checkType: "siem-endpoint",
              description: "Correlation engine evaluates events.",
              expectedEvidence: "/api/correlation + /api/siem/rules exist.",
            },
          ],
          manualEvidence: ["Correlation rule documentation."],
          recommendations: ["Document each correlation rule and its rationale."],
        },
        {
          id: "soc2-cc7-4",
          title: "Incident communication",
          ref: "CC7.4",
          description: "Incidents are communicated to internal and external stakeholders.",
          automatedChecks: [
            {
              id: "soc2-cc7-4-breach",
              checkType: "breach-notification-endpoint",
              description: "Breach notification system exists.",
              expectedEvidence: "/api/breach-notification drafts § 8(6) / SOC 2 notices.",
            },
          ],
          manualEvidence: ["Incident communication plan."],
          recommendations: ["Pre-draft notification templates for top incident scenarios."],
        },
      ],
    },
    {
      id: "soc2-a1",
      section: "A1",
      title: "Availability",
      description: "The system is available for operation and use to meet objectives.",
      controls: [
        {
          id: "soc2-a1-2",
          title: "Environmental protections + backup",
          ref: "A1.2",
          description: "Availability protections (backups, redundancy) are implemented.",
          automatedChecks: [
            {
              id: "soc2-a1-2-backup",
              checkType: "backup-evidence",
              description: "Backup / rollback mechanism exists.",
              expectedEvidence: "/api/rollback-snapshot + /api/rollback/[patchId] exist.",
            },
          ],
          manualEvidence: ["Backup policy + restore test."],
          recommendations: ["Run quarterly restore tests."],
        },
      ],
    },
    {
      id: "soc2-c1",
      section: "C1",
      title: "Confidentiality",
      description: "Information designated as confidential is protected.",
      controls: [
        {
          id: "soc2-c1-1",
          title: "Confidential data protection",
          ref: "C1.1",
          description: "Confidential data is identified and encrypted in transit + at rest.",
          automatedChecks: [
            {
              id: "soc2-c1-1-crypto",
              checkType: "encryption-evidence",
              description: "AES-256-GCM is used for credentials at rest.",
              expectedEvidence: "src/lib/sentinel/crypto.ts.",
            },
            {
              id: "soc2-c1-1-tls",
              checkType: "tls-config",
              description: "TLS is enforced in production.",
              expectedEvidence: "Cookies set Secure in production; middleware enforces HTTPS.",
            },
          ],
          manualEvidence: ["Data classification policy."],
          recommendations: ["Tag every data store with a classification label."],
        },
      ],
    },
    {
      id: "soc2-p1",
      section: "P",
      title: "Privacy",
      description: "Personal information is collected, used, retained, disclosed, and disposed of in line with the privacy notice and applicable laws (DPDPA, GDPR).",
      controls: [
        {
          id: "soc2-p1-1",
          title: "Privacy notice",
          ref: "P3.1",
          description: "A privacy notice describes the types of personal information collected and the purposes.",
          automatedChecks: [
            {
              id: "soc2-p1-1-notice",
              checkType: "privacy-policy-exists",
              description: "Privacy policy page exists.",
              expectedEvidence: "/privacy page is published.",
            },
          ],
          manualEvidence: ["Notice versioning log."],
          recommendations: ["Version the notice and track consent per version."],
        },
        {
          id: "soc2-p1-2",
          title: "Data principal rights",
          ref: "P5.1 / P5.2",
          description: "Data principals can access, correct, and erase their personal information.",
          automatedChecks: [
            {
              id: "soc2-p1-2-access",
              checkType: "user-self-access",
              description: "Self-access endpoint exists.",
              expectedEvidence: "/api/auth/session returns the user's profile.",
            },
            {
              id: "soc2-p1-2-erase",
              checkType: "account-deletion-endpoint",
              description: "Account deletion endpoint exists.",
              expectedEvidence: "DELETE /api/users?id=... exists.",
            },
            {
              id: "soc2-p1-2-export",
              checkType: "data-export-endpoint",
              description: "Data export endpoint exists.",
              expectedEvidence: "/api/audit-export produces a data pack.",
            },
          ],
          manualEvidence: ["Access / erasure request log."],
          recommendations: ["Add a self-serve 'Delete my account' button."],
        },
      ],
    },
  ],
};
