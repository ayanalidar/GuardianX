/**
 * DPDPA 2023 (Digital Personal Data Protection Act, India) structured framework.
 *
 * Maps every relevant DPDPA section to:
 *   - control objectives (what the section requires)
 *   - required evidence (what an auditor needs to see)
 *   - automated checks (what GuardianX can verify against its own codebase)
 *
 * Section list (per the task spec):
 *   § 4   Obligations of Data Fiduciary
 *   § 5   Grounds for Processing Personal Data
 *   § 6   Consent
 *   § 7   Legitimate Uses
 *   § 8   Obligations before Notice
 *   § 9   Data Principal Rights
 *   § 10  Right to Access Information
 *   § 11  Right to Correction and Erasure
 *   § 12  Right of Grievance Redressal
 *   § 13  Right to Nominate
 *   § 14  Consent Manager
 *   § 17  Exemptions
 *   § 20  Power to Call for Information
 *   § 25  Penalties
 */

import type { FrameworkDef } from "./types";

export const DPDPA_FRAMEWORK: FrameworkDef = {
  id: "DPDPA",
  name: "DPDPA 2023",
  fullName: "Digital Personal Data Protection Act, 2023 (India)",
  description:
    "India's data protection law governing the processing of digital personal data. " +
    "Imposes obligations on Data Fiduciaries, grants rights to Data Principals, " +
    "and prescribes penalties for non-compliance.",
  sections: [
    {
      id: "sec-4",
      section: "§ 4",
      title: "Obligations of Data Fiduciary",
      description:
        "Every Data Fiduciary shall be responsible for complying with the Act in relation to any personal data processed by it. " +
        "Processing must be for a lawful purpose, be limited to what is necessary, and be fair and transparent.",
      controls: [
        {
          id: "sec-4-ctrl-1",
          title: "Purpose limitation",
          ref: "§ 4(2)(a)",
          description:
            "Personal data is processed only for the explicit purpose disclosed to the Data Principal at the time of collection.",
          automatedChecks: [
            {
              id: "dpdpa-4-purpose-stated",
              checkType: "privacy-policy-purpose",
              description: "Privacy policy states the purposes of data collection.",
              expectedEvidence: "Privacy policy page lists specific, lawful purposes for processing.",
            },
          ],
          manualEvidence: [
            "Internal data-flow map showing each processing purpose.",
            "Signed Data Fiduciary accountability statement.",
          ],
          recommendations: [
            "Maintain a Record of Processing Activities (ROPA) mapping each data field to its stated purpose.",
            "Review quarterly to ensure no scope creep beyond stated purposes.",
          ],
        },
        {
          id: "sec-4-ctrl-2",
          title: "Data minimization",
          ref: "§ 4(2)(b)",
          description:
            "Collection is limited to what is necessary for the stated purpose.",
          automatedChecks: [
            {
              id: "dpdpa-4-minimization",
              checkType: "signup-minimal-fields",
              description: "Signup form collects only essential fields.",
              expectedEvidence: "Signup request schema lists minimal required fields (email, name, password).",
            },
          ],
          manualEvidence: ["Field-by-field justification document."],
          recommendations: [
            "Add a 'data minimization' checklist to the design review process.",
          ],
        },
      ],
    },
    {
      id: "sec-5",
      section: "§ 5",
      title: "Grounds for Processing Personal Data",
      description:
        "Personal data may be processed only where the Data Principal has given consent, or where processing is necessary for a 'legitimate use' listed under § 7.",
      controls: [
        {
          id: "sec-5-ctrl-1",
          title: "Lawful basis documented",
          ref: "§ 5",
          description:
            "Each processing activity has a documented lawful basis (consent or § 7 legitimate use).",
          automatedChecks: [
            {
              id: "dpdpa-5-lawful-basis",
              checkType: "privacy-policy-lawful-basis",
              description: "Privacy policy identifies the lawful basis for processing.",
              expectedEvidence: "Privacy policy mentions consent / legitimate uses as the basis.",
            },
          ],
          manualEvidence: ["ROPA with lawful basis column per processing activity."],
          recommendations: ["Tag every API that processes personal data with its lawful basis."],
        },
      ],
    },
    {
      id: "sec-6",
      section: "§ 6",
      title: "Consent",
      description:
        "Consent must be free, specific, informed, unconditional, and unambiguous with a clear affirmative action. It must be withdrawable as easily as it was given.",
      controls: [
        {
          id: "sec-6-ctrl-1",
          title: "Consent banner on first contact",
          ref: "§ 6(1)",
          description:
            "A consent / cookie banner is presented to the Data Principal on first visit and before any non-essential processing.",
          automatedChecks: [
            {
              id: "dpdpa-6-consent-banner",
              checkType: "consent-banner",
              description: "Cookie/consent banner component exists.",
              expectedEvidence: "A cookie-consent banner renders site-wide on first visit.",
            },
          ],
          manualEvidence: ["Screenshot of the live consent banner."],
          recommendations: [
            "Implement a CookieConsentBanner component mounted in the root layout, persisting choice in localStorage.",
          ],
        },
        {
          id: "sec-6-ctrl-2",
          title: "Consent at signup",
          ref: "§ 6(1)",
          description:
            "Signup explicitly captures consent (checkbox or affirmative action) and records the timestamp.",
          automatedChecks: [
            {
              id: "dpdpa-6-signup-consent",
              checkType: "signup-consent",
              description: "Signup endpoint captures an explicit consent flag.",
              expectedEvidence: "POST /api/auth/signup records a consent:true field with a timestamp.",
            },
          ],
          manualEvidence: ["Consent log table with user, timestamp, IP, and policy version."],
          recommendations: [
            "Add a required consent checkbox to the signup form and store the consent record server-side.",
          ],
        },
        {
          id: "sec-6-ctrl-3",
          title: "Consent withdrawal",
          ref: "§ 6(4)",
          description:
            "Data Principal can withdraw consent as easily as it was given.",
          automatedChecks: [
            {
              id: "dpdpa-6-consent-withdraw",
              checkType: "consent-withdraw-endpoint",
              description: "An endpoint exists to revoke consent and stop processing.",
              expectedEvidence: "DELETE /api/consent or equivalent that halts non-essential processing.",
            },
          ],
          manualEvidence: ["UI flow demonstrating consent withdrawal."],
          recommendations: [
            "Add a 'Privacy preferences' screen in user settings with a one-click consent toggle.",
          ],
        },
        {
          id: "sec-6-ctrl-4",
          title: "Privacy policy linked from consent UI",
          ref: "§ 6(2)",
          description:
            "Consent UI links to the full privacy policy.",
          automatedChecks: [
            {
              id: "dpdpa-6-policy-link",
              checkType: "privacy-policy-link",
              description: "Privacy policy is linked from the signup / consent flow.",
              expectedEvidence: "Auth page contains a link to /privacy.",
            },
          ],
          manualEvidence: [],
          recommendations: [],
        },
      ],
    },
    {
      id: "sec-7",
      section: "§ 7",
      title: "Legitimate Uses",
      description:
        "Certain processing activities are deemed 'legitimate uses' and do not require consent (e.g. voluntary provision, state functions, employment, disaster response).",
      controls: [
        {
          id: "sec-7-ctrl-1",
          title: "Legitimate uses documented",
          ref: "§ 7",
          description:
            "Where the Data Fiduciary relies on a legitimate use (not consent), the specific clause is documented.",
          automatedChecks: [
            {
              id: "dpdpa-7-legitimate-use-doc",
              checkType: "legitimate-use-doc",
              description: "Privacy policy references legitimate uses where applicable.",
              expectedEvidence: "Privacy policy mentions § 7 legitimate uses.",
            },
          ],
          manualEvidence: ["Mapping of each non-consent processing activity to a § 7 sub-clause."],
          recommendations: ["For each non-consent processing activity, cite the exact § 7 sub-clause relied upon."],
        },
      ],
    },
    {
      id: "sec-8",
      section: "§ 8",
      title: "Obligations before Notice & Security Safeguards",
      description:
        "The Data Fiduciary must give a clear, itemised notice to the Data Principal describing the data being processed, the purpose, the rights of the Data Principal, and how to grievance-redress. Reasonable security safeguards must be in place to prevent personal data breaches.",
      controls: [
        {
          id: "sec-8-ctrl-1",
          title: "Privacy notice exists and is accessible",
          ref: "§ 8(1)",
          description:
            "A clear privacy notice is published and reachable from every page.",
          automatedChecks: [
            {
              id: "dpdpa-8-privacy-page",
              checkType: "privacy-policy-exists",
              description: "Privacy policy page exists at /privacy.",
              expectedEvidence: "src/app/privacy/page.tsx renders a public privacy notice.",
            },
            {
              id: "dpdpa-8-privacy-linked",
              checkType: "privacy-policy-linked",
              description: "Privacy policy is linked from the site header / footer.",
              expectedEvidence: "Site header or footer contains a link to /privacy.",
            },
          ],
          manualEvidence: ["Versioned privacy notice with effective dates and changelog."],
          recommendations: [
            "Add a footer link to /privacy on every public page if not present.",
            "Version the policy and store historical versions for audit.",
          ],
        },
        {
          id: "sec-8-ctrl-2",
          title: "Security safeguards implemented",
          ref: "§ 8(5)",
          description:
            "Reasonable security safeguards prevent personal data breach — encryption, access control, vuln management.",
          automatedChecks: [
            {
              id: "dpdpa-8-encryption",
              checkType: "encryption-evidence",
              description: "Credentials are encrypted at rest (AES-256-GCM).",
              expectedEvidence: "src/lib/sentinel/crypto.ts implements AES-256-GCM.",
            },
            {
              id: "dpdpa-8-auth",
              checkType: "auth-strong",
              description: "Authentication uses bcrypt + JWT.",
              expectedEvidence: "src/lib/auth.ts uses bcrypt hashing and JWT tokens.",
            },
            {
              id: "dpdpa-8-vuln-mgmt",
              checkType: "vuln-management",
              description: "Vulnerability scanning pipeline exists.",
              expectedEvidence: "Patches, scans, and findings tables are populated by SAST + VAPT.",
            },
          ],
          manualEvidence: ["Annual penetration test report.", "ISMS policy document."],
          recommendations: [
            "Run weekly SAST scans and monthly VAPT engagements.",
            "Enable 2FA for all admin accounts (already supported by /api/2fa).",
          ],
        },
        {
          id: "sec-8-ctrl-3",
          title: "Breach notification capability",
          ref: "§ 8(6)",
          description:
            "On becoming aware of a personal data breach, notify the Data Protection Board and affected Data Principals.",
          automatedChecks: [
            {
              id: "dpdpa-8-breach-endpoint",
              checkType: "breach-notification-endpoint",
              description: "Breach notification API exists and drafts § 8(6) notifications.",
              expectedEvidence: "/api/breach-notification exists and returns notification drafts.",
            },
          ],
          manualEvidence: ["Breach response runbook with 72-hour SLA."],
          recommendations: [
            "Wire /api/breach-notification to alert the on-call via /api/alerts on detection.",
          ],
        },
      ],
    },
    {
      id: "sec-9",
      section: "§ 9",
      title: "Data Principal Rights",
      description:
        "The Data Principal has the right to access information about processing, correct / complete / update / erase personal data, the right of grievance redressal, and the right to nominate.",
      controls: [
        {
          id: "sec-9-ctrl-1",
          title: "Access right",
          ref: "§ 9 / § 10",
          description:
            "Data Principal can request and receive a summary of their personal data being processed.",
          automatedChecks: [
            {
              id: "dpdpa-9-access-endpoint",
              checkType: "user-self-access",
              description: "User can retrieve their own profile / personal data.",
              expectedEvidence: "GET /api/auth/session returns the user's profile.",
            },
            {
              id: "dpdpa-9-data-export",
              checkType: "data-export-endpoint",
              description: "User can export their personal data.",
              expectedEvidence: "/api/audit-export or a dedicated export endpoint serves a personal data pack.",
            },
          ],
          manualEvidence: ["Documented SLA for access requests (≤ 30 days per § 10(2))."],
          recommendations: ["Add a 'Download my data' button in user settings that hits a personal export endpoint."],
        },
        {
          id: "sec-9-ctrl-2",
          title: "Correction / erasure right",
          ref: "§ 9 / § 11",
          description:
            "Data Principal can correct, complete, update, or erase their personal data.",
          automatedChecks: [
            {
              id: "dpdpa-9-correction-endpoint",
              checkType: "user-correction-endpoint",
              description: "User can update their profile data.",
              expectedEvidence: "PATCH /api/users?id=... exists and accepts name / email updates.",
            },
            {
              id: "dpdpa-9-erasure-endpoint",
              checkType: "account-deletion-endpoint",
              description: "User (or admin on their behalf) can delete the account.",
              expectedEvidence: "DELETE /api/users?id=... exists and removes the user record.",
            },
          ],
          manualEvidence: ["Erasure request log showing completion within statutory window."],
          recommendations: [
            "Surface a 'Delete my account' button in user settings (currently only admins can delete).",
          ],
        },
        {
          id: "sec-9-ctrl-3",
          title: "Grievance right",
          ref: "§ 9 / § 12",
          description:
            "Data Principal can raise a grievance and have it acknowledged + resolved within statutory timelines.",
          automatedChecks: [
            {
              id: "dpdpa-9-grievance-email",
              checkType: "grievance-contact",
              description: "A grievance officer contact (email) is published.",
              expectedEvidence: "/contact or /privacy lists a grievance officer email.",
            },
            {
              id: "dpdpa-9-support-system",
              checkType: "support-ticket-system",
              description: "A ticket / playbook system exists to track grievances.",
              expectedEvidence: "/api/playbooks supports incident / grievance workflows.",
            },
          ],
          manualEvidence: ["Named Grievance Officer with designation and contact published."],
          recommendations: [
            "Publish the Grievance Officer's name + email on /privacy.",
            "Configure a 'privacy-grievance' playbook category in /api/playbooks.",
          ],
        },
      ],
    },
    {
      id: "sec-10",
      section: "§ 10",
      title: "Right to Access Information",
      description:
        "The Data Principal may request a summary of the personal data being processed, the purposes, the data shared with third parties, etc.",
      controls: [
        {
          id: "sec-10-ctrl-1",
          title: "Access request fulfilment",
          ref: "§ 10",
          description: "A documented, time-bound process exists for access requests.",
          automatedChecks: [
            {
              id: "dpdpa-10-access-flow",
              checkType: "user-self-access",
              description: "Self-serve access endpoint exists.",
              expectedEvidence: "/api/auth/session returns the user's profile summary.",
            },
          ],
          manualEvidence: ["SLA document (≤ 30 days) for access requests."],
          recommendations: ["Build a 'Request my data' form that creates a tracked ticket."],
        },
      ],
    },
    {
      id: "sec-11",
      section: "§ 11",
      title: "Right to Correction and Erasure",
      description:
        "The Data Principal may request correction, completion, update, or erasure of their personal data. The Data Fiduciary must action the request and notify third parties to whom the data was disclosed.",
      controls: [
        {
          id: "sec-11-ctrl-1",
          title: "Account deletion endpoint",
          ref: "§ 11",
          description: "An endpoint deletes a Data Principal's personal data.",
          automatedChecks: [
            {
              id: "dpdpa-11-delete-account",
              checkType: "account-deletion-endpoint",
              description: "DELETE /api/users removes the user record.",
              expectedEvidence: "/api/users implements DELETE.",
            },
            {
              id: "dpdpa-11-data-export",
              checkType: "data-export-endpoint",
              description: "Data export endpoint exists for portability.",
              expectedEvidence: "/api/audit-export serves a structured data pack.",
            },
          ],
          manualEvidence: ["Erasure propagation log to third parties."],
          recommendations: [
            "Cascade deletion to related records (scans, findings, chat messages) owned by the user.",
          ],
        },
      ],
    },
    {
      id: "sec-12",
      section: "§ 12",
      title: "Right of Grievance Redressal",
      description:
        "The Data Fiduciary must publish a Grievance Officer's contact details and resolve grievances within the prescribed timeline.",
      controls: [
        {
          id: "sec-12-ctrl-1",
          title: "Grievance officer published",
          ref: "§ 12",
          description: "Grievance officer name + contact published on the privacy / contact page.",
          automatedChecks: [
            {
              id: "dpdpa-12-grievance-officer",
              checkType: "grievance-contact",
              description: "Contact page or privacy policy lists a grievance email.",
              expectedEvidence: "mailto: link to grievance officer exists.",
            },
            {
              id: "dpdpa-12-ticket-system",
              checkType: "support-ticket-system",
              description: "A ticketing / playbook system tracks grievances.",
              expectedEvidence: "/api/playbooks endpoint exists.",
            },
          ],
          manualEvidence: ["Named Grievance Officer designation letter."],
          recommendations: [
            "Add a 'Privacy Grievance' category to /api/playbooks with a 21-day resolution SLA.",
          ],
        },
      ],
    },
    {
      id: "sec-13",
      section: "§ 13",
      title: "Right to Nominate",
      description:
            "The Data Principal may nominate another individual to exercise rights in the event of death or incapacity.",
      controls: [
        {
          id: "sec-13-ctrl-1",
          title: "Nomination mechanism",
          ref: "§ 13",
          description: "A mechanism exists for Data Principals to nominate another individual.",
          automatedChecks: [
            {
              id: "dpdpa-13-nomination",
              checkType: "nomination-mechanism",
              description: "Nomination endpoint / UI exists.",
              expectedEvidence: "A user setting or API for nominating a representative.",
            },
          ],
          manualEvidence: ["Nomination form template and storage policy."],
          recommendations: [
            "Add a 'Nominee' field to user settings that stores name + email of the nominated individual.",
          ],
        },
      ],
    },
    {
      id: "sec-14",
      section: "§ 14",
      title: "Consent Manager",
      description:
        "Consent Managers (registered with the Board) facilitate consent in a standardised, interoperable, revocable manner.",
      controls: [
        {
          id: "sec-14-ctrl-1",
          title: "Consent Manager integration",
          ref: "§ 14",
          description: "Where applicable, the Data Fiduciary integrates with a registered Consent Manager.",
          automatedChecks: [
            {
              id: "dpdpa-14-consent-manager",
              checkType: "consent-manager-integration",
              description: "Consent Manager integration is documented.",
              expectedEvidence: "Code or config references a Consent Manager API.",
            },
          ],
          manualEvidence: ["Consent Manager agreement and registration number."],
          recommendations: [
            "Once the Board registers Consent Managers, integrate via the published API spec.",
          ],
        },
      ],
    },
    {
      id: "sec-17",
      section: "§ 17",
      title: "Exemptions",
      description:
        "Certain processing (e.g. for enforcement of legal rights, research, archival, or by the State) is exempt from specific obligations.",
      controls: [
        {
          id: "sec-17-ctrl-1",
          title: "Exemptions documented",
          ref: "§ 17",
          description: "Where an exemption is claimed, it is documented and justified.",
          automatedChecks: [
            {
              id: "dpdpa-17-exemptions-doc",
              checkType: "exemptions-documented",
              description: "Privacy policy / ROPA references claimed exemptions.",
              expectedEvidence: "Documented list of exemptions claimed, with legal basis.",
            },
          ],
          manualEvidence: ["Legal opinion supporting each claimed exemption."],
          recommendations: ["Maintain an exemptions register reviewed annually by counsel."],
        },
      ],
    },
    {
      id: "sec-20",
      section: "§ 20",
      title: "Power to Call for Information",
      description:
        "The Data Protection Board may call for information from the Data Fiduciary. The Data Fiduciary must be able to furnish records on demand.",
      controls: [
        {
          id: "sec-20-ctrl-1",
          title: "Audit trail exists",
          ref: "§ 20",
          description: "A tamper-evident audit trail is maintained of all data processing activities.",
          automatedChecks: [
            {
              id: "dpdpa-20-audit-log",
              checkType: "audit-log-endpoint",
              description: "GET /api/audit-log returns the audit trail.",
              expectedEvidence: "AuditLog table is populated by all sensitive actions.",
            },
            {
              id: "dpdpa-20-attestations",
              checkType: "attestation-ledger",
              description: "Hash-chained attestation ledger exists.",
              expectedEvidence: "/api/attestations returns a verifiable SHA-256 chain.",
            },
          ],
          manualEvidence: ["Quarterly audit trail review report."],
          recommendations: [
            "Wire every privileged action (user role change, patch approval, credential access) to AuditLog.",
          ],
        },
      ],
    },
    {
      id: "sec-25",
      section: "§ 25",
      title: "Penalties",
      description:
        "The Board may impose monetary penalties up to ₹250 crore per instance for non-compliance. Maintaining an audit-ready compliance posture is the primary defence.",
      controls: [
        {
          id: "sec-25-ctrl-1",
          title: "Compliance evidence pack",
          ref: "§ 25",
          description: "An exportable compliance evidence pack is available for the Board on demand.",
          automatedChecks: [
            {
              id: "dpdpa-25-evidence-export",
              checkType: "audit-export-endpoint",
              description: "GET /api/audit-export produces an evidence pack.",
              expectedEvidence: "Endpoint returns scans, patches, findings, attestations, and audit logs.",
            },
            {
              id: "dpdpa-25-breach-detection",
              checkType: "breach-notification-endpoint",
              description: "Breach detection + notification draft system exists.",
              expectedEvidence: "/api/breach-notification runs against exposure findings.",
            },
          ],
          manualEvidence: ["Last annual compliance attestation signed by an officer."],
          recommendations: [
            "Run the compliance export monthly and archive to immutable storage.",
            "Pre-notify the Board's liaison of any high-severity exposure before the 72-hour window lapses.",
          ],
        },
      ],
    },
  ],
};

/** DPDPA sections referenced in the framework (helper for the report). */
export const DPDPA_SECTION_LIST = DPDPA_FRAMEWORK.sections.map((s) => ({
  section: s.section,
  title: s.title,
  description: s.description,
}));
