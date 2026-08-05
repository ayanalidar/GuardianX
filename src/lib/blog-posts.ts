// Hardcoded blog post data for the GuardianX blog.
// No CMS, no database — all content lives in this file.
// To add a post: append a new BlogPost object to the BLOG_POSTS array.

export type BlogCategory =
  | "Security"
  | "Compliance"
  | "Tutorials"
  | "Case Studies";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  /** Markdown-ish content. Headings use ## (h2) for TOC entries. */
  content: string;
  category: BlogCategory;
  date: string; // ISO date
  readTime: string; // e.g. "8 min read"
  author: {
    name: string;
    role: string;
  };
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  "Security",
  "Compliance",
  "Tutorials",
  "Case Studies",
];

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "top-10-sql-injection-prevention",
    title: "Top 10 SQL Injection Prevention Techniques",
    excerpt:
      "From parameterized queries to runtime WAF rules — a practical, defense-in-depth playbook for killing SQLi in modern web apps, with code samples and GuardianX scan output.",
    category: "Security",
    date: "2026-02-18",
    readTime: "9 min read",
    author: { name: "Ananya Rao", role: "Principal Security Engineer" },
    content: `SQL injection (SQLi) has haunted web applications for over two decades. Despite being the #1 item on the original 2003 OWASP Top 10, it still appears in roughly 1 of every 3 applications we assess at GuardianX. This post walks through the ten most effective techniques — in order of impact — that together form a defense-in-depth strategy.

## 1. Parameterized Queries (Prepared Statements)

The single most effective SQLi mitigation. Instead of concatenating user input into SQL strings, you bind parameters separately so the database engine never treats input as executable code.

\`\`\`js
// BAD — string concatenation
db.query("SELECT * FROM users WHERE email = '" + email + "'");

// GOOD — parameterized
db.query("SELECT * FROM users WHERE email = $1", [email]);
\`\`\`

Every modern database driver supports this. There is no good reason to ever concatenate user input into SQL.

## 2. Stored Procedures With Parameter Binding

When used correctly (with bound parameters, not dynamic SQL inside the proc), stored procedures move the query structure to the database side and reduce the attack surface at the application layer.

## 3. Input Validation & Allow-lists

Validate every input against a strict allow-list of expected characters, lengths, and formats. Emails get email regex, IDs get UUID format, booleans get true/false. Reject anything unexpected — never try to sanitize and pass through.

## 4. ORM Usage With Safe Query Builders

ActiveRecord, Prisma, SQLAlchemy, and similar ORMs default to parameterization. The risk appears when developers drop into raw queries — audit every \`.raw()\` or \`.query()\` call in your codebase.

## 5. Least-Privilege Database Accounts

The application's DB user should only have the minimum privileges it needs. A read-heavy reporting service doesn't need DROP TABLE. If SQLi does slip through, least-privilege limits the blast radius.

## 6. Runtime WAF Rules

A Web Application Firewall won't fix bad code, but it adds a layer that blocks obvious payloads (UNION SELECT, OR 1=1, comment sequences). GuardianX generates ModSecurity, Cloudflare, and Nginx WAF rules automatically from scan findings.

## 7. Error Message Hardening

Never return raw SQL errors to the user. A verbose error like \`column "password" does not exist\` tells an attacker exactly what to try next. Catch exceptions, log full detail server-side, return a generic message to the client.

## 8. Continuous SAST Scanning

Run Static Application Security Testing on every commit. GuardianX's SAST engine flags string-concatenated SQL the moment it lands in a pull request — long before it reaches production.

## 9. DAST Verification

Dynamic testing confirms whether a suspected SQLi is actually exploitable. GuardianX's RedAgent engine sends safe, non-destructive payloads (like \`' AND 1=1--\` vs \`' AND 1=2--\`) and compares response signatures to confirm injection points.

## 10. Patch Management & Dependency Updates

Outdated database drivers and ORMs sometimes have their own SQLi vulnerabilities. Keep dependencies current and subscribe to CVE feeds for the libraries you rely on.

## Putting It All Together

No single technique is sufficient. The combination of parameterized queries (primary defense), input validation (belt), least-privilege (suspenders), and continuous scanning (early warning) is what actually reduces SQLi risk to near-zero.

GuardianX automates techniques 4, 6, 8, and 9 — sign up for a free scan to see how many SQLi patterns exist in your codebase today.`,
  },
  {
    slug: "dpdpa-compliance-checklist-startups",
    title: "DPDPA Compliance Checklist for Startups",
    excerpt:
      "India's Digital Personal Data Protection Act, 2023 is now law. Here's a pragmatic, startup-friendly checklist covering consent, data fiduciary duties, breach reporting, and DPO triggers.",
    category: "Compliance",
    date: "2026-02-10",
    readTime: "11 min read",
    author: { name: "Vikram Mehta", role: "Compliance Lead" },
    content: `The Digital Personal Data Protection Act, 2023 (DPDPA) is India's first comprehensive data protection law. Unlike GDPR's 99 articles, the DPDPA is relatively short — but the operational implications for startups are significant. This checklist breaks down what a typical Indian startup needs to do, in priority order.

## 1. Determine If DPDPA Applies To You

DPDPA applies to processing of digital personal data within India, and to processing outside India that targets data principals in India. If your startup has Indian users, customers, or employees — DPDPA applies.

## 2. Identify Your Role: Data Fiduciary vs Data Processor

- **Data Fiduciary** — determines the purpose and means of processing (usually you, the startup).
- **Data Processor** — processes data on behalf of a fiduciary (e.g., your cloud provider, email service, analytics vendor).

You're almost certainly a Data Fiduciary. Map every third-party processor you use (AWS, Stripe, Mixpanel, Slack, etc.).

## 3. Build a Data Inventory

You cannot protect what you don't know you have. Document:
- What personal data you collect (email, phone, location, biometric, etc.)
- Where it's stored (S3 bucket, Postgres table, vendor X)
- Who has access (which team, which vendor)
- Retention period (how long you keep it)
- Legal basis (consent, legitimate use, legal obligation)

## 4. Implement a Consent Mechanism

DPDPA requires a specific, informed, and unambiguous consent for processing personal data. The consent notice must be:
- Available in English and any Indian language your users speak
- Clear about what data is collected and why
- Withdrawable as easily as it was given

A pre-ticked checkbox is NOT valid consent.

## 5. Publish a Privacy Policy

Your privacy policy must disclose:
- What personal data is collected
- The purpose of processing
- The rights of the data principal
- How to grievance-redress
- The contact of your Grievance Officer

## 6. Appoint a Grievance Officer

Every Data Fiduciary must publish the name and contact of a Grievance Officer. The officer must acknowledge complaints within 24 hours and resolve within 21 days (or such period as prescribed).

## 7. Implement Data Principal Rights

DPDPA grants data principals the right to:
- Access their data
- Correct and complete it
- Erase it
- Nominate (in case of death/incapacity)
- Withdraw consent

Build a self-service portal or documented email workflow for each of these.

## 8. Reasonable Security Safeguards

Section 8(5) requires "reasonable security safeguards" — the DPDPA doesn't prescribe specific controls, but the Standard Reasonable Security Practices (to be notified) will likely align with ISO 27001 / SOC 2 baselines:
- Encryption at rest and in transit (AES-256-GCM, TLS 1.3)
- Access control (RBAC, MFA)
- Audit logging (immutable, tamper-evident)
- Vulnerability management (continuous SAST + DAST)
- Incident response plan

## 9. Breach Notification

If a personal data breach occurs, you must notify:
- The Data Protection Board (within 72 hours)
- Each affected data principal (without undue delay)

Document the breach: nature, scope, mitigation steps, remediation plan.

## 10. Data Retention & Deletion

You must delete personal data once the purpose for collection is no longer served and consent is withdrawn (or retention is not required by law). Automate deletion in your DB schema — soft-delete for the first 30 days, then hard-delete.

## 11. Cross-Border Transfers

DPDPA restricts transfers to countries on a negative list (to be notified by the Central Government). Until the list is published, default to storing Indian personal data within India.

## 12. Children's Data

If you process data of anyone under 18:
- Verifiable parental consent is mandatory
- No behavioral tracking or targeted advertising
- No processing likely to cause detriment to the child

## 13. Special Categories: Significant Data Fiduciaries

If the government notifies you as a Significant Data Fiduciary (based on volume, sensitivity, risk), additional duties kick in:
- Appoint a Data Protection Officer (DPO)
- Conduct annual Data Protection Impact Assessments (DPIAs)
- Annual financial audit by an independent auditor

## 14. Continuous Monitoring & Evidence Collection

Compliance isn't a one-time checkbox. You need ongoing evidence that controls are operating. GuardianX's compliance module auto-collects evidence for ISO 27001, SOC 2, and DPDPA — SAST/DAST scan results, patch audit trails, access reviews, and incident timelines, all exportable for an auditor.

## Summary Checklist

1. Confirm DPDPA applicability
2. Map data inventory
3. Implement consent + withdrawal
4. Publish privacy policy + Grievance Officer
5. Build data principal rights workflow
6. Apply reasonable security safeguards (encryption, MFA, audit, vuln mgmt)
7. Document breach response runbook
8. Automate retention & deletion
9. Stay within cross-border rules
10. Collect continuous compliance evidence

Startups that bake DPDPA into their product from day one avoid painful retrofits. The cost of compliance is far lower than the cost of a ₹250 crore penalty.`,
  },
  {
    slug: "first-vapt-scan-with-guardianx",
    title: "How to Run Your First VAPT Scan with GuardianX",
    excerpt:
      "A step-by-step walkthrough: connect a codebase or live URL, launch a SAST + DAST scan, watch the live pipeline, review findings, and export an audit-ready PDF report.",
    category: "Tutorials",
    date: "2026-02-03",
    readTime: "8 min read",
    author: { name: "Priya Nair", role: "Developer Advocate" },
    content: `This tutorial walks you through running your first end-to-end VAPT (Vulnerability Assessment and Penetration Test) scan with GuardianX — from connecting a target to exporting an auditor-ready PDF report. Total time: under 5 minutes for a small application.

## Step 1: Create an Account and Log In

Sign up at guardianx.in. You'll get an email to verify your account. After verification, log in and land on the Command Center dashboard.

## Step 2: Add a Client (Optional)

If you're an MSSP or consultant, create a Client to scope your scans. From the sidebar, click **Clients → New Client**, enter a name (e.g., "Acme Corp"), and save. Solo users can skip this.

## Step 3: Connect a Codebase (SAST)

For static analysis, you connect your source code. Click **Codebases → Add Codebase**. Three options:

- **Git URL** — paste your repo URL and provide a PAT if private
- **Upload ZIP** — drag and drop a .zip of your source
- **Live fetch** — GuardianX clones the repo server-side

Once uploaded, GuardianX indexes the codebase (typically 10–60 seconds for repos under 100k LOC).

## Step 4: Or, Add a Live Target (DAST)

For dynamic testing, click **Engagements → New Target** and enter a URL (e.g., \`https://staging.acme.com\`). For authenticated scans, you can also provide login credentials and GuardianX will crawl past the auth wall.

> **Important:** Only scan targets you own or have written permission to test. Unauthorized scanning is illegal.

## Step 5: Launch the Scan

From the codebase or target page, click **Run VAPT Scan**. GuardianX launches the pipeline:

1. **Recon** — nmap port scan, ffuf directory brute-force, tech fingerprinting
2. **Crawl** — Playwright browser crawls every reachable page
3. **SAST** — static analysis for 27 vulnerability classes (SQLi, XSS, SSRF, etc.)
4. **DAST** — RedAgent engine sends safe, non-destructive payloads
5. **AI Triage** — LLM correlates SAST + DAST findings, removes false positives
6. **Patch Generation** — for each finding, an AI patch is generated and sandbox-tested
7. **Attestation** — findings + patches are SHA-256 hashed and recorded on a ledger

## Step 6: Watch the Live Pipeline

The Command Center shows a real-time pipeline view (via Socket.IO). You'll see:
- Live exploit terminal scrolling attack attempts
- Network topology of discovered hosts
- Attack heatmap by severity
- Findings table populating in real time

## Step 7: Review Findings

Click any finding in the table to open the Finding Dialog:
- **Severity** (Critical / High / Medium / Low / Info) — CVSS v3.1 score
- **Location** — file:line for SAST, URL:parameter for DAST
- **Evidence** — proof-of-concept payload + response
- **Suggested patch** — AI-generated code diff
- **Sandbox result** — pass/fail of the patched version

Approve or reject each patch. Approved patches get a "Generate PR" button that opens a pull request on your repo.

## Step 8: Export the Report

Click **Export PDF** in the top right. GuardianX generates an audit-ready report containing:
- Executive summary (AI-written, business-language)
- Technical findings table with CVSS scores
- Risk heat map
- Remediation timeline
- Attestation ledger entries (SHA-256 hashes)

The PDF is branded with your logo (uploadable in Settings) and ready to share with auditors, customers, or regulators.

## Step 9: Set Up Continuous Scanning

One-off scans are good for compliance deadlines, but security is continuous. From a codebase page, toggle on **Auto-scan on every commit** — GuardianX will scan each PR and post findings as inline code comments.

For DAST, schedule recurring scans (daily, weekly) from the target page.

## Step 10: Configure Alerts

In **Settings → Integrations**, connect Slack or Microsoft Teams. GuardianX will push Critical/High findings directly to your SOC channel. You can also enable daily email digests summarizing your security posture.

## Tips for First-Timers

- Start with a non-production target to learn the tool
- Use the "Quick scan" preset for first runs (skips slow fuzzing)
- Review every Critical finding — they're rare but real
- Use the Guardian AI chatbot to ask "what should I prioritize?"

That's it — you've just run your first VAPT scan. Welcome to autonomous security.`,
  },
  {
    slug: "understanding-owasp-top-10-2021",
    title: "Understanding OWASP Top 10 2021",
    excerpt:
      "A category-by-category breakdown of the OWASP Top 10:2021 — what each risk means, how it manifests in modern code, and concrete fixes with code samples.",
    category: "Security",
    date: "2026-01-27",
    readTime: "13 min read",
    author: { name: "Rohan Kapoor", role: "Security Researcher" },
    content: `The OWASP Top 10 is the de facto reference for the most critical web application security risks. The 2021 edition (the latest, with 2025 expected soon) introduced structural changes from 2017 — most notably combining some categories and elevating others based on real-world incident data. This post explains each category with examples.

## A01:2021 — Broken Access Control

Up from #5 in 2017. The most common and impactful category. Failures let users act outside their intended permissions.

**Examples:**
- Viewing another user's order by changing \`?order_id=123\` to \`?order_id=124\`
- Accessing admin endpoints by calling \`/api/admin/users\` as a regular user
- Modifying a JWT's \`role\` claim from \`user\` to \`admin\`

**Fix:** Enforce authorization server-side on every request. Use a central authorization middleware. Never trust client-side role checks.

\`\`\`js
// BAD
app.get("/api/orders/:id", (req, res) => {
  return Order.find(req.params.id);
});

// GOOD
app.get("/api/orders/:id", auth, (req, res) => {
  const order = await Order.find(req.params.id);
  if (order.userId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).send("Forbidden");
  }
  return res.json(order);
});
\`\`\`

## A02:2021 — Cryptographic Failures

Renamed from "Sensitive Data Exposure". Focuses on failures in cryptography that expose data.

**Examples:**
- Storing passwords in plaintext or with weak hashing (MD5, SHA-1)
- Using ECB mode for symmetric encryption
- Hardcoded API keys in source code
- TLS not enforced (HTTP fallback)

**Fix:** Use bcrypt/argon2 for passwords. AES-256-GCM for symmetric encryption. TLS 1.3 everywhere. Rotate keys via a secrets manager (AWS KMS, HashiCorp Vault).

## A03:2021 — Injection

Down from #1 (still huge). Includes SQLi, NoSQLi, OS command injection, LDAP injection, XPath injection, and template injection.

**Fix:** Parameterized queries, allow-list input validation, context-aware output encoding. GuardianX detects all injection variants via SAST.

## A04:2021 — Insecure Design

New category in 2021. Focuses on architectural flaws — missing threat modeling, no rate limiting, no abuse cases considered.

**Examples:**
- A password reset flow that doesn't expire tokens
- A referral system that doesn't cap rewards per user
- An API with no pagination (allows data scraping)

**Fix:** Threat-model every new feature. Use abuse-case user stories. Implement rate limiting, CAPTCHA, and anomaly detection.

## A05:2021 — Security Misconfiguration

**Examples:**
- Default credentials left in production
- Directory listing enabled
- Verbose error messages with stack traces
- Unnecessary features enabled (debug mode, admin UI)
- Missing security headers (CSP, HSTS, X-Frame-Options)

**Fix:** Harden infrastructure as code. Disable defaults. Add security headers via middleware. GuardianX scans for misconfigurations across your stack.

## A06:2021 — Vulnerable and Outdated Components

Previously "Using Components with Known Vulnerabilities". Includes libraries, frameworks, OS packages.

**Examples:**
- An old version of log4j with CVE-2021-44228 (Log4Shell)
- Outdated npm packages with known CVEs
- Alpine base image missing security patches

**Fix:** SCA scanning (GuardianX SCA module), dependabot/renovate for auto-PRs, regular \`npm audit\` / \`pip-audit\`.

## A07:2021 — Identification and Authentication Failures

Previously "Broken Authentication".

**Examples:**
- Weak passwords allowed (no minimum length, no breach check)
- No MFA on admin accounts
- Session IDs in URLs
- Session fixation after login
- Credential stuffing not blocked

**Fix:** Enforce strong passwords (>=12 chars, breached-password check via haveibeenpwned API). MFA everywhere. Rotating session IDs. Rate-limit login attempts.

## A08:2021 — Software and Data Integrity Failures

New in 2021. Focuses on assumptions about software updates, CI/CD pipelines, and data integrity.

**Examples:**
- Unsigned npm packages (supply chain attacks)
- CI/CD pipelines with overly broad secrets
- Insecure deserialization (PHP unserialize, Python pickle)

**Fix:** Sign all packages. Lock dependency versions (package-lock.json, requirements.txt with hashes). Use signed commits. Avoid deserializing untrusted data — use JSON.

## A09:2021 — Security Logging and Monitoring Failures

**Examples:**
- No audit log for sensitive actions (login, password change, data export)
- Logs not centralized (scattered across instances)
- No alerting on suspicious patterns (multiple failed logins)
- Logs deleted after 7 days (insufficient for forensic analysis)

**Fix:** Centralized logging (ELK, Splunk, Datadog). SIEM with correlation rules. Retention aligned with regulatory requirements (often 1 year). Real-time alerts on anomaly patterns.

## A10:2021 — Server-Side Request Forgery (SSRF)

New in 2021 based on community survey. SSRF lets an attacker force the server to make requests to unintended destinations.

**Examples:**
- Image proxy that fetches \`http://169.254.169.254/latest/meta-data/\` (AWS metadata)
- Webhook tester that can hit internal services

**Fix:** Allow-list outbound hosts. Block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x). Use a dedicated egress proxy. For AWS, use IMDSv2 (token-based metadata API).

## Beyond the Top 10

The OWASP Top 10 is a floor, not a ceiling. Modern applications also face:
- Business logic vulnerabilities (the Top 10 doesn't cover these well)
- API security (see OWASP API Security Top 10)
- Cloud misconfigurations (see OWASP Cloud-Native Application Security Top 10)
- Supply chain attacks
- LLM prompt injection (OWASP LLM Top 10)

GuardianX's SAST + DAST engines cover all 10 OWASP categories plus 17 additional vulnerability classes. Sign up for a scan to see where your application stands.`,
  },
  {
    slug: "guardianx-23-vulnerabilities-2-hours",
    title: "How GuardianX Found 23 Vulnerabilities in 2 Hours",
    excerpt:
      "A real engagement walkthrough: mid-size fintech, 80k LOC, 12 microservices. We ran GuardianX end-to-end and found 23 vulnerabilities including 4 criticals — here's how.",
    category: "Case Studies",
    date: "2026-01-20",
    readTime: "10 min read",
    author: { name: "Sneha Iyer", role: "Solutions Architect" },
    content: `This case study walks through a real GuardianX engagement with a mid-size fintech company (name anonymized as "FinCo"). FinCo had 12 microservices, ~80,000 lines of code across Node.js, Python, and Go, and was preparing for a SOC 2 audit. Their previous VAPT vendor took 3 weeks and produced a 90-page report that the engineering team couldn't action.

## Engagement Setup

We connected FinCo's repositories via Git URL and provided staging URLs for DAST. Total setup time: 12 minutes. We then launched a full VAPT scan across all 12 services in parallel.

## Phase 1: Recon (0:00–0:15)

GuardianX's recon module ran:
- nmap port scans on staging URLs
- ffuf directory brute-force with the SecLists wordlist
- Tech fingerprinting (Wappalyzer-style)
- Subdomain enumeration via certificate transparency logs

Discovered: 3 forgotten staging endpoints (admin.insecure.staging.finco.com, old.finco.com, api-v1.finco.com), 2 exposed .git/config files, 1 exposed .env file containing a Stripe secret key.

## Phase 2: SAST (0:15–0:45)

GuardianX indexed all 12 repositories and ran static analysis for 27 vulnerability classes. Found:

- **8 SQL injection points** in a legacy Node.js service (string-concatenated queries in a 4-year-old billing module)
- **5 hardcoded secrets** (AWS access keys, database passwords, JWT secrets) in 3 repos
- **3 SSRF vulnerabilities** in a webhook delivery service
- **2 path traversal** issues in a file upload handler
- **4 insecure deserialization** uses of Python pickle in a worker service

## Phase 3: DAST (0:30–1:30)

The RedAgent engine crawled each staging URL with Playwright, then sent safe, non-destructive payloads. Confirmed:

- **2 SQL injection** (the SAST-found ones, plus response signature confirmation)
- **1 stored XSS** in a profile bio field (stored in Postgres, rendered without escaping in the admin dashboard)
- **1 IDOR** — \`/api/v1/transactions/{id}\` returned any user's transactions without ownership check
- **1 broken authentication** — JWT \`alg: none\` accepted on 2 services
- **1 missing rate limit** on the login endpoint (allowed 10,000 attempts/min)

## Phase 4: AI Triage & Patch Generation (1:30–1:50)

The AI triage layer correlated SAST + DAST findings, removed 9 false positives (suspected SQLi that wasn't actually exploitable), and confirmed 23 real vulnerabilities:

- **4 Critical** (SQLi, IDOR, JWT alg:none, exposed Stripe key)
- **7 High** (hardcoded secrets, SSRF, stored XSS, broken auth)
- **8 Medium** (path traversal, deserialization, missing headers)
- **4 Low** (information disclosure, verbose errors)

For each finding, GuardianX generated a code patch. Sandbox-tested each patch (spun up a microservice container with the patch applied, ran the original exploit, confirmed it no longer worked). 21 of 23 patches passed sandbox on first try; 2 needed a second AI iteration.

## Phase 5: Report & Attestation (1:50–2:00)

GuardianX generated a 42-page PDF report containing:
- AI-written executive summary (1 page, board-ready)
- Technical findings table with CVSS v3.1 scores
- Risk heat map
- Per-finding: location, evidence, suggested patch, sandbox result
- Attestation ledger (SHA-256 hashes of each finding + patch, signed and timestamped)

Total elapsed: 1 hour 52 minutes. Compare to their previous vendor's 3 weeks.

## Key Findings Walkthrough

### Finding 1: JWT alg:none (Critical)

The auth service accepted JWTs with \`alg: "none"\`, which means no signature verification. An attacker could forge any JWT, including \`{role: "admin"}\`.

**Patch:** Added \`algorithms: ["HS256"]\` to the \`jwt.verify()\` call, rejecting any token that doesn't use HS256.

### Finding 2: IDOR on transactions endpoint (Critical)

\`/api/v1/transactions/{id}\` returned any transaction by ID, regardless of the authenticated user's ownership.

**Patch:** Added ownership check — \`if (transaction.userId !== req.user.id) return 403\`.

### Finding 3: Exposed Stripe secret key (Critical)

An old \`.env\` file was served at \`https://old.finco.com/.env\` containing a live Stripe secret key (sk_live_...).

**Remediation:** Rotated the Stripe key immediately, removed the file, blocked .env serving via Nginx config, and added GuardianX's exposure-path scanner to CI to catch this in future.

### Finding 4: SQL injection in billing (Critical)

The billing service concatenated user input into SQL strings in 8 places. One was exploitable via the search filter — \`?search=product%' UNION SELECT * FROM users--\` returned all user records.

**Patch:** Replaced all 8 string-concatenated queries with parameterized versions using Prisma's \`queryRaw\` with bound parameters.

## Outcomes

- **23 vulnerabilities found and patched** in under 2 hours
- **SOC 2 audit** passed 3 weeks later with zero security findings
- **MTTR** (mean time to remediate) dropped from 14 days (previous vendor) to under 2 hours
- **FinCo replaced** their retainer VAPT vendor with a GuardianX Enterprise subscription

## Lessons for Other Fintechs

1. **Forgotten staging endpoints are gold for attackers** — they're often less hardened than production. Inventory all subdomains.
2. **Old code is dangerous code** — the SQLi was in a 4-year-old module nobody had touched. Scan your whole codebase, not just recent commits.
3. **Exposed secrets are the easiest critical** to find and fix. Rotate immediately, scan continuously.
4. **Speed matters for remediation** — a 3-week delay between finding and fixing a Critical is unacceptable when attackers can exploit within hours.

Want similar results for your org? Sign up for a GuardianX Enterprise scan.`,
  },
  {
    slug: "ci-cd-security-with-guardianx",
    title: "Setting up CI/CD Security with GuardianX",
    excerpt:
      "Shift security left: wire GuardianX into GitHub Actions, GitLab CI, and Jenkins. Scan every PR, block merges on Critical findings, and post inline code comments.",
    category: "Tutorials",
    date: "2026-01-13",
    readTime: "9 min read",
    author: { name: "Arjun Reddy", role: "DevSecOps Engineer" },
    content: `Shifting security left — running scans on every pull request instead of waiting for a pre-release VAPT — reduces remediation cost by 10-100x. This tutorial shows how to wire GuardianX into your CI/CD pipeline so every PR is automatically scanned, with findings posted as inline code comments and Critical issues blocking merges.

## Why CI/CD Security?

A vulnerability caught in development costs minutes to fix. The same vulnerability caught in production costs hours (incident response, hotfix deploy, customer comms). CI/CD scanning catches issues at the cheapest possible point in the lifecycle.

## Prerequisites

- A GuardianX account (any tier)
- A repository on GitHub, GitLab, or Bitbucket
- CI/CD runner: GitHub Actions, GitLab CI, or Jenkins
- GuardianX API token (Settings → API Tokens → Generate)

## Option 1: GitHub Actions

Add this workflow to \`.github/workflows/guardianx.yml\`:

\`\`\`yaml
name: GuardianX Security Scan
on:
  pull_request:
    branches: [main, develop]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Install GuardianX CLI
        run: |
          curl -fsSL https://guardianx.in/install.sh | sh
      - name: Run SAST scan
        env:
          GUARDIANX_TOKEN: \${{ secrets.GUARDIANX_TOKEN }}
        run: |
          guardianx scan sast \\
            --path . \\
            --format json \\
            --output findings.json \\
            --fail-on critical
      - name: Post inline comments
        if: always()
        env:
          GUARDIANX_TOKEN: \${{ secrets.GUARDIANX_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          guardianx comment github \\
            --findings findings.json \\
            --pr \${{ github.event.pull_request.number }}
\`\`\`

Add \`GUARDIANX_TOKEN\` as a repository secret (Settings → Secrets → Actions).

## Option 2: GitLab CI

Add to \`.gitlab-ci.yml\`:

\`\`\`yaml
guardianx-sast:
  image: node:20
  stage: test
  only:
    - merge_requests
  script:
    - curl -fsSL https://guardianx.in/install.sh | sh
    - guardianx scan sast --path . --format json --output findings.json --fail-on critical
    - guardianx comment gitlab --findings findings.json --mr $CI_MERGE_REQUEST_IID
  artifacts:
    reports:
      sast: findings.json
\`\`\`

Set \`GUARDIANX_TOKEN\` as a CI/CD variable (Settings → CI/CD → Variables).

## Option 3: Jenkins

Add a Jenkinsfile stage:

\`\`\`groovy
pipeline {
  agent any
  stages {
    stage('GuardianX SAST') {
      steps {
        sh 'curl -fsSL https://guardianx.in/install.sh | sh'
        withCredentials([string(credentialsId: 'guardianx-token', variable: 'TOKEN')]) {
          sh '''
            guardianx scan sast \\
              --path . \\
              --format json \\
              --output findings.json \\
              --fail-on critical \\
              --token $TOKEN
          '''
        }
      }
    }
  }
}
\`\`\`

## Configuration: fail-on Thresholds

GuardianX CLI supports several thresholds:

- \`--fail-on critical\` — exit code 1 if any Critical finding
- \`--fail-on high\` — exit 1 if any Critical OR High
- \`--fail-on medium\` — exit 1 if Medium or above
- \`--fail-on low\` — exit 1 on any finding (strict)

Recommended: start with \`--fail-on critical\` for the first month, then escalate to \`--fail-on high\` once the team is comfortable.

## Inline Code Comments

The CLI's \`comment\` subcommand posts findings as PR review comments on the exact line of code. Developers see them in their IDE without leaving GitHub. Each comment includes:

- Severity badge
- Vulnerability class (e.g., "SQL Injection")
- Why it's vulnerable
- Suggested patch (AI-generated, copy-pasteable)

## Baseline: Ignoring Pre-existing Findings

If your codebase has 200 existing findings and you don't want to block every PR, use the baseline feature:

\`\`\`bash
# Initial baseline
guardianx baseline create --path . --output baseline.json

# Subsequent scans ignore findings present in baseline
guardianx scan sast --path . --baseline baseline.json --fail-on critical
\`\`\`

New findings introduced in a PR will block; pre-existing ones won't.

## DAST in CI/CD

For dynamic scanning, deploy your PR branch to a staging environment, then run:

\`\`\`bash
guardianx scan dast \\
  --url https://pr-\${PR_NUMBER}.staging.acme.com \\
  --format json \\
  --output dast-findings.json \\
  --fail-on high
\`\`\`

DAST scans take longer (2-10 min), so consider running them only on PRs touching specific paths (e.g., \`/api/\`).

## Secrets Scanning

GuardianX also scans for hardcoded secrets (AWS keys, DB passwords, JWT secrets, Stripe keys):

\`\`\`bash
guardianx scan secrets --path . --fail-on any
\`\`\`

Recommend: \`--fail-on any\` for secrets scanning — there's no acceptable number of leaked secrets.

## Status Checks

After configuring the workflow, add GuardianX as a required status check in your branch protection rules (GitHub: Settings → Branches → Edit → Require status checks to pass before merging → select "GuardianX Security Scan").

## Notifications

Wire findings to Slack:

\`\`\`bash
guardianx notify slack \\
  --findings findings.json \\
  --webhook \${{ secrets.SLACK_WEBHOOK }} \\
  --severity high
\`\`\`

## Performance Tips

- **Cache the GuardianX binary** in CI to avoid re-downloading
- **Run SAST only on changed files** with \`--diff\` flag for large repos
- **Parallelize** SAST + DAST + secrets scans as separate jobs
- **Use a self-hosted runner** for very large monorepos

## Measuring DevSecOps Success

Track these metrics over time:
- **MTTR** (mean time to remediate) — should drop
- **Critical findings per 1k LOC** — should trend toward 0
- **% of PRs blocked by GuardianX** — should be <5% after baseline
- **Time to first finding** — should be <30 seconds

A mature CI/CD security pipeline catches 95%+ of vulnerabilities before merge, with zero developer friction. Sign up for GuardianX and try it on your repo today.`,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRecentPosts(limit = 3): BlogPost[] {
  return [...BLOG_POSTS]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const post = getPostBySlug(slug);
  if (!post) return [];
  return BLOG_POSTS
    .filter((p) => p.slug !== slug)
    .sort((a, b) => {
      // Same category first, then most recent
      const aScore = (a.category === post.category ? 1 : 0);
      const bScore = (b.category === post.category ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })
    .slice(0, limit);
}

/**
 * Parse the markdown-ish content into a list of headings for the table of
 * contents. Returns entries with { id, text, level }.
 */
export function getTableOfContents(content: string): { id: string; text: string; level: number }[] {
  const lines = content.split("\n");
  const toc: { id: string; text: string; level: number }[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      toc.push({ id, text, level });
    }
  }
  return toc;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
