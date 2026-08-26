# GuardianX — DPDPA Compliance Checklist

**Document version:** 1.0
**Last reviewed:** 2024
**Owner:** GuardianX Legal & Security Engineering
**Applicable law:** Digital Personal Data Protection Act, 2023 (India) — "DPDPA"
**Related docs:** [`SECURITY-ASSESSMENT.md`](./SECURITY-ASSESSMENT.md) · [`BUG-BOUNTY.md`](./BUG-BOUNTY.md) · [`/privacy`](https://guardianx.in/privacy) · [`/terms`](https://guardianx.in/terms)

This document explains what the DPDPA requires, how GuardianX complies with each obligation, and provides a Data Processing Agreement (DPA) template for B2B customers.

**Roles under DPDPA:**
- **Data Fiduciary** — the entity that determines the purpose and means of processing personal data. GuardianX is the Data Fiduciary for the data we collect directly from users (account, login history, audit log).
- **Data Principal** — the individual to whom the personal data relates. GuardianX users (admins, analysts) and end customers referenced in engagements are Data Principals.
- **Data Processor** — an entity that processes personal data on behalf of a Data Fiduciary. GuardianX acts as a Data Processor for our B2B customers who upload their own clients' data (target URLs, source code, scan results). The customer is the Data Fiduciary for that data.

---

## 1. What the DPDPA requires

| Section | Obligation | GuardianX status |
|---|---|---|
| §4 | Process personal data only with valid consent or for a lawful purpose. | ✅ Consent captured at signup (cookie banner + email verification); lawful-purpose basis for security logs (§5). |
| §5 | Certain processing without consent (e.g. for state functions, legal compliance, employment). | ✅ Audit logs and breach records processed for legal compliance. |
| §6 | Data principal rights: access, correction, erasure, grievance redressal, nomination. | ✅ See §4 below. |
| §7 | Special protections for children's data. | ✅ B2B product; no children's data processed. |
| §8 | General obligations of Data Fiduciary: accuracy, security safeguards, breach notification, retention erasure, grievance officer. | ✅ See §§3, 5, 6, 7 below. |
| §8(6) | Breach notification to the Data Protection Board and affected principals within **72 hours**. | ✅ See §5 below. |
| §9 | Additional obligations for Significant Data Fiduciaries (DPIA, DPO, audit). | 🔲 Not yet classified as SDF. Re-evaluate annually. |
| §10 | No processing of children's data for targeted advertising / behavioral tracking. | ✅ N/A. |
| §11 | Data principal rights (consent withdrawal, access, correction, erasure, grievance). | ✅ See §4. |
| §12 | Duties of data principals (no false complaints, no impersonation). | ✅ Documented in `/terms` §3 (Acceptable Use). |
| §15 | Cross-border transfer only to countries notified by the Central Government. | ✅ See §7. |
| §17 | Exemptions (state, research, etc.). | N/A. |
| §25 | Penalties up to ₹250 crore per violation. | ✅ Mitigated by controls in `SECURITY-ASSESSMENT.md`. |
| §33 | Appeals mechanism. | ✅ Grievance officer contact in `/privacy` §6. |

---

## 2. Data minimization — what we collect and why

GuardianX collects only the minimum personal data necessary to deliver the security-testing service and to comply with legal obligations (audit, breach investigation).

| Data field | Table | Purpose | Lawful basis | Retention |
|---|---|---|---|---|
| Full name | `User.name` | Display in UI; audit log attribution. | Consent (signup) | Until account deletion + 30 days |
| Email address | `User.email` | Login, notifications, password reset, 2FA, audit attribution. | Consent (signup) | Until account deletion + 30 days |
| Password hash (bcrypt) | `User.password` | Authentication. Never stored in plaintext. | Contract (service delivery) | Until account deletion |
| Role (`admin` / `viewer`) | `User.role` | Access control. | Contract | Until account deletion |
| Approval status | `User.approved` | Gate access pending admin approval. | Contract | Until account deletion |
| Email-verified flag | `User.emailVerified` | Prevent login with unverified email. | Consent | Until account deletion |
| TOTP 2FA secret (encrypted) | `User.twoFactorSecret` | Two-factor authentication. | Consent (opt-in) | Until 2FA disabled or account deleted |
| Session version counter | `User.tokenVersion` | Per-user session revocation. | Contract | Until account deletion |
| Login history (IP, user-agent, success/failure, timestamp) | `LoginHistory` | Security monitoring; user-facing "recent activity" view. | Legitimate interest (security) | 90 days |
| Email delivery log (recipient, subject, status, messageId, template) | `EmailLog` | SMTP delivery health monitoring; abuse investigation. **Body never stored.** | Legitimate interest (security) | 30 days |
| Audit log (action, entity, actor, timestamp, sanitized details) | `AuditLog` | Tamper-evident trail of sensitive mutations. | Legal compliance (security) | 365 days |
| Client name + target URL | `Client` | Engagement scoping. | Contract (B2B) | Until client deletion + 90 days |
| Source code (uploaded for SAST) | `Codebase` | Static + AI-driven vulnerability analysis. | Contract (B2B) | Until codebase deletion + 30 days |
| Git/SCM credentials (AES-256-GCM encrypted) | `Credential` | Pull source code for scanning. Never returned in plaintext. | Contract (B2B) | Until credential deletion |
| Scan results + findings | `Scan`, `Finding` | Vulnerability report generation. | Contract (B2B) | Until client deletion + 90 days |
| Generated patches (diffs) | `Patch` | Auto-remediation + PR generation. | Contract (B2B) | Until client deletion + 90 days |
| Incident records | `Incident` | DFIR case management. | Contract (B2B) + Legal compliance | Until incident closure + 365 days |
| Hash-chained attestations | `Attestation` | Tamper-evidence for findings/patches. | Legal compliance | 365 days |
| Cookie consent state | Browser `localStorage` | Track whether the user accepted cookies. | Consent | Browser session |
| Webhook endpoint URL + HMAC secret | `Webhook` | Outbound security-event notifications to customer systems. | Contract (B2B) | Until webhook deletion |

**Data we do NOT collect:**
- Government IDs (Aadhaar, PAN, passport).
- Financial information (we use Stripe/Razorpay; card data never touches our servers).
- Biometric data.
- Precise geolocation (we infer country from IP only for rate-limiting/abuse — not stored).
- Browsing history outside GuardianX.
- Marketing tracking pixels (no Facebook Pixel, no Google Analytics with PII).

---

## 3. Purpose limitation — each field's permitted use

Each data field has a single documented purpose. GuardianX will **not** repurpose data without obtaining fresh consent.

| Field | Permitted use | Prohibited use |
|---|---|---|
| Email | Auth, security notifications, transactional emails (scan complete, finding published). | Marketing emails without separate opt-in. |
| Name | Display in UI + audit log. | Public listings. |
| Login history | Security monitoring + user-facing recent-activity view. | Sharing with third parties. |
| Audit log details | Internal investigation, legal hold. | Sale, marketing. |
| Source code | Vulnerability scanning only. | Training third-party AI models. (We use OpenAI/Anthropic only under their no-training enterprise agreements.) |
| Credentials | Pulling code for the engagement that owns them. | Reuse across engagements. |

---

## 4. Data principal rights

GuardianX honors all DPDPA §11 rights. To exercise any right, email [`privacy@guardianx.in`](mailto:privacy@guardianx.in) from the address on your account.

| Right | DPDPA section | How to exercise | SLA |
|---|---|---|---|
| **Access** — get a copy of your personal data | §11(1)(a) | Email `privacy@guardianx.in` with subject `[ACCESS REQUEST]`. We return a JSON export of all your data within 30 days. | 30 days |
| **Correction** — fix inaccurate/incomplete data | §11(1)(b) | Self-service: Settings → Profile. For audit-log corrections, email `privacy@guardianx.in` (audit log entries are append-only; corrections are made via a compensating entry). | 7 days |
| **Erasure** — "right to be forgotten" | §11(1)(c) | Email `privacy@guardianx.in` with subject `[ERASURE REQUEST]`. We delete your account + personal data within 30 days, except where retention is required by law (audit log: 365 days; breach records: 6 years). | 30 days |
| **Grievance redressal** | §11(1)(d) + §8(9) | Email the Grievance Officer (see §6 below). Acknowledgment within 24h, resolution within 30 days. | 30 days |
| **Nomination** — nominate another individual to exercise rights in case of death/incapacity | §11(1)(e) + §14 | Email `privacy@guardianx.in` with a nomination form. We record the nomination and act on it upon proof of death/incapacity. | 7 days to record |
| **Withdrawal of consent** | §6(4) | Settings → Privacy → "Withdraw consent". Note: withdrawal does not affect the lawfulness of processing before withdrawal. | Immediate |

**Verification:** To prevent unauthorized access, we verify identity before fulfilling access/erasure requests. For access requests, we send a one-time code to your registered email. For erasure, we require 2FA verification if enabled.

**Refusal:** We may refuse an erasure request where retention is required by:
- Indian law (IT Act 2000 §67C — audit log retention).
- Ongoing legal proceedings.
- Establishment, exercise, or defense of legal claims.

We will explain the refusal in writing within 30 days.

---

## 5. Data breach notification process (72-hour SLA)

### 5.1 Detection

| Source | Mechanism | Owner |
|---|---|---|
| Internal monitoring | Sentry alerts (error spike), SIEM correlation rules, anomaly detection | Sec Eng (on-call) |
| External report | Bug bounty (`security@guardianx.in`), customer report, upstream vendor notice (Supabase/Vercel) | Sec Eng |
| Internal discovery | Audit log review, user complaint | Any employee |

### 5.2 Triage (within 1 hour of detection)

The on-call Security Engineer assesses:
1. **Scope** — how many Data Principals are affected?
2. **Severity** — what data classes are exposed? (Credentials > PII > audit metadata.)
3. **Containment** — is the breach ongoing? Revoke sessions, rotate secrets, isolate affected systems.
4. **Notification trigger** — does this meet the DPDPA §8(6) threshold of "harm to Data Principals"?

### 5.3 Notification (within 72 hours of confirmation)

| Recipient | Method | Content |
|---|---|---|
| **Data Protection Board of India** | Email to `dpb@gov.in` + registered portal submission | Nature of breach, data classes affected, approximate number of principals, containment measures, remediation plan, contact for further info. |
| **Affected Data Principals** | Email from `security@guardianx.in` | Plain-language description of what happened, what data was exposed, what they should do (change password, enable 2FA), what GuardianX is doing, contact for questions. |
| **B2B customers (Data Fiduciaries)** | Email + phone call to account owner | Same as DPB notification + affected engagement IDs. |
| **Public disclosure** | Blog post on `guardianx.in/blog` | Only after affected principals are notified and DPB has acknowledged. |

### 5.4 Internal record-keeping

Every breach is recorded via `POST /api/breach-notification` with:
- Incident ID, severity, affected principal count.
- Detection timestamp, confirmation timestamp, notification timestamps.
- Root cause, containment, remediation.
- Retained for **6 years** (DPDPA §8(6) read with IT Act §67C).

### 5.5 Post-incident review

Within 14 days of breach closure, the Security Engineering team publishes a postmortem covering:
- Timeline of events.
- Root cause analysis (5 Whys).
- What went well / what didn't.
- Corrective actions with owners + due dates.
- Updates needed to this document + `SECURITY-ASSESSMENT.md`.

---

## 6. Data fiduciary obligations

| DPDPA §8 obligation | GuardianX implementation |
|---|---|
| **(a) Accuracy** — personal data must be accurate and up-to-date. | Users can self-edit profile (name, email). Email change requires verification. Audit log is append-only with corrections via compensating entries. |
| **(b) Security safeguards** — reasonable security safeguards to prevent personal data breach. | See `SECURITY-ASSESSMENT.md` — 17 hardening items shipped, AES-256-GCM, TLS 1.3, RBAC, 2FA, audit logging, breach notification. |
| **(c) Breach notification** — notify Board + affected principals. | See §5 above. |
| **(d) Retention erasure** — erase data when purpose is no longer served and consent is withdrawn. | Retention schedule in §2; erasure SLA in §4. |
| **(e) Grievance officer** — designate a Grievance Officer and publish contact. | **Grievance Officer:** GuardianX Privacy Team, `privacy@guardianx.in`, +91-80-XXXX-XXXX (business hours IST). Published in `/privacy` §6. |

---

## 7. Cross-border data transfer

### 7.1 Where data is stored

| Layer | Provider | Region | Data classes |
|---|---|---|---|
| Application hosting | Vercel | `bom1` (Mumbai, India) — primary; `fra1` (Frankfurt) — edge cache only | Application code, request logs (24h) |
| Database | Supabase | `ap-south-1` (Mumbai, India) | All structured data in tables listed in §2 |
| Object storage (evidence) | Customer-managed (S3/GCS) | Per customer's own region | Uploaded evidence bytes — GuardianX stores only the `storagePath` string |
| Email delivery | Hostinger SMTP | India (Mumbai) | Transactional emails (welcome, password reset, scan complete) |
| Error tracking | Sentry | `us` (with EU mirror) | Error stack traces, request metadata (PII stripped) |
| AI inference (optional, customer opt-in) | OpenAI / Anthropic | `us` | Source code snippets sent for AI vulnerability analysis — only under enterprise no-training agreements |

### 7.2 Transfer mechanism

- **India-only data:** The primary database (`ap-south-1`) and application (`bom1`) are both in India. No transfer outside India for the core service.
- **Cross-border transfer (Sentry, OpenAI/Anthropic):** Governed by:
  - Supabase Standard Contractual Clauses (where applicable).
  - OpenAI / Anthropic enterprise Data Processing Addenda (no-training, no-retention beyond 30 days for abuse monitoring).
  - Hostinger — India region, no transfer.
- **Government notifications:** GuardianX monitors the list of countries notified by the Central Government under DPDPA §16. If a destination country is removed from the allowed list, we will re-route processing to an India-only alternative within 90 days.

### 7.3 Customer opt-out

B2B customers can opt out of:
- Sentry error tracking (we self-host Sentry if required).
- AI inference (disable RedAgent AI features; rule-based scanning still works).

Email `privacy@guardianx.in` to request either opt-out.

---

## 8. Data Processing Agreement (DPA) template

> This DPA is incorporated by reference into the GuardianX Master Subscription Agreement. Capitalized terms not defined here have the meaning given in the MSA. This template is provided for prospective B2B customers; the executed version is signed by both parties.

---

**DATA PROCESSING AGREEMENT**

Between **[Customer Name]** ("Data Fiduciary" / "Customer") and **GuardianX Technologies Pvt. Ltd.** ("Data Processor" / "GuardianX").

**Effective date:** [____]

### 8.1 Definitions

| Term | Definition |
|---|---|
| **Personal Data** | Any personal data as defined under DPDPA §2(t) that Customer uploads to or processes via the GuardianX platform. |
| **Processing** | Any operation on Personal Data as defined under DPDPA §2(x). |
| **Sub-processor** | Any third party engaged by GuardianX to process Personal Data on behalf of Customer. |
| **DPDPA** | The Digital Personal Data Protection Act, 2023 (India). |
| **Supabase, Vercel, Hostinger** | GuardianX sub-processors as listed in §7 above. |

### 8.2 Roles and scope

1. Customer is the **Data Fiduciary**. GuardianX is the **Data Processor**.
2. GuardianX processes Personal Data only on documented instructions from Customer, including with regard to transfers of Personal Data to a third country, unless required by Indian law.
3. The scope of Processing is limited to delivering the GuardianX security-testing SaaS service as described in the MSA.
4. The categories of Personal Data processed are listed in `SECURITY-ASSESSMENT.md` §2 and this document §2.

### 8.3 GuardianX obligations

GuardianX shall:

1. **Process Personal Data only on Customer's documented instructions**, including with regard to international transfers, unless required to comply with Indian law. GuardianX will inform Customer of any legal requirement that conflicts with this clause, unless prohibited by law.
2. **Implement appropriate technical and organizational measures** to ensure a level of security appropriate to the risk, including (without limitation): pseudonymization/encryption of credentials, confidentiality, integrity, availability, and resilience of processing systems, regular testing, and incident response. The current measures are documented in `SECURITY-ASSESSMENT.md` and may be updated by GuardianX with material improvements (with notice to Customer).
3. **Ensure that personnel authorized to process Personal Data** are bound by confidentiality obligations and have completed security awareness training.
4. **Not engage a sub-processor** without Customer's prior written authorization. The current list of sub-processors is in §7. GuardianX will give Customer 30 days' notice of any new sub-processor; Customer may object and, if GuardianX proceeds, Customer may terminate the affected portion of the MSA.
5. **Assist Customer** in responding to Data Principal rights requests (access, correction, erasure, grievance) by providing the relevant Personal Data in a machine-readable format within 7 days of request.
6. **Assist Customer** in meeting Customer's breach-notification obligations under DPDPA §8(6) by notifying Customer of a Personal Data breach within **24 hours** of GuardianX becoming aware of it, and providing all reasonable assistance in Customer's investigation and notification.
7. **Delete or return** all Personal Data to Customer within 30 days of termination of the MSA, except where retention is required by Indian law (audit log: 365 days; breach records: 6 years).
8. **Make available to Customer** information necessary to demonstrate compliance with this DPA and allow for and contribute to audits, including inspections, conducted by Customer (or Customer's auditor) at Customer's expense, with 14 days' written notice, no more than once per calendar year.

### 8.4 Customer obligations

Customer shall:

1. **Provide lawful instructions** to GuardianX for Processing Personal Data.
2. **Ensure that Customer has obtained all necessary consents** from Data Principals and provided all required notices under DPDPA before uploading Personal Data to GuardianX.
3. **Be responsible for the accuracy and quality** of Personal Data uploaded.
4. **Not upload Special Category Personal Data** (e.g. Aadhaar numbers, biometric data, health data) to GuardianX. GuardianX is not designed to process such data.
5. **Notify GuardianX** of any Data Principal rights request received by Customer that relates to Personal Data processed by GuardianX, within 48 hours of receipt.

### 8.5 Sub-processors

| Sub-processor | Purpose | Region | DPA status |
|---|---|---|---|
| Supabase Inc. | PostgreSQL database | `ap-south-1` (Mumbai) | Signed DPA on file |
| Vercel Inc. | Application hosting | `bom1` (Mumbai) | Signed DPA on file |
| Hostinger International | SMTP email relay | India | Signed DPA on file |
| Functional Software, Inc. (Sentry) | Error tracking | `us` | Signed DPA on file |
| OpenAI / Anthropic (optional) | AI vulnerability analysis | `us` | Enterprise DPA with no-training clause; customer opt-out available |

Current sub-processor list maintained at `https://guardianx.in/legal/sub-processors`.

### 8.6 Breach notification

1. GuardianX will notify Customer without undue delay, and in any case within **24 hours**, of becoming aware of a Personal Data breach affecting Customer's Personal Data.
2. The notification will include: nature of the breach, data classes affected, approximate number of Data Principals affected, containment measures taken, remediation plan, and a contact for further information.
3. GuardianX will provide reasonable assistance to Customer in Customer's notification to the Data Protection Board and affected Data Principals under DPDPA §8(6).
4. Customer is responsible for the actual notification to Data Principals and the Board.

### 8.7 Audit rights

1. Customer may audit GuardianX's compliance with this DPA once per calendar year, at Customer's expense, with 14 days' written notice.
2. Audit shall be conducted by an independent third-party auditor acceptable to both parties.
3. GuardianX's SOC 2 Type II report, ISO 27001 certificate (once issued), and DPDPA self-assessment (`SECURITY-ASSESSMENT.md`) shall be made available as an alternative to a physical audit.
4. Any audit findings shall be discussed in good faith; GuardianX will remediate confirmed material findings within 90 days.

### 8.8 Termination

1. Upon termination of the MSA, GuardianX will, at Customer's choice, delete or return all Personal Data within 30 days, except where retention is required by Indian law.
2. GuardianX will provide a certificate of deletion upon request.

### 8.9 Governing law and jurisdiction

This DPA is governed by the laws of India. Courts in Bengaluru, Karnataka have exclusive jurisdiction.

### 8.10 Signatures

| GuardianX Technologies Pvt. Ltd. | [Customer Name] |
|---|---|
| Signature: _______________________ | Signature: _______________________ |
| Name: ___________________________ | Name: ___________________________ |
| Title: __________________________ | Title: __________________________ |
| Date: ___________________________ | Date: ___________________________ |

---

## 9. Compliance checklist (quick reference)

| # | DPDPA requirement | GuardianX artifact | Status |
|---|---|---|---|
| 1 | Consent at collection | Cookie banner + signup consent + email verification | ✅ |
| 2 | Privacy notice published | `/privacy` page | ✅ |
| 3 | Data minimization | §2 above (only fields listed are collected) | ✅ |
| 4 | Purpose limitation | §3 above | ✅ |
| 5 | Storage limitation / retention | §2 retention column + automated purge | 🟡 (purge automation in progress) |
| 6 | Data principal rights | §4 above + `/privacy` §3 | ✅ |
| 7 | Grievance officer | §6(e) above + `/privacy` §6 | ✅ |
| 8 | Security safeguards | `SECURITY-ASSESSMENT.md` (17 hardening items) | ✅ |
| 9 | Breach notification process | §5 above + `POST /api/breach-notification` | ✅ |
| 10 | Cross-border transfer disclosure | §7 above | ✅ |
| 11 | Data Processing Agreement | §8 above (template) | ✅ |
| 12 | Sub-processor list | §8.5 above + `guardianx.in/legal/sub-processors` | ✅ |
| 13 | Significant Data Fiduciary assessment | §9 DPDPA — re-evaluate annually | 🔲 Annual review |
| 14 | Children's data protection | B2B product; no children's data | ✅ N/A |
| 15 | Audit trail | `AuditLog` table, 365-day retention | ✅ |

---

## 10. Change history

| Date | Version | Author | Change |
|---|---|---|---|
| 2024 | 1.0 | Legal + Sec Eng | Initial DPDPA compliance checklist + DPA template. |
