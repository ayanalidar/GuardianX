# GuardianX — Secure Software Development Lifecycle (SDLC) Policy

**Document ID:** SECURE-SDLC
**Version:** 1.0
**Owner:** GuardianX Security Engineering
**Review cycle:** Quarterly
**Aligned with:** ISO/IEC 27001 A.14, SOC 2 Trust Services Criteria (Security), DPDPA 2023 § 8(5)

---

## 1. Purpose

This policy defines the mandatory security activities that must be performed at every phase of the GuardianX software development lifecycle. It exists to ensure that security is **baked in**, not bolted on — every line of code is reviewed, every release is scanned, every deployment is auditable, and every vulnerability is tracked to closure.

Failure to follow this policy is a code-merge blocker. No exceptions.

---

## 2. Scope

This policy applies to:

| Surface | Examples |
| --- | --- |
| Web application | `src/app/**` (Next.js 16 API routes + React 19 components) |
| Engine services | `mini-services/sentinel-engine/**`, `mini-services/recon-tools/**`, `mini-services/vuln-target/**` |
| Desktop client | `desktop/**` (Electron) |
| Infrastructure | `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `supabase/migrations/**` |
| Dependencies | Everything in `package.json` + `bun.lock` and Python `requirements.txt` |
| Secrets | Anywhere a key, token, password, or IV is referenced |

Out of scope: documentation-only PRs (`docs/*.md`, `README.md`) — those still require typo review but skip the security checklists below.

---

## 3. Lifecycle Phases

### Phase 1 — Requirements

| Activity | Output |
| --- | --- |
| Security requirements gathered for every new feature | "Security requirements" section in the feature spec |
| Threat-model sketch (STRIDE) for features touching auth, data flow, or payments | `docs/THREAT-MODEL.md` updated |
| Compliance mapping (DPDPA / ISO 27001 / SOC 2) | Feature spec references the relevant section |
| Abuse-case definition | "What an attacker would do with this feature" listed |

**Gate:** No feature enters Design without an explicit security requirements section.

### Phase 2 — Design

| Activity | Output |
| --- | --- |
| STRIDE threat modeling | Threats table in `docs/THREAT-MODEL.md` |
| Data-flow diagram (DFD) updated | `docs/DATA-FLOW.md` |
| Cryptographic decisions documented | `docs/KEY-MANAGEMENT.md` updated |
| Least-privilege access model designed | New roles documented in `src/lib/auth.ts` |
| Privacy impact assessment (DPDPA § 8) | "PII touched" + "retention" columns in spec |

**Gate:** No feature enters Development without a design review sign-off by at least one engineer outside the author's team.

### Phase 3 — Development

| Activity | Tool / Standard |
| --- | --- |
| Language | TypeScript 5, `strict: true` (`tsconfig.json`) |
| Linting | ESLint 9 + `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` |
| Formatting | Prettier (via editor config) |
| Secrets | Never in code; loaded from env. CI scans with `gitleaks` |
| Dependencies | `bun install` resolves signed packages; `bun audit` runs in CI |
| Auth | `requireAuth()` / `requireAdmin()` from `src/lib/auth.ts` on every state-changing route |
| Input validation | Zod schemas (`zod@4`) on every POST body |
| SQL | Prisma ORM (parameterized) — no raw string concatenation |
| Crypto | `node:crypto` only (no custom crypto), AES-256-GCM for secrets at rest |
| Logging | Never log passwords, tokens, PII, or full secrets — see `src/lib/sanitize.ts` |

**Code Review Checklist (mandatory for every PR):**

- [ ] No `any` types added without justification (eslint rule disabled project-wide, so reviewers must enforce manually)
- [ ] No `console.log` of PII, passwords, tokens, or full request bodies
- [ ] Every new API route calls `requireAuth()` or is explicitly added to `PUBLIC_ROUTES` in `src/middleware.ts` with a documented reason
- [ ] Every new POST/PUT/DELETE validates input shape with Zod
- [ ] Every new database write is wrapped in try/catch and returns a structured error
- [ ] No new dependency added without `bun audit` passing
- [ ] No secret in code, env files, or commit messages
- [ ] Every new audit-worthy action calls `db.auditLog.create(...)` with `action`, `actor`, `entity`
- [ ] No SQL string concatenation — use Prisma or the `supabase.from(...).eq(...)` builder
- [ ] Every cookie set with `httpOnly: true`, `secure: NODE_ENV === "production"`, `sameSite: "lax"`
- [ ] Every email sent via `src/lib/email.ts` (`sendEmail` / `sendBulkEmail`)
- [ ] Tests added for new auth / validation / crypto logic (`tests/*.test.ts`)
- [ ] README / docs updated if user-facing behavior changed

**Gate:** No PR merges without an approving review + green CI.

### Phase 4 — Testing

| Layer | Tool | Where it runs |
| --- | --- | --- |
| SAST (built-in) | Sentinel Engine language patterns + ESLint security rules | Every commit (pre-merge) |
| DAST (RedAgent) | `mini-services/sentinel-engine` RedAgent pipeline + `mini-services/vuln-target` | Every release branch |
| Unit tests | Vitest (`tests/*.test.ts`) | Pre-merge CI |
| Integration tests | Manual + API smoke tests against staging | Pre-release |
| Penetration testing | External annual assessment + quarterly self-test using Nmap/Nuclei/ffuf/sqlmap (in `mini-services/recon-tools`) | Quarterly |
| Fuzz testing | `/api/fuzz`, `/api/protocol-fuzzer`, `/api/business-logic-test` | Pre-release |
| Dependency audit | `bun audit` + `pip-audit` (for Python services) | CI |
| Secret scanning | `gitleaks` | CI + pre-commit hook |
| Container scanning | Trivy against `Dockerfile` + `mini-services/*/Dockerfile` | Pre-release |

**Gate:** No release ships with: failing unit tests, known Critical CVE in dependencies, or unresolved SAST findings of severity ≥ High.

### Phase 5 — Deployment

| Activity | Mechanism |
| --- | --- |
| Containerization | Docker (multi-stage builds; non-root user; minimal base image) |
| Orchestration | Docker Compose (dev), Vercel (web prod), Railway (engine prod) |
| Reverse proxy | Caddy (auto-HTTPS via Let's Encrypt) |
| Secrets injection | Environment variables only — never baked into images |
| Database migrations | Versioned SQL files in `supabase/migrations/NNNN_*.sql`, applied via Supabase SQL Editor or `prisma migrate deploy` |
| Health check | `/api/health` polled by orchestrator |
| Rollback | `Caddyfile` allows instant swap; `supabase/migrations/` are forward-only with explicit rollback scripts where needed |
| Audit trail | Every deployment logs `deployment.executed` to AuditLog (planned) |

**Deployment Security Checklist (mandatory before every release):**

- [ ] All env vars validated as present (`.env.production` reviewed)
- [ ] `JWT_SECRET` rotated within the last 12 months
- [ ] `BREAK_GLASS_KEY` rotated since last use
- [ ] `SENTINEL_ENC_KEY` (AES-256 master) rotated within the last 3 months
- [ ] Supabase service-role key rotated within the last 6 months
- [ ] No `console.log` of secrets in production build (`NODE_ENV=production` strips none automatically — grep manually)
- [ ] `CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` headers set by Caddy
- [ ] TLS 1.2+ enforced (Caddy default)
- [ ] Database backup verified restorable
- [ ] Incident response runbook (`docs/SECURE-SDLC.md` § 6.6) reviewed
- [ ] DPDPA breach notification template (`src/app/api/breach/notify/route.ts`) tested with a dry-run
- [ ] All critical / high findings from the last pentest closed or risk-accepted with documented owner

**Gate:** No production deployment without checklist sign-off by both release captain and security lead.

### Phase 6 — Maintenance

| Activity | Cadence |
| --- | --- |
| Vulnerability monitoring | GitHub Dependabot (weekly), `bun audit` (CI), CVE feeds for Python services |
| Patch management | Critical → 24h, High → 7d, Medium → 30d, Low → next release |
| Dependency refresh | Monthly PR by dependabot |
| Incident response | See § 6.6 below |
| Periodic access review | Quarterly audit of `User.role = admin` |
| Key rotation | Per schedule in `docs/KEY-MANAGEMENT.md` |
| Threat model refresh | Annually or after a major architectural change |
| Pentest refresh | Annually (external) + quarterly (self-test) |
| DPDPA compliance review | Quarterly, owned by Data Protection Officer |

---

## 4. Code Review Checklist (consolidated)

> This is the canonical checklist. PRs that fail any item are blocked.

| # | Item |
| --- | --- |
| 1 | No `any` types added without an inline justification comment |
| 2 | No `console.log` of PII, passwords, tokens, or full request bodies |
| 3 | Every new API route calls `requireAuth()` or `requireAdmin()` |
| 4 | Every public route is explicitly added to `PUBLIC_ROUTES` with a justification |
| 5 | Every POST/PUT body validated with Zod |
| 6 | Every DB write is try/catch'd and returns a structured JSON error |
| 7 | No new dependency without `bun audit` clean |
| 8 | No secret in code, env, or commit message |
| 9 | Every audit-worthy action calls `db.auditLog.create(...)` |
| 10 | No SQL string concatenation — use Prisma / Supabase builder |
| 11 | Cookies use `httpOnly`, `secure`, `sameSite=lax` |
| 12 | Emails go through `src/lib/email.ts` |
| 13 | Tests added for new auth / validation / crypto logic |
| 14 | Docs updated if user-facing behavior changed |
| 15 | No `dangerouslySetInnerHTML` without sanitization (`src/lib/sanitize.ts`) |
| 16 | No `eval`, `new Function`, `child_process.exec` with user input |
| 17 | File uploads (if any) validate MIME + size + scan for embedded scripts |
| 18 | Redirect URLs validated against an allowlist (no open redirect) |
| 19 | Rate limiting considered for any route that mutates state |
| 20 | CSRF protection reviewed for state-changing GETs (none should exist) |

---

## 5. Deployment Security Checklist (consolidated)

> Run this before every production release. Both release captain and security lead must sign.

| # | Item |
| --- | --- |
| 1 | All required env vars present in `.env.production` |
| 2 | `JWT_SECRET` rotated ≤ 12 months ago |
| 3 | `BREAK_GLASS_KEY` rotated since last use |
| 4 | `SENTINEL_ENC_KEY` rotated ≤ 3 months ago |
| 5 | Supabase service-role key rotated ≤ 6 months ago |
| 6 | SMTP password rotated ≤ 6 months ago (Hostinger hPanel) |
| 7 | Stripe secret key rotated ≤ 12 months ago |
| 8 | Z.AI API token rotated ≤ 6 months ago |
| 9 | `NODE_ENV=production` in build env |
| 10 | No `console.log` of secrets in production bundle (grep the built `.next/`) |
| 11 | Caddy headers: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` |
| 12 | TLS 1.2+ only (disable 1.0/1.1 in Caddy) |
| 13 | Database backup taken and verified restorable |
| 14 | Incident response runbook reviewed by on-call |
| 15 | DPDPA breach notification dry-run executed (admin → admin) |
| 16 | All Critical / High findings from last pentest closed or risk-accepted |
| 17 | Dependency audit clean (no Critical CVEs) |
| 18 | Container scan clean (Trivy) |
| 19 | Secret scan clean (gitleaks) |
| 20 | Feature flags for any half-shipped feature explicitly disabled |

---

## 6. Incident Response (summary)

### 6.1 Detection

Sources: SIEM correlation engine (`src/lib/siem/correlation.ts`), anomaly detector (`/api/anomaly-detection`), honeypot hits (`/api/data-flow/honeypot`), canary tokens (`/api/canaries`), external reports (`hello@guardianx.in`), monitoring alerts.

### 6.2 Triage

On-call engineer classifies severity using the same scale as findings: `critical | high | medium | low`. Triage outcome recorded as an Incident (`/api/incidents`) with `severity`, `category`, `assignee`.

### 6.3 Containment

Use `/api/incidents/[id]/contain` with action `isolate | block_ip | rotate_credentials`. For breach-of-personal-data incidents, also rotate the affected user(s)' tokenVersion via the break-glass path.

### 6.4 Eradication

Patch the root cause (via the standard SDLC, expedited), then close the Incident with `eradicatedAt` + `rootCause`.

### 6.5 Recovery

Verify the fix with the RedAgent pipeline, run a fresh pentest on the affected surface, then close the Incident (`status = closed`).

### 6.6 Notification (DPDPA § 8(6))

If the incident involves personal data, use `/api/breach/notify` to send notifications to affected users. Notification must be dispatched within 72 hours of detection. The Board must be notified by the Data Protection Officer via the formal mechanism described in DPDPA § 8(6)(a).

### 6.7 Post-mortem

Every Critical / High incident gets a blameless post-mortem within 7 days, captured as `lessonsLearned` on the Incident record and reviewed in the next quarterly threat-model refresh.

---

## 7. Exceptions

Any deviation from this policy must be:
1. Documented in the PR description with a "Policy exception" header.
2. Approved by both the security lead and the CTO.
3. Time-bounded (max 30 days) and tracked to closure.
4. Auditable in the AuditLog under action `policy.exception_granted`.

---

## 8. References

| Doc | Path |
| --- | --- |
| Threat Model (STRIDE) | `docs/THREAT-MODEL.md` |
| Data Flow Diagram | `docs/DATA-FLOW.md` |
| Key Management | `docs/KEY-MANAGEMENT.md` |
| Production Deployment | `docs/PRODUCTION-DEPLOYMENT.md` |
| Auth utilities | `src/lib/auth.ts` |
| Email service | `src/lib/email.ts` |
| Sanitization | `src/lib/sanitize.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| Crypto (AES-256-GCM) | `src/lib/sentinel/crypto.ts` |
| Audit log API | `src/app/api/audit-log/route.ts` |
| Incident routes | `src/app/api/incidents/**` |
| Breach notification route | `src/app/api/breach/notify/route.ts` |
