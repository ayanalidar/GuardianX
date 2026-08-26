# GuardianX Bug Bounty Program

**Program version:** 1.0
**Effective date:** 2024
**Contact:** [security@guardianx.in](mailto:security@guardianx.in)
**PGP key:** [`https://guardianx.in/.well-known/guardianx-security.asc`](https://guardianx.in/.well-known/guardianx-security.asc) · fingerprint `9F3A 1C7D 4B2E 8A60 5C1F  2D9E 7B04 6F8A 3C5D 1E2B`
**Policy URL:** [`https://guardianx.in/terms`](https://guardianx.in/terms)
**Security.txt:** [`https://guardianx.in/.well-known/security.txt`](https://guardianx.in/.well-known/security.txt)

GuardianX runs a coordinated-vulnerability-disclosure bug bounty program. We believe researchers are partners, not adversaries. If you find a security issue, we want to hear from you — and we'll pay you for it.

---

## 1. Scope

### 1.1 In-scope assets

| Asset | Type | Notes |
|---|---|---|
| `guardianx.in` | Web application (Next.js) | All routes under `/` except those listed in §1.3. |
| `api.guardianx.in` | REST API | Auth, scan, SIEM, patches, credentials, integrations endpoints. |
| `portal.guardianx.in` | Client portal | Client-facing engagement portal. |
| `*.guardianx.in` (subdomains) | All subdomains owned by GuardianX | Excluding third-party-hosted subdomains listed in §1.3. |

### 1.2 In-scope vulnerability classes

| Class | Examples |
|---|---|
| **Authentication & Authorization** | Bypass of `requireAuth` / `requireAdmin`, JWT forgery, session-fixation, broken session revocation, 2FA bypass, password-reset token reuse. |
| **Injection** | SQL injection (PostgREST/Supabase), command injection in the sandboxed VAPT engine, NoSQL injection, SSRF, LDAP/XPath injection. |
| **Cross-site scripting (XSS)** | Stored, reflected, DOM-based — including CSP bypasses. |
| **Cross-site request forgery (CSRF)** | State-changing actions reachable via cookie auth without Origin check. |
| **Server-side request forgery (SSRF)** | Including sandbox escape from the RedAgent VAPT engine. |
| **Business logic flaws** | Privilege escalation across clients (analyst A accessing analyst B's clients), rate-limit bypass leading to data exfiltration. |
| **Insecure direct object references (IDOR)** | `/api/clients/[id]`, `/api/credentials/[id]`, `/api/patches/[id]`, `/api/incidents/[id]` accessible without ownership check. |
| **Sensitive data exposure** | Credentials returned in plaintext, audit-log `details` containing secrets, leaked PII in error messages. |
| **Cryptographic weaknesses** | Weak randomness in tokens, ECB mode usage, padding-oracle, JWT `alg: none`. |
| **Race conditions** | TOCTOU on approval workflow, credential access, session revocation. |
| **Security misconfiguration** | Exposed `.env`, default credentials in production, RLS bypass on `LoginHistory`, missing CSP on a sensitive route. |

### 1.3 Out of scope

The following are **not** eligible for rewards and may result in disqualification if tested:

| Category | Reason |
|---|---|
| Denial-of-Service (DoS / DDoS) | Do not send high-volume traffic, slow-loris, or large-payload tests. Use one (1) low-rate proof-of-concept instead. |
| Social engineering | No phishing of GuardianX employees, customers, or vendors. |
| Physical attacks | No attempts to access our offices, data centers, or employee hardware. |
| Spam / email bombing | Do not send bulk mail through our SMTP relays. |
| Automated scanners | Don't run Nessus, Burp Active Scan, Nuclei mass-scan, etc. at scale. Manual verification of a single instance is fine. |
| Third-party hosted assets | `status.guardianx.in` (Better Stack), `help.guardianx.in` (Zendesk), `blog.guardianx.in` (Ghost) — report to the respective vendor. |
| Findings from automated tools without manual verification | "Scanner reported X" is not a valid report. |
| Self-XSS / clickjacking on non-sensitive pages | Iframe-able pages with no auth state are out of scope. |
| Missing security headers on non-sensitive static pages | Already covered by the global header policy — only report if a *sensitive* route is missing them. |
| Best-practice suggestions | "You should use Argon2 instead of bcrypt" is feedback, not a vulnerability. |
| Bugs in dependencies without a working PoC against GuardianX | Report to the upstream vendor. |
| Vulnerabilities in outdated browsers | We support the latest two major versions of Chrome, Firefox, Safari, Edge. |
| Rate-limit thresholds being "too high" | We tune them per route. Suggesting "make it stricter" is not a bug. |

---

## 2. Reward tiers

Rewards are denominated in Indian Rupees (₹). Final award is at GuardianX's discretion based on severity, impact, and quality of the report (working PoC + clear remediation guidance increases the payout).

| Tier | Reward (INR) | Examples |
|---|---|---|
| **Critical** | ₹50,000 | RCE, full DB read, admin account takeover, auth bypass affecting all users, sandbox escape with code execution on GuardianX infra. |
| **High** | ₹25,000 | Stored XSS on an authenticated admin page, IDOR exposing all clients' data, 2FA bypass, JWT signature bypass, SSRF to internal metadata service. |
| **Medium** | ₹10,000 | Reflected XSS with user interaction, CSRF on a state-changing admin action, privilege escalation viewer → admin, leakage of sensitive audit details. |
| **Low** | ₹5,000 | IDOR exposing one other user's data, missing rate limit on a sensitive endpoint, information disclosure of non-secret config, weak password-reset token entropy (with PoC). |
| **Info** | ₹1,000 | Missing security header on a sensitive route, low-impact clickjacking on an authenticated page, hardcoded dev secret in a non-prod build. |

**Bonus multipliers**

- +25% if you provide a working remediation patch in your report.
- +25% if you've reported a valid issue to us before (loyalty bonus).
- +50% if the issue is in the RedAgent sandboxed engine or credentials crypto path (these are our highest-risk code paths).

Maximum total payout per issue: ₹1,00,000 (one lakh).

---

## 3. Rules of engagement

1. **Test only your own accounts and data.** Do not access, modify, or exfiltrate any other user's data. If you accidentally encounter another user's data, stop and report immediately.
2. **Do not degrade the service for other users.** No high-volume automated scanning, no payload spam, no DoS.
3. **Respect rate limits.** If you hit a 429, slow down. Don't try to bypass it.
4. **Do not disclose the vulnerability publicly** before we have shipped a fix and agreed on a disclosure timeline. See §5.
5. **Provide a clear, reproducible report** with:
   - Affected asset + URL/route.
   - Vulnerability class + CVSS v3.1 score (optional but appreciated).
   - Step-by-step reproduction (curl commands, screenshots, or video).
   - Impact assessment (what an attacker could do).
   - Suggested remediation (optional).
6. **One vulnerability per report.** Chain-of-bugs counts as one report if they must be combined to cause impact.
7. **Be the first reporter.** Duplicate reports are not rewarded; the first valid report wins.
8. **Do not interact with other users.** No account takeover testing against real users — create a test account on GuardianX with your own email.
9. **Do not exfiltrate data.** If a bug lets you read the DB, prove it with `SELECT version();` — do not dump customer data.
10. **Be patient and responsive.** We will keep you updated on remediation progress; please respond to clarification questions within 7 days or the report may be closed as "needs more info".

---

## 4. How to report

1. **Encrypt your report** with our PGP public key:
   - Key URL: `https://guardianx.in/.well-known/guardianx-security.asc`
   - Fingerprint: `9F3A 1C7D 4B2E 8A60 5C1F 2D9E 7B04 6F8A 3C5D 1E2B`
   - Recipient: `security@guardianx.in`
2. **Email** the encrypted report to [`security@guardianx.in`](mailto:security@guardianx.in). If you cannot use PGP, plain email is acceptable but please redact any sensitive tokens.
3. **Subject line:** `[BUG BOUNTY] <severity> — <one-line summary>` (e.g. `[BUG BOUNTY] High — IDOR on /api/credentials/[id] exposes other users' Git tokens`).
4. **Include in the body:**
   - Your name / handle and preferred contact email.
   - In-scope asset + full URL.
   - Reproduction steps (numbered).
   - Impact statement.
   - Suggested fix (optional).
   - **Payout details:** UPI ID, bank account (IFSC + account number), or PayPal email. We pay in INR; international researchers can opt for PayPal USD equivalent at the prevailing RBI reference rate.
5. **You will receive an acknowledgment** within 48 hours (see §6).

### PGP-encrypted report template

```
-----BEGIN PGP MESSAGE-----

<your encrypted blob here, encrypted to fingerprint
 9F3A 1C7D 4B2E 8A60 5C1F 2D9E 7B04 6F8A 3C5D 1E2B>

-----END PGP MESSAGE-----
```

---

## 5. Disclosure policy

We follow **coordinated vulnerability disclosure (CVD)**:

| Step | Timeline | Action |
|---|---|---|
| 1 | Day 0 | Researcher reports vulnerability. |
| 2 | ≤ 48h | GuardianX acknowledges + assigns a triage owner. |
| 3 | ≤ 7 days | GuardianX confirms validity + assigns severity tier + initial reward estimate. |
| 4 | ≤ 90 days | GuardianX ships a fix to production (target is 30 days for Critical/High, 60 for Medium, 90 for Low/Info). |
| 5 | Fix + 7 days | GuardianX + researcher agree on a public disclosure date (default: 30 days after fix). |
| 6 | Public disclosure | GuardianX publishes a write-up + credits the researcher (unless they prefer to remain anonymous). |

**No public disclosure before the fix is shipped.** If the 90-day deadline is approaching and we have not shipped a fix, contact us — we will grant an extension if you can show you're acting in good faith. Premature public disclosure voids the reward and may result in legal action under §43 of the IT Act, 2000.

---

## 6. Safe harbor

GuardianX considers security research conducted in accordance with this policy to be **authorized** and **good-faith** activity. Specifically:

1. We will **not** pursue civil or legal action against researchers who:
   - Adhere to the rules of engagement in §3.
   - Do not access, modify, or exfiltrate other users' data.
   - Do not degrade service availability for other users.
   - Report the vulnerability to us first and refrain from public disclosure before a fix is shipped.
2. If at any point you are unsure whether an activity is in scope, **stop and ask** `security@guardianx.in` before proceeding. We will respond within 48 hours.
3. This safe harbor applies **only** to the in-scope assets in §1.1. Activity against out-of-scope assets (§1.3) is not protected.
4. If a third party (e.g. a cloud provider, ISP, or law enforcement) initiates contact about your research, notify us immediately and we will advocate on your behalf.
5. This safe harbor is **void** if you: (a) exfiltrate customer data, (b) attempt extortion, (c) demand a reward higher than the published tiers, or (d) publicly disclose before a fix is shipped.

This safe harbor statement does not grant a license to commit crimes under Indian law (IT Act 2000, BNS 2023) or any other jurisdiction. It is a commitment by GuardianX not to pursue civil action against good-faith research.

---

## 7. Response timeline (SLA)

| Stage | SLA | Notes |
|---|---|---|
| Acknowledgment | **≤ 48 hours** from report receipt. | Auto-responder + human triage owner assigned. |
| Triage decision | **≤ 7 days** | Validity confirmed, severity tier assigned, reward estimated. |
| Fix shipped — Critical | **≤ 30 days** | Hotfix branch + immediate deploy. |
| Fix shipped — High | **≤ 30 days** | |
| Fix shipped — Medium | **≤ 60 days** | |
| Fix shipped — Low / Info | **≤ 90 days** | May ride the next regular release. |
| Reward disbursed | **≤ 14 days** after fix shipped | UPI / bank transfer / PayPal. |
| Public disclosure | **≤ 30 days** after fix shipped (default) | Sooner if researcher agrees; later if coordinated. |

If we miss an SLA, we will pay a **+25% late bonus** on the reward. This is our commitment to taking your reports seriously.

---

## 8. Hall of fame

Researchers who submit a valid vulnerability are listed below (most recent first) unless they prefer to remain anonymous.

| Date | Researcher | Severity | Summary |
|---|---|---|---|
| _—_ | _—_ | _—_ | _No reports yet. Be the first._ |

---

## 9. FAQ

**Q: I found a bug but I'm not sure if it's in scope. What do I do?**
A: Email `security@guardianx.in` with a one-paragraph description (no PoC needed yet). We'll tell you within 48 hours whether to proceed.

**Q: Do you pay for vulnerabilities found in third-party dependencies?**
A: Only if you have a working PoC against GuardianX itself. "Library X has CVE Y" is not a valid report — report to the upstream vendor.

**Q: I'm a GuardianX customer. Can I still participate?**
A: Yes — but you must test against your own tenant data, never another customer's. Customer-researchers are subject to the same rules of engagement.

**Q: I'm under 18. Can I participate?**
A: With parental consent, yes. Include a scanned consent form with your first report.

**Q: Do you pay in crypto?**
A: No — we pay in INR via UPI/bank or USD-equivalent via PayPal, in compliance with Indian FEMA regulations.

**Q: What if I find a critical issue at 2am on a holiday?**
A: Email us — we monitor `security@guardianx.in` continuously and will respond within 48 hours regardless of day or time.

**Q: I think my report was unfairly rejected.**
A: Reply to the triage email asking for escalation. A second reviewer will look at it within 7 days.

---

## 10. Program changes

GuardianX may update this policy at any time. Material changes (scope, reward tiers, rules of engagement) will be announced 30 days before taking effect. Reports submitted before the effective date are governed by the policy in force at submission time.

| Date | Version | Change |
|---|---|---|
| 2024 | 1.0 | Initial bug bounty program launch. |
