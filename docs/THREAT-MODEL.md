# GuardianX — Threat Model (STRIDE)

**Document ID:** THREAT-MODEL
**Version:** 1.0
**Owner:** GuardianX Security Engineering
**Review cycle:** Annually, or after any architectural change
**Methodology:** STRIDE (Microsoft, 1999) — Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
**Aligned with:** ISO/IEC 27001 A.8 (Asset management + threat assessment), SOC 2 CC7 (Risk mitigation), DPDPA 2023 § 8(5) (Security safeguards)

---

## 1. Purpose

This document enumerates every category of attack GuardianX must defend against, the controls we have implemented, and the residual risk that remains after those controls are in place. It is the canonical reference for the secure SDLC (`docs/SECURE-SDLC.md`), for code review, and for the audit-evidence packs exported via `/api/compliance/export`.

---

## 2. System Overview

GuardianX is an autonomous security operations platform consisting of:

| Component | Tech | Trust boundary |
| --- | --- | --- |
| Web app | Next.js 16, React 19, TypeScript | Public (auth-gated routes) |
| API routes | Next.js Route Handlers (`/api/**`) | Same as web app |
| Auth | JWT (HS256) + bcrypt(12) + 2FA (TOTP) | Per-user |
| Database | Supabase (PostgreSQL) — accessed via service-role key from server only | Server-only |
| Sentinel Engine | Bun + TypeScript microservice | Internal network |
| Recon Tools | Bun + Python microservice | Internal network |
| Vuln Target | Disposable test app for DAST | Internal network, isolated |
| Email | SMTP via Hostinger | External, TLS |
| Billing | Stripe | External, TLS + webhook HMAC |
| AI analysis | Z.AI API | External, TLS |

---

## 3. STRIDE Analysis

### 3.1 Spoofing

> *An attacker claims to be someone they are not.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| Password brute force | bcrypt(12) hashing + rate limiting | `src/lib/auth.ts` `hashPassword` (12 rounds, ~250ms), `src/middleware.ts` 10 req / 15 min on `/api/auth/*` | Low — offline GPU attack still possible if DB leaks; mitigated by rotation |
| Password reuse from other breaches | (none — password-strength meter, no HIBP check) | `src/lib/password-strength.ts` rates entropy + common-password list | Medium — recommend HIBP API integration |
| Credential stuffing | Per-IP rate limit + unique-email constraint | `src/middleware.ts` (10/15min), `User.email @unique` | Low |
| JWT theft (XSS / stolen cookie) | HttpOnly + Secure + SameSite=lax cookies | `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts` | Low — XSS would have to land first; CSP enforced by Caddy |
| JWT forgery | HS256 with 32-byte secret, 7d expiry | `src/lib/auth.ts` `createToken`, `JWT_SECRET = openssl rand -hex 32` | Low — secret compromise is the only attack vector |
| Email-verification bypass | First user (admin) auto-approved; all others need admin approval | `src/app/api/auth/signup/route.ts` (approved=false for non-first users), `src/middleware.ts` `if (!user.approved) → 403` | Low |
| 2FA bypass | TOTP via `otplib`, 10 backup codes (bcrypt-hashed) | `src/lib/two-factor.ts`, `src/app/api/2fa/route.ts`, `supabase/migrations/0004_2fa_columns.sql` | Low |
| Account takeover after breach | tokenVersion bump + cookie clear + de-approval | `src/app/api/auth/delete-account/route.ts` (sets `approved=false`, bumps `tokenVersion`) | Low |
| Session hijack on shared device | (none — no concurrent-session detection) | — | Medium — recommend device fingerprinting in next iteration |
| Service-role key impersonation | Key only in server env, never exposed to client | `src/lib/db.ts` reads from `process.env.SUPABASE_SERVICE_ROLE_KEY` | Low — server compromise only |
| Break-glass admin recovery | `BREAK_GLASS_KEY` (32-byte hex) rotated after each use | `docs/KEY-MANAGEMENT.md` schedule | Low |

### 3.2 Tampering

> *An attacker modifies data or code in transit or at rest.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| Patch code tampering | SHA-256 attestation chain (hash chain per patch) | `src/lib/sentinel/attestation.ts`, `Attestation` model with `prevHash + hash + data` | Low — any change breaks the chain |
| Webhook payload tampering | HMAC signature verification | `src/app/api/webhooks/route.ts` (HMAC-SHA256 with shared secret per WebhookConfig) | Low |
| CSRF on state-changing routes | Cookie `SameSite=lax` + all mutations require POST + JWT check | `src/middleware.ts`, all API routes enforce `requireAuth` | Low — SameSite covers most cases; Bearer header covers the rest |
| Input injection (SQL/NoSQL) | Prisma + Supabase builder (parameterized) | `src/lib/db.ts`, no raw string concatenation | Low |
| XSS in patch code / chat messages | `src/lib/sanitize.ts` strips HTML, React escapes by default | `src/lib/sanitize.ts`, `react-markdown` with sanitization | Low — `dangerouslySetInnerHTML` is reviewer-enforced forbidden |
| File-path traversal in scans | (none — codebases are stored as text fields, not files) | `Codebase.sourceCode` is a TEXT column | Low by design |
| Migration tampering | Migrations are versioned + reviewed + signed by deploy captain | `supabase/migrations/NNNN_*.sql` | Low |
| Container image tampering | Multi-stage Docker build, pinned base images | `Dockerfile`, `mini-services/*/Dockerfile` | Medium — no cosign / sigstore signing yet |
| Dependency tampering (supply chain) | `bun.lock` pinned versions, `bun audit` in CI | `bun.lock`, CI workflow | Medium — no SBOM generation yet |
| Audit-log tampering | Append-only by design (no UPDATE route exists) | `AuditLog` model has no update API | Low — DB-level immutable would be stronger |
| Evidence vault tampering | `Evidence.isImmutable = true`, SHA-256 per artifact | `Evidence` model, `chainOfCustody` JSON | Low |

### 3.3 Repudiation

> *An attacker denies having performed an action.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| User denies account actions | Audit log on every state-changing operation (31 action types) | `AuditLog` model, `db.auditLog.create(...)` called from every mutating route | Low |
| User denies login | Login history derived from AuditLog (action `auth.*`, `user.*`) | `src/app/api/user/export-data/route.ts` returns `login_history` array | Low |
| Admin denies admin action | Every admin route uses `requireAdmin()` + writes to AuditLog with `actor = admin.email` | `src/lib/auth.ts` `requireAdmin`, `src/app/api/users/[id]/approve/route.ts`, `src/app/api/breach/notify/route.ts` | Low |
| Attacker denies exploit / scan activity | PipelineEvent, RedAgentEvent, ApiAccessLog, HoneypotHit all timestamped | `PipelineEvent`, `RedAgentEvent`, `ApiAccessLog`, `HoneypotHit` models | Low |
| Patch authorship dispute | Attestation chain (hash + prevHash) | `Attestation` model, `src/lib/sentinel/attestation.ts` | Low |
| DFIR evidence chain broken | `Evidence.chainOfCustody` JSON + `collectedBy` + `sha256` | `Evidence` model | Low |
| Logs deleted to cover tracks | AuditLog has no DELETE route; ApiAccessLog retention managed by `src/lib/siem/retention.ts` | `src/lib/siem/retention.ts` | Medium — DB-level WORM storage would be stronger |
| Time-travel attacks (clock skew) | Server timestamps via `default(now())` at DB layer | Prisma `@default(now())` | Low |

**Audit-log action types currently logged (31):**

```
auth.login, auth.logout, auth.signup, auth.2fa_enabled, auth.2fa_disabled,
user.account_deleted, user.approved, user.role_changed, user.invited,
patch.approved, patch.rejected, patch.rollback, patch.copilot_message,
patch.generate_pr, patch.run_exploit, patch.chat,
scan.started, scan.completed, scan.failed,
incident.created, incident.contained, incident.eradicated, incident.closed,
evidence.collected, evidence.viewed,
credential.created, credential.used, credential.rotated, credential.deleted,
breach.notified, policy.exception_granted
```

### 3.4 Information Disclosure

> *An attacker reads data they are not authorized to see.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| Credential leak at rest | AES-256-GCM encryption with per-record IV | `src/lib/sentinel/crypto.ts`, `Credential.secretCipher/Iv/Tag` columns | Low — master key in env only |
| Credential leak in transit | TLS 1.2+ via Caddy, HTTPS only | `Caddyfile`, `Caddyfile.production` | Low |
| Credential leak in logs | Sanitization layer strips secrets from log lines | `src/lib/sanitize.ts` | Low — review-enforced (no `console.log(token)`) |
| Cross-tenant data access (RBAC) | Ownership filtering on every list endpoint | `src/lib/ownership.ts`, `requireAuth` returns `user`, queries filter by `user.id` or `client.contactEmail` | Low |
| Error messages leak internals | Try/catch wraps every route; errors return generic message + log details | All `src/app/api/**/route.ts` | Low |
| Stack traces exposed to client | Next.js production mode strips them; Caddy adds `X-Content-Type-Options: nosniff` | `next.config.ts`, `Caddyfile` | Low |
| API key leak in client bundle | All secrets used server-side only; `NEXT_PUBLIC_*` prefix reserved for client-safe values | Code review checklist item | Low |
| JWT payload leak | JWT is HS256 (signed, not encrypted) — contains only userId/email/role/approved, no secrets | `src/lib/auth.ts` `JWTPayload` | Low by design |
| Database backup leak | Supabase backups encrypted at rest (Supabase-managed), access scoped to project owner | Supabase dashboard | Low |
| Personal data export leak | `/api/user/export-data` returns only the calling user's data; auth-required; `Cache-Control: no-store` | `src/app/api/user/export-data/route.ts` | Low |
| Audit-log leak (PII in details) | AuditLog.details is JSON-stringified; review-enforced to not include passwords/tokens | Code review checklist item | Medium — needs automated PII scanner |
| Cross-border transfer (DPDPA § 16) | Supabase region pinned (Mumbai `ap-south-1` recommended); Stripe / Z.AI flows audited | `docs/DATA-FLOW.md` § cross-border | Medium — needs Data Fiduciary notification before adding new foreign processors |
| Breach of unencrypted backups | (none — Supabase handles encryption) | — | Low |
| Side-channel (timing) on auth | bcrypt equal-time comparison, JWT verify uses constant-time compare | `bcryptjs`, `jsonwebtoken` | Low |

### 3.5 Denial of Service

> *An attacker degrades or denies service to legitimate users.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| HTTP flood | Per-IP rate limit (300/min general, 10/15min auth) | `src/middleware.ts`, `src/lib/rate-limit.ts` | Medium — in-memory store per Edge instance; for true distributed limiting, add Upstash Redis |
| Login brute force | 10 req / 15 min on `/api/auth/*` | `src/middleware.ts` `isAuthRoute` | Low |
| Expensive query DoS | Pagination on every list endpoint (`take` defaults to 50) | All `findMany` calls bounded by `take` | Low |
| Unbounded scan target DoS | Engine enforces max-URL-per-engagement + per-target concurrency | `mini-services/sentinel-engine/src/lib/sentinel/engine/pipeline.ts` | Medium |
| Large request body DoS | Next.js default body-size limit (1MB) + input length validation | `src/app/api/auth/signup/route.ts` (password ≤ 128, name ≤ 100, email ≤ 255) | Low |
| Regex DoS (ReDoS) | Input validation via Zod; regex used sparingly | All POST bodies validated | Low |
| Cache poisoning | (no shared cache layer; each request hits DB) | — | Low |
| Distributed volumetric | Caddy + CDN (Vercel edge for web prod) absorbs | Infra-layer | Medium — recommend Cloudflare in front of self-hosted prod |
| Resource exhaustion (DB connections) | Supabase pooler (PgBouncer) on production | `prisma/schema.production.prisma` `directUrl` | Low |
| Email bomb via breach-notify | Admin-only endpoint + recipient count cap (1000 default) | `src/app/api/breach/notify/route.ts`, `requireAdmin` | Low |
| Crawl of all codebases | Auth required + RBAC ownership filter | `requireAuth`, ownership filtering | Low |

### 3.6 Elevation of Privilege

> *An attacker gains capabilities they were not granted.*

| Threat | Control | Implementation | Residual risk |
| --- | --- | --- | --- |
| Non-admin accesses admin route | `requireAdmin()` middleware | `src/lib/auth.ts` `requireAdmin`, used in `/api/users/[id]/approve`, `/api/breach/notify`, etc. | Low |
| Unapproved user accesses protected route | `approved` flag in JWT + re-checked in middleware + re-checked in `requireAuth` (defense in depth) | `src/middleware.ts` lines 141-149, `src/lib/auth.ts` lines 119-134 | Low |
| Role escalation via direct DB write | DB has no admin role-escalation API; only the first-user flow sets `role=admin` | `src/app/api/auth/signup/route.ts` (isFirstUser → admin) | Low |
| Stolen token reused after role change | (none — JWT doesn't currently embed tokenVersion in the verify path) | `tokenVersion` column added in migration 0008; auth.ts to enforce in next iteration | Medium — recommend embedding `tokenVersion` in JWT + verifying in middleware |
| Privilege escalation via IDOR | Every mutating route validates ownership before write | `src/lib/ownership.ts`, code review checklist item | Low |
| Privilege escalation via mass assignment | Zod input validation + explicit `data: { ... }` whitelist on every Prisma update | All routes use `body.field` access, not `...body` | Low |
| Privilege escalation via parameter pollution | Zod rejects unknown keys (default behavior) | All POST bodies validated | Low |
| Privilege escalation via type confusion | TypeScript strict + runtime Zod validation | `tsconfig.json` `strict: true`, Zod everywhere | Low |
| Break-glass key used for routine admin | Key rotated after every use + audit-logged + alerts DPO | `docs/KEY-MANAGEMENT.md` § break-glass | Low |
| Webhook secret used to spoof events | HMAC verification + per-webhook secret + IP allowlist (recommended) | `src/app/api/webhooks/route.ts`, `WebhookConfig.secret` | Medium — IP allowlist not yet enforced |
| API key (SIEM ingestion) used to write events outside its scope | Key-scoped to ingestion only (`/api/siem/ingest`), no read access | `src/app/api/siem/ingest/route.ts` | Low |
| Client-portal token used to access admin features | Separate auth path (`/api/client-portal-auth`), separate role (`client`) | `src/app/api/client-portal-auth/route.ts` | Low |

---

## 4. Threat-Model Refresh Triggers

This document must be re-reviewed when any of the following happens:

| Trigger | Owner |
| --- | --- |
| New authentication mechanism added | Security lead |
| New third-party data processor added (DPDPA § 16) | DPO |
| New external API integration | Security lead |
| Architecture change (new microservice, new DB) | CTO + security lead |
| Annual review (calendar) | Security lead |
| After any Critical / High incident | DPO |
| After any external pentest report | Security lead |

---

## 5. Risk Acceptance Register

Risks accepted with documented owner + review date:

| ID | Risk | Severity | Owner | Accepted until | Justification |
| --- | --- | --- | --- | --- | --- |
| R-001 | JWT verify path does not yet enforce `tokenVersion` | Medium | Security lead | Next quarter | Anonymization + cookie clear + `approved=false` provide defense in depth; full enforcement is a Q3 roadmap item |
| R-002 | No HIBP password breach check at signup | Medium | Security lead | Next quarter | bcrypt(12) + per-IP rate limit mitigates; HIBP API integration planned |
| R-003 | In-memory rate-limit store per Edge instance (not distributed) | Medium | Infra lead | Next quarter | Acceptable for current load; Upstash Redis planned when traffic exceeds 1k req/min sustained |
| R-004 | No SBOM generation in CI | Low | Release captain | Next quarter | `bun audit` covers direct deps; SBOM (CycloneDX) planned |
| R-005 | No cosign / sigstore container signing | Low | Infra lead | Next year | Pinned base images + Trivy scan in CI mitigates |
| R-006 | No automated PII scanner for audit-log `details` JSON | Medium | Security lead | Next quarter | Review-enforced today; automated scanner planned |

---

## 6. References

| Doc | Path |
| --- | --- |
| Secure SDLC Policy | `docs/SECURE-SDLC.md` |
| Data Flow Diagram | `docs/DATA-FLOW.md` |
| Key Management | `docs/KEY-MANAGEMENT.md` |
| DPDPA Framework | `src/lib/compliance/dpdpa-framework.ts` |
| Auth utilities | `src/lib/auth.ts` |
| Crypto utilities | `src/lib/sentinel/crypto.ts` |
| Sanitization | `src/lib/sanitize.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| Ownership filter | `src/lib/ownership.ts` |
