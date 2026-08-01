"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Cpu, Shield, Bug, Crosshair, Lock, Gavel, Database,
  Network, Eye, Zap, GitBranch, Activity, FlaskConical,
} from "lucide-react";

export default function WhitepaperPage() {
  const SECTIONS = [
    {
      icon: Cpu,
      title: "1. Platform Architecture",
      content: `GuardianX is built on a three-tier microservices architecture:

**Tier 1 — Presentation Layer (Vercel)**
Next.js 16 with App Router, TypeScript, Tailwind CSS 4, and shadcn/ui. The frontend is a single-page application with server-side rendering for SEO and client-side hydration for interactivity. The Command Center dashboard provides real-time visibility into all security operations.

**Tier 2 — Compute Layer (Railway Engine)**
A Bun + Node.js runtime that handles all heavy compute: SAST pipeline execution, DAST HTTP attacks, sandbox test execution, PDF generation (Python3 + ReportLab), and web scraping (Python3 + httpx + BeautifulSoup). The engine communicates with the frontend via HTTP API (for synchronous operations) and Socket.io (for real-time event streaming).

**Tier 3 — Data Layer (Supabase PostgreSQL)**
All persistent data is stored in PostgreSQL, accessed via Supabase's REST API (HTTPS port 443). This ensures compatibility with Vercel's serverless functions which cannot open TCP connections to port 5432. The database schema includes 25 tables covering clients, codebases, scans, patches, findings, engagements, attestations, canaries, and audit logs.

**Security Boundaries**
- JWT authentication on all API routes (Edge middleware)
- bcrypt password hashing (12 rounds)
- Rate limiting (60 req/min general, 10 req/15min auth)
- AES-256-GCM encryption for stored credentials
- SHA-256 hash-chained attestation ledger for patch approvals
- Row-Level Security on all database tables`,
    },
    {
      icon: Bug,
      title: "2. SAST Engine — Static Application Security Testing",
      content: `The SAST engine uses a multi-stage AI-driven pipeline:

**Stage 1: AI Vulnerability Detection**
The Z.AI Large Language Model analyzes source code submitted by the user. Unlike traditional SAST tools that rely on pattern matching or AST analysis, GuardianX uses LLM reasoning to understand code semantics, data flow, and potential exploitation paths. This allows detection of:
- SQL injection (CWE-89)
- Cross-site scripting (CWE-79)
- Path traversal (CWE-22)
- Command injection (CWE-78)
- Insecure deserialization (CWE-502)
- Hardcoded credentials (CWE-798)
- Weak cryptography (CWE-327)

**Stage 2: Patch Generation**
For each detected vulnerability, the AI generates a production-ready fix with:
- The patched code (drop-in replacement)
- A unified diff for review
- Generated test code for sandbox verification
- AI explanation of the vulnerability and fix

**Stage 3: Sandbox Verification**
The patched code is written to an isolated temp directory and executed via \`bun run\` with a 12-second timeout. The sandbox environment has:
- No network access
- No environment variables (except PATH, HOME, NODE_ENV)
- No access to the parent process filesystem
- Hard process kill on timeout

**Stage 4: Exploit PoC Generation**
The AI generates a proof-of-concept exploit that demonstrates the vulnerability is real. The exploit is run against both the original (vulnerable) code and the patched code:
- Original code → EXPLOIT_SUCCESS (proves the vuln is real)
- Patched code → EXPLOIT_BLOCKED (proves the fix works)

**Stage 5: Adversarial Arena**
A second AI persona (the "attacker") attempts to bypass the AI-generated patch. If a bypass is found, the "defender" iterates the patch. This loop runs for up to 2 rounds, ensuring the patch is battle-tested before human review.`,
    },
    {
      icon: Crosshair,
      title: "3. DAST Engine — RedAgent VAPT",
      content: `The RedAgent engine performs autonomous penetration testing against live targets:

**Stage 1: Crawling & Discovery**
The engine crawls the target URL using httpx (lightweight mode) or Playwright (browser mode for JavaScript-rendered pages). It discovers all endpoints, forms, API routes, and static files. The crawl summary includes endpoint count, methods, parameters, and response codes.

**Stage 2: AI Attack Planning**
The Z.AI LLM receives the crawl summary and plans category-appropriate attacks per OWASP Top 10:2021:
- A01: Broken Access Control (IDOR, privilege escalation)
- A02: Cryptographic Failures (weak TLS, plaintext data)
- A03: Injection (SQLi, NoSQLi, command injection, LDAP)
- A04: Insecure Design (business logic flaws)
- A05: Security Misconfiguration (exposed files, debug mode)
- A06: Vulnerable Components (outdated libraries)
- A07: Authentication Failures (weak passwords, session fixation)
- A08: Data Integrity Failures (unsigned JWTs, insecure deserialization)
- A09: Logging Failures (missing audit trails)
- A10: SSRF (server-side request forgery)

**Stage 3: HTTP Attack Execution**
For each planned attack, the engine crafts HTTP requests with payloads and sends them to the target. Each request is logged with:
- Full HTTP request (method, URL, headers, body)
- Full HTTP response (status, headers, body)
- Response time and size
- Whether the attack was successful

**Stage 4: Sensitive Data Exposure Sweep**
After AI-driven attacks, the engine systematically:
- Scans every crawled endpoint's response for leaked secrets (AWS keys, Stripe keys, GitHub PATs, JWTs, private keys, passwords, SSNs, credit cards) using 16 regex patterns
- Probes 22+ known exposure paths: /.env, /.git/config, /backup.sql, /wp-config.php, /phpinfo.php, /server-status, /admin, /.DS_Store, etc.
- All secret samples are redacted to first4…last4 format — the full secret is never stored

**Stage 5: Finding Documentation**
Each confirmed vulnerability is saved with full evidence: HTTP request, HTTP response, payload, confidence score, OWASP mapping, and AI-generated remediation advice.`,
    },
    {
      icon: Lock,
      title: "4. Security & Cryptography",
      content: `**Authentication**
- JWT tokens (7-day expiry) signed with HS256 using a server-side secret
- bcrypt password hashing (12 rounds, ~250ms per hash)
- HTTP-only cookies for token storage (XSS-proof)
- Edge middleware verifies JWT on every /api/* request

**Data Encryption**
- Credentials (Git tokens, API keys) encrypted at rest using AES-256-GCM
- Each credential has a unique IV (initialization vector) and auth tag
- The encryption key is stored in the SENTINEL_ENC_KEY environment variable

**Attestation Ledger**
- Every approved patch creates a SHA-256 hash-chained attestation
- Hash = SHA-256(prevHash + patchId + patchedCodeHash + timestamp)
- Any modification to a past attestation breaks all subsequent hashes
- The chain is verifiable via GET /api/attestations

**Rate Limiting**
- In-memory sliding window rate limiter (per IP)
- General API: 60 requests per minute
- Auth endpoints: 10 requests per 15 minutes (brute force protection)
- Returns 429 with Retry-After header when exceeded

**Input Validation**
- All request bodies sanitized (null byte stripping, length limits)
- Email validation (regex + length check)
- URL validation (protocol whitelist: http/https only)
- UUID validation on all ID parameters
- Severity whitelist (critical/high/medium/low/info)`,
    },
    {
      icon: Gavel,
      title: "5. Compliance Framework Mapping",
      content: `GuardianX automatically maps every finding to multiple compliance frameworks:

**DPDPA 2023 (Digital Personal Data Protection Act, India)**
- §8(5) Security Safeguards: Maps to SQL injection, XSS, path traversal, authentication bypass
- §8(6) Breach Notification: Maps to sensitive data exposure, .env leaks
- §4(2) Purpose Limitation: Maps to IDOR, broken access control

**GDPR (General Data Protection Regulation)**
- Art. 32 Security of Processing: Maps to injection, crypto failures
- Art. 33 Breach Notification (72h): Maps to data exposure
- Art. 25 Data Protection by Design: Maps to access control

**HIPAA (Health Insurance Portability and Accountability Act)**
- §164.312(a)(1) Access Control: Maps to IDOR, auth bypass
- §164.312(b) Audit Controls: Maps to SQL injection
- §164.312(d) Authentication: Maps to weak auth
- §164.404 Breach Notification: Maps to PHI exposure

**PCI-DSS (Payment Card Industry Data Security Standard)**
- Requirement 6: Secure coding practices
- Requirement 8: Authentication
- Requirement 10: Logging and monitoring

**ISO 27001 / SOC 2**
- A.12.6 Technical Vulnerability Management
- A.14.2 Security in Development and Support

The compliance dashboard shows per-framework compliance score, section-level status, and auto-drafts breach notifications when DPDPA §8(6) triggers are detected.`,
    },
    {
      icon: FlaskConical,
      title: "6. R&D Lab — Self-Improving AI",
      content: `GuardianX is the only security platform with a built-in R&D Lab that continuously improves its own modules:

**GitHub Tool Research**
- Searches GitHub API for open-source security tools (vulnerability scanners, exploit frameworks, WAF generators)
- AI analyzes repository code: AST patterns, concurrency models, protocol handling, key optimizations
- Documents vulnerabilities/anti-patterns in the analyzed code

**Gap Analysis**
- Compares each GuardianX module against best-in-class open-source tools
- Documents where OSS performs better (speed, accuracy, coverage)
- Identifies missing protocols/attack vectors

**Benchmark Engine**
- Runs performance benchmarks: GuardianX vs baseline OSS tool
- Measures: duration (ms), accuracy (%), memory (MB), findings count
- PASS/FAIL verdict with improvement percentage

**Protocol Fuzzer**
- Mutation-based fuzzing for HTTP/GraphQL/WebSocket
- Integer overflow, string boundary, JSON structure mutations
- Detects: slow responses, server errors, error leaks, oversized responses

**Attack Graph DAG**
- Models vulnerabilities as Directed Acyclic Graph
- AI generates multi-step attack chains from all findings
- Shows how low-severity issues chain into full compromise

**Virtual Patching**
- Auto-generates WAF rules (ModSecurity, Cloudflare, iptables, Nginx)
- For findings that can't be code-patched immediately

**IaC Remediation**
- Generates Terraform, Ansible, Kubernetes, Docker manifests
- Patches at the deployment template level — no live server modifications`,
    },
  ];

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />

      <div className="relative z-10 mx-auto pt-16 max-w-4xl px-4 py-20 sm:px-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16">
          <Badge className="mb-4 border-violet-500/30 bg-violet-500/10 text-violet-300">
            <FileText className="size-3" /> Technical Whitepaper
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
            GuardianX Architecture & Security Documentation
          </h1>
          <p className="mt-4 text-sm text-zinc-400">
            A comprehensive technical reference covering platform architecture, SAST/DAST engines, cryptographic security, compliance mapping, and the self-improving R&D Lab.
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs text-zinc-600">
            <span>Version 1.0.0</span>
            <span>·</span>
            <span>Last updated: {new Date().getFullYear()}</span>
            <span>·</span>
            <span>© GuardianX</span>
          </div>
        </motion.div>

        {/* Table of Contents */}
        <div className="holo-card-sharp hud-corners mb-12 p-5">
          <h3 className="mb-3 text-xs font-mono uppercase tracking-widest text-emerald-500/60">{"// Table of Contents"}</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SECTIONS.map((s, i) => (
              <a key={i} href={`#section-${i + 1}`} className="flex items-center gap-2 rounded p-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-emerald-300">
                <s.icon className="size-3.5 text-emerald-400" />
                <span>{s.title}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((section, i) => (
          <motion.section
            key={i}
            id={`section-${i + 1}`}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <section.icon className="size-5 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-50">{section.title}</h2>
            </div>
            <div className="holo-card-sharp hud-corners p-6">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {section.content.split("\n").map((line, j) => {
                  if (line.startsWith("**") && line.endsWith("**")) {
                    return <p key={j} className="mt-3 font-bold text-emerald-300">{line.replace(/\*\*/g, "")}</p>;
                  }
                  if (line.startsWith("- ")) {
                    return <p key={j} className="ml-4 text-zinc-400">• {line.slice(2)}</p>;
                  }
                  return <p key={j} className="text-zinc-400">{line}</p>;
                })}
              </div>
            </div>
          </motion.section>
        ))}

        {/* Footer */}
        <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          <p>© {new Date().getFullYear()} GuardianX. All rights reserved.</p>
          <p className="mt-1">www.guardianx.in · hello@guardianx.in · +91 70067 12347</p>
        </div>
      </div>
    </div>
      <SiteFooter />
    </>
  );
}
