# GuardianX Security Self-Assessment

**Document version:** 1.0
**Last reviewed:** 2024
**Owner:** GuardianX Security Engineering
**Scope:** GuardianX SaaS platform (Next.js 14 application + Supabase Postgres backend)
**Related docs:** [`BREAK-GLASS-RECOVERY.md`](./BREAK-GLASS-RECOVERY.md) · [`BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) · [`BUG-BOUNTY.md`](./BUG-BOUNTY.md) · [`DPDPA-COMPLIANCE.md`](./DPDPA-COMPLIANCE.md)

This self-assessment documents the 17 security hardening controls shipped to GuardianX production (`security-hardening-batch-FINAL`), maps each control to **SOC 2 (Trust Services Criteria)**, **ISO/IEC 27001:2022 (Annex A)**, and the **Digital Personal Data Protection Act 2023 (India, "DPDPA")**, and assigns a maturity score per area.

**Scoring legend**

| Score | Meaning |
|---|---|
| ✅ Implemented | Control is live in production, verified by an operator, with tests/observability. |
| 🟡 Partial | Control is live but missing tests, automation, or coverage gaps exist. |
| 🔲 Planned | Control is designed but not yet shipped to production. |

---

## 1. Access Control

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 1.1 | Role-Based Access Control (RBAC) | Two roles: `admin` and `viewer`. Middleware (`src/middleware.ts`) enforces `approved === true` on every `/api/*` request. `requireAuth` / `requireAdmin` in `src/lib/auth.ts` is the in-route second layer. Cascade ownership filtering on child entities (clients, scans, patches) via `@/lib/ownership`. | `src/lib/auth.ts`, `src/lib/ownership.ts`, `src/middleware.ts` | ✅ Implemented |
| 1.2 | Per-user session revocation | Every JWT embeds `tokenVersion`. `enforceSessionRevocation()` compares the token's version against `User.tokenVersion` in Postgres. `POST /api/auth/revoke-sessions` (admin or self) and `POST /api/auth/logout` bump the counter. | `src/lib/auth.ts`, `src/app/api/auth/revoke-sessions/route.ts` | ✅ Implemented |
| 1.3 | Two-Factor Authentication (TOTP) | Admin-enforced TOTP via `otplib`. Setup, verify, disable, and step-up login flows. 5-minute single-purpose step-up token (`purpose: "2fa-stepup"`) bridges the password → TOTP verify step. Admin banner nags until 2FA is enabled. | `src/lib/two-factor.ts`, `src/app/api/auth/2fa/*`, `src/components/sentinel/admin-2fa-banner.tsx` | ✅ Implemented |
| 1.4 | Admin approval workflow | New signups land in `approved = false` and are surfaced in the User Management panel. Only an admin can flip approval. Pre-approval tokens are rejected by middleware. | `src/app/api/users/[id]/approve/route.ts`, `src/middleware.ts` | ✅ Implemented |

**Score:** ✅ Implemented

---

## 2. Authentication

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 2.1 | JWT (HS256, 7-day expiry) | Issued by `/api/auth/login`. Edge middleware verifies signature + expiry + approval using Web Crypto (no Node libs in Edge runtime). | `src/lib/auth.ts`, `src/middleware.ts` | ✅ Implemented |
| 2.2 | JWT secret startup check | Production refuses to boot if `JWT_SECRET` is the default dev value or shorter than 32 chars. Prints `[FATAL]` and the operator must set the env var. | `src/lib/auth.ts` (lines 12–23) | ✅ Implemented |
| 2.3 | Password hashing (bcrypt, 12 rounds) | All new passwords hashed with bcrypt cost factor 12. Legacy SHA-256+salt hashes are auto-detected and still accepted for migration. | `src/lib/auth.ts` (`hashPassword`, `verifyPassword`) | ✅ Implemented |
| 2.4 | Password strength meter | 0–4 advisory score with actionable feedback. Common-pattern detection (qwerty, 123, sequential letters, "password"). Visual meter on signup + reset. | `src/lib/password-strength.ts`, `src/components/sentinel/password-strength-meter.tsx` | ✅ Implemented |
| 2.5 | Email verification on signup | `EmailVerification` table with single-use tokens + 15-min expiry. New `User.emailVerified` defaults to `false`; login is blocked until verified. | `supabase/migrations/0007_email_verification.sql`, `src/app/api/auth/verify-email/route.ts`, `src/app/verify-email/page.tsx` | ✅ Implemented |
| 2.6 | Password reset flow | `PasswordReset` token table, `forgot-password` + `reset-password` endpoints, hosted reset page. Rate-limited. | `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/reset-password/page.tsx` | ✅ Implemented |

**Score:** ✅ Implemented

---

## 3. Audit Logging

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 3.1 | Sensitive-action audit log | `auditLog()` helper inserts into `AuditLog(action, entity, actor, details)` for every client/scan/patch/credential/user/settings mutation. Failures are swallowed (never mask the primary op). Secrets are stripped before `details` is serialized. | `src/lib/audit.ts`, `src/app/api/audit-log/route.ts` | ✅ Implemented |
| 3.2 | Login history (per-user) | `LoginHistory` table records every login attempt (success/failure, IP, user-agent, failure reason). RLS enabled — users see only their own rows. Surfaced in Settings → Security. | `supabase/migrations/0009_login_history.sql`, `src/app/api/auth/login-history/route.ts` | ✅ Implemented |
| 3.3 | Email delivery log | `EmailLog` table records every outgoing email's outcome (sent/failed, messageId, template, error). Admin-only `GET /api/email-logs` panel. **Never** stores body or SMTP password. | `supabase/migrations/0010_email_log.sql`, `src/app/api/email-logs/route.ts` | ✅ Implemented |
| 3.4 | SHA-256 hash-chained attestation ledger | Findings + patch diffs are hash-chained so tampering breaks the chain. | `src/app/api/attestations/route.ts` | ✅ Implemented |
| 3.5 | Retention policy | Audit logs retained 365 days; login history 90 days; email logs 30 days. SIEM retention enforced via `src/lib/siem/retention.ts`. | `src/lib/siem/retention.ts`, `docs/BACKUP-RESTORE.md` §3 | 🟡 Partial (retention code shipped; automated purge cron is manual via `GET /api/siem/retention`) |
| 3.6 | Tamper-evident break-glass trail | Break-glass admin resets write an `AuditLog` row with `action: "admin.breakglass_reset"`. | `scripts/breakglass-admin-reset.ts`, `docs/BREAK-GLASS-RECOVERY.md` | ✅ Implemented |

**Score:** ✅ Implemented (retention automation 🟡)

---

## 4. Data Protection

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 4.1 | Encryption at rest (credentials) | Git tokens + third-party credentials encrypted with AES-256-GCM via `src/lib/sentinel/crypto.ts`. Ciphertext stored; plaintext **never** returned to the client (write-only fields). | `src/lib/sentinel/crypto.ts`, `src/app/api/credentials/route.ts` | ✅ Implemented |
| 4.2 | Encryption at rest (database) | Supabase Postgres — storage-level encryption managed by Supabase (AWS RDS under the hood, AES-256 at rest). | Supabase-managed | ✅ Implemented |
| 4.3 | Encryption in transit | TLS 1.3 enforced at the edge (Caddy / Vercel). HSTS header (`max-age=63072000; includeSubDomains; preload`). `upgrade-insecure-requests` in CSP. | `next.config.ts`, `Caddyfile`, `Caddyfile.production` | ✅ Implemented |
| 4.4 | Input sanitization | `sanitizeText` strips null bytes + C0 controls, trims, truncates. `sanitizeEmail` validates RFC 5322 subset, lowercases, 254-char cap. `sanitizeUrl` validates scheme + host. Applied at every mutation boundary. | `src/lib/sanitize.ts`, `tests/sanitize.test.ts` | ✅ Implemented |
| 4.5 | Output encoding | React JSX auto-escaping for all rendered user content. Email templates use an explicit `esc()` helper. | `src/lib/email-templates/*`, `src/lib/email.ts` | ✅ Implemented |
| 4.6 | Password hashing | bcrypt cost 12 (see §2.3). | `src/lib/auth.ts` | ✅ Implemented |
| 4.7 | Row-Level Security (RLS) | `LoginHistory` has RLS enabled with a `USING ("userId" = jwt.sub)` policy — the only table where anon/authenticated could plausibly reach it. All other tables use the `service_role` key (bypasses RLS) from the backend. | `supabase/migrations/0009_login_history.sql` | ✅ Implemented |

**Score:** ✅ Implemented

---

## 5. Network Security

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 5.1 | Content Security Policy (CSP) | Strict CSP in `next.config.ts`: `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`. `unsafe-eval` is dev-only. | `next.config.ts` | ✅ Implemented |
| 5.2 | Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security`, `X-DNS-Prefetch-Control: on`. | `next.config.ts` | ✅ Implemented |
| 5.3 | CSRF protection | Middleware checks `Origin` / `Referer` header on every state-changing method (POST/PUT/PATCH/DELETE) for cookie-authenticated requests. Bearer-token requests are inherently CSRF-immune. | `src/middleware.ts` (lines 117–147) | ✅ Implemented |
| 5.4 | Rate limiting — per IP + per endpoint | Per-IP, per-endpoint buckets for `/api/auth/*`: login 10/15min, signup 5/60min, forgot-password 5/60min, reset-password 10/15min, verify-email 10/15min. Generic API bucket: 300/min/IP. | `src/lib/rate-limit.ts`, `src/middleware.ts` | ✅ Implemented |
| 5.5 | Clickjacking defense | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`. | `next.config.ts` | ✅ Implemented |
| 5.6 | MIME-type sniffing defense | `X-Content-Type-Options: nosniff`. | `next.config.ts` | ✅ Implemented |
| 5.7 | Distributed rate limiting | In-memory `Map` per Edge instance — a determined attacker could exceed the nominal limit by a factor equal to the number of warm instances. Migration to Upstash Redis is documented as a known tradeoff. | `src/middleware.ts` (lines 37–48 comment) | 🟡 Partial (documented; Redis upgrade planned) |

**Score:** ✅ Implemented (distributed RL 🟡)

---

## 6. Incident Response

| # | Control | Implementation | Files | Status |
|---|---|---|---|---|
| 6.1 | Break-glass admin recovery | Pre-shared `BREAK_GLASS_KEY` + CLI script that resets an admin password without email. Writes an `AuditLog` entry on every use. | `scripts/breakglass-admin-reset.ts`, `docs/BREAK-GLASS-RECOVERY.md` | ✅ Implemented |
| 6.2 | Backup & restore runbook | Supabase managed backups + `pg_dump` + per-table REST export. Restore procedures for 4 disaster scenarios. Verification checklist. | `scripts/backup-export.ts`, `docs/BACKUP-RESTORE.md` | ✅ Implemented |
| 6.3 | Webhook notifications for security events | Outbound webhook dispatcher fires on credential access, critical finding, incident escalation. Signed payloads (HMAC-SHA256). Admin-configurable endpoints. | `src/lib/webhook-dispatcher.ts`, `src/app/api/webhooks/route.ts` | ✅ Implemented |
| 6.4 | Breach notification API | `POST /api/breach-notification` records a breach event with affected principal count, severity, and notification status — supports the DPDPA 72-hour notification clock. | `src/app/api/breach-notification/route.ts` | ✅ Implemented |
| 6.5 | Error tracking + structured logging | Sentry integration (client/server/edge configs) with source-map upload. Structured `pino`-style logs via `src/lib/logger.ts`. | `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/lib/logger.ts`, `src/lib/sentry.ts` | ✅ Implemented |
| 6.6 | Memory-pressure auto-mitigation | Polling intervals raised to 30s; `useVisiblePolling` pauses fetches when the tab is hidden — prevents OOM-kill cascading into apparent downtime. | `src/hooks/use-visible-polling.ts`, `docs/MEMORY-OPTIMIZATION.md` | ✅ Implemented |
| 6.7 | Incident auto-creation from alerts | High-severity SIEM alerts auto-create `Incident` records with timeline + containment actions. | `src/app/api/incidents/auto-create/route.ts` | ✅ Implemented |
| 6.8 | Postmortem template / playbook library | Playbook API + runbook for common incident types. | `src/app/api/playbooks/route.ts` | 🟡 Partial (playbook content seeded for top 5 incident types; expansion planned) |

**Score:** ✅ Implemented (playbook coverage 🟡)

---

## 7. Compliance Mapping

### 7.1 SOC 2 — Trust Services Criteria

| SOC 2 Criterion | GuardianX Control(s) | Status |
|---|---|---|
| **CC1 — Control Environment** | RBAC + approval workflow; admin 2FA enforcement; documented break-glass procedure. | ✅ |
| **CC2 — Communication & Information** | Audit log surfaces all sensitive actions to admins; webhook + email notifications on security events. | ✅ |
| **CC3 — Risk Assessment** | Threat intel feed + SIEM correlation; RedAgent VAPT scans customer codebases continuously. | ✅ |
| **CC4 — Monitoring Activities** | Login history, email delivery log, Sentry error tracking, SIEM stats, anomaly detection. | ✅ |
| **CC5 — Control Activities** | `requireAuth` / `requireAdmin` / `enforceSessionRevocation` layered across every mutating route; input sanitization at boundaries. | ✅ |
| **CC6 — Logical & Physical Access** | RBAC, per-user session revocation, 2FA, bcrypt, AES-256-GCM for credentials, RLS on LoginHistory. Physical access delegated to Supabase/AWS. | ✅ |
| **CC7 — System Operations** | Backup/restore runbook, memory auto-mitigation, deployment docs, Docker + Caddy production stack. | ✅ |
| **CC8 — Change Management** | Patch review workflow (`/api/patches/*`) with approve/reject/rollback; CI test suite (`tests/`). | ✅ |
| **CC9 — Risk Mitigation** | Bug bounty program (`docs/BUG-BOUNTY.md`); vendor risk via Supabase SOC 2 Type II attestation. | ✅ |
| **A1 — Availability** | Backup/restore runbook, Caddy reverse proxy with health checks, Supabase 99.9% SLA. | ✅ |
| **C1 — Confidentiality** | AES-256-GCM credentials, TLS 1.3, CSP, RLS. | ✅ |
| **PI1 — Processing Integrity** | SHA-256 hash-chained attestation ledger for findings + patches. | ✅ |
| **P1–P4 — Privacy (DPDPA-mapped below)** | See §7.3. | ✅ |

### 7.2 ISO/IEC 27001:2022 — Annex A

| Annex A Control | GuardianX Implementation | Status |
|---|---|---|
| **A.5 — Information security policies** | This document + `BUG-BOUNTY.md` + `DPDPA-COMPLIANCE.md` + `BACKUP-RESTORE.md` + `BREAK-GLASS-RECOVERY.md`. | ✅ |
| **A.6 — Organization of information security** | Single security-engineering owner; segregated admin/viewer roles; documented break-glass. | ✅ |
| **A.7 — Human resource security** | Admin approval workflow before access granted; 2FA enforced for admins; revocation on logout. | ✅ |
| **A.8 — Asset management** | All data lives in one Supabase Postgres instance (inventoried in `BACKUP-RESTORE.md` §1). No on-disk file storage. | ✅ |
| **A.8.24 — Use of cryptography** | AES-256-GCM at rest (credentials), bcrypt(12) for passwords, TLS 1.3 in transit, HMAC-SHA256 for webhooks, SHA-256 for attestations. | ✅ |
| **A.8.25 — Secure development life cycle** | Input sanitization library, ESLint + `tsc --noEmit` in CI, automated test suite (`tests/`), security-hardening batch tracked per item. | ✅ |
| **A.8.26 — Application security requirements** | OWASP Top 10 mapped (see `whitepaper/page.tsx`); bug bounty covers OWASP categories. | ✅ |
| **A.8.28 — Secure coding** | `sanitizeText`/`sanitizeEmail`/`sanitizeUrl` applied at mutation boundaries; React JSX auto-escaping. | ✅ |
| **A.8.29 — Security testing in development** | Vitest suite (`tests/rbac`, `tests/sanitize`, `tests/auth`, `tests/email-templates`, `tests/password-strength`). | ✅ |
| **A.8.30 — Outsourced development** | N/A — no outsourced development. | ✅ |
| **A.9 — Access control** | RBAC, session revocation, 2FA, RLS — see §1. | ✅ |
| **A.10 — Cryptography** | See A.8.24. | ✅ |
| **A.11 — Physical & environmental security** | Delegated to Supabase (AWS data centers, SOC 2 Type II). | ✅ (inherited) |
| **A.12 — Operations security** | Rate limiting, CSP, CSRF, backup/restore, memory auto-mitigation, error tracking. | ✅ |
| **A.13 — Communications security** | TLS 1.3, HSTS, CSP `connect-src` allow-list, signed webhooks. | ✅ |
| **A.14 — System acquisition, development & maintenance** | Patch review + rollback workflow; CI tests; security-hardening batches. | ✅ |
| **A.15 — Supplier relationships** | Supabase (SOC 2 Type II), Vercel (SOC 2 Type II), Sentry (SOC 2 Type II), Hostinger (SMTP). | ✅ |
| **A.16 — Information security incident management** | Incident auto-creation, breach-notification API, break-glass runbook, webhook alerts. | ✅ |
| **A.17 — Business continuity** | Backup/restore runbook with 4 DR scenarios; Supabase PITR; Caddy health checks. | ✅ |
| **A.18 — Compliance** | DPDPA checklist (`docs/DPDPA-COMPLIANCE.md`); this self-assessment; security.txt for external researchers. | ✅ |

### 7.3 DPDPA 2023 (India) — Section Mapping

| DPDPA Section / Obligation | GuardianX Implementation | Status |
|---|---|---|
| **§4 — Consent & lawful processing** | Cookie banner (`cookie-banner.tsx`); email verification on signup; explicit consent for credential storage. | ✅ |
| **§5 — Grounds for processing certain personal data without consent** | Audit logs + login history processed under legitimate interest for security; breach notification under §8(6). | ✅ |
| **§6 — Data principal rights** | Access (login history API), correction (settings), erasure (admin user-management), grievance contact (`privacy@guardianx.in`). See `docs/DPDPA-COMPLIANCE.md` §4. | ✅ |
| **§7 — Consent of children / persons with disabilities** | Service is B2B; no intentional processing of minors' data. Signup requires corporate email. | ✅ |
| **§8 — General obligations of Data Fiduciary** | Data minimization (only fields listed in `docs/DPDPA-COMPLIANCE.md` §2 collected); breach notification process; retention schedule; security safeguards (this doc). | ✅ |
| **§8(6) — Breach notification to Board & affected principals** | `POST /api/breach-notification`; 72-hour SLA documented in `docs/DPDPA-COMPLIANCE.md` §5. | ✅ |
| **§9 — Certain additional obligations of Significant Data Fiduciary** | N/A — GuardianX is not (yet) classified as an SDF. Re-evaluate at next DPDPA review. | 🔲 Planned |
| **§10 — Data Fiduciary not to process identifying data of children** | No children's data processed; corporate B2B product. | ✅ |
| **§11 — Rights of data principals** | See §6 above; rights enumerated in privacy policy. | ✅ |
| **§12 — Duties of data principal** | Terms of service (`/terms`) document user duties (no abuse, no unauthorized access). | ✅ |
| **§14 — Reference to voluntary undertaking** | Bug bounty safe-harbor (`docs/BUG-BOUNTY.md` §6). | ✅ |
| **§15 — Processing outside India** | Supabase region disclosed in `docs/DPDPA-COMPLIANCE.md` §7. Cross-border transfer governed by Supabase's standard contractual clauses. | ✅ |
| **§17 — Exemptions** | N/A. | — |
| **§20 — Power to issue codes of practice** | This self-assessment + DPDPA checklist adopted. | ✅ |
| **§25 — Penalties** | Mitigated by implemented controls; max penalty exposure tracked by legal. | ✅ (mitigation) |
| **§33 — Appeals** | Grievance officer contact in privacy policy + security.txt. | ✅ |

---

## 8. Summary scorecard

| Area | Score | Notes |
|---|---|---|
| Access Control | ✅ Implemented | RBAC + session revocation + 2FA + approval workflow. |
| Authentication | ✅ Implemented | JWT + bcrypt + email verification + password reset + strength meter. |
| Audit Logging | ✅ Implemented (retention 🟡) | AuditLog + LoginHistory + EmailLog + attestation ledger. Retention purge is manual. |
| Data Protection | ✅ Implemented | AES-256-GCM + TLS 1.3 + sanitization + RLS. |
| Network Security | ✅ Implemented (distributed RL 🟡) | CSP + CSRF + per-IP/per-endpoint rate limits + 7 security headers. |
| Incident Response | ✅ Implemented (playbooks 🟡) | Break-glass + backup/restore + webhooks + breach notification + Sentry. Playbook library expanding. |
| Compliance Mapping | ✅ Implemented | SOC 2 CC1–CC9 + A1/C1/PI1/P1–P4; ISO 27001 A.5–A.18; DPDPA §4–§33. |

**Overall posture:** ✅ All 17 hardening items shipped and operationally verified. Three items (audit-log retention automation, distributed rate limiting via Redis, full playbook library) are tracked as 🟡 partial — see "Next actions" below.

---

## 9. Next actions

| # | Gap | Priority | Owner | Target |
|---|---|---|---|---|
| 9.1 | Automate audit-log retention purge (cron for `GET /api/siem/retention`) | Medium | Sec Eng | Q1 |
| 9.2 | Migrate rate-limit store to Upstash Redis for true distributed limits | Medium | Sec Eng | Q1 |
| 9.3 | Expand incident playbook library beyond top-5 incident types | Low | Sec Eng | Q2 |
| 9.4 | Formal SOC 2 Type I external audit | Medium | Leadership | Q2 |
| 9.5 | ISO 27001:2022 Stage 1 readiness review | Low | Leadership | Q3 |
| 9.6 | DPDPA Significant Data Fiduciary re-evaluation (if user volume triggers) | Low | Legal | Annual |

---

## 10. Change history

| Date | Version | Author | Change |
|---|---|---|---|
| 2024 | 1.0 | Security Engineering | Initial self-assessment covering the 17 hardening items shipped in `security-hardening-batch-FINAL`. |
