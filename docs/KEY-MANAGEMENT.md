# GuardianX — Cryptographic Key Management Policy

**Document ID:** KEY-MANAGEMENT
**Version:** 1.0
**Owner:** GuardianX Security Engineering + Data Protection Officer
**Review cycle:** Quarterly (per-key rotation schedule below)
**Aligned with:** ISO/IEC 27001 A.10 (Cryptography), SOC 2 CC6.1 (Logical access), DPDPA 2023 § 8(5) (Security safeguards), NIST SP 800-57

---

## 1. Purpose

This document enumerates every cryptographic key used by GuardianX, how it is generated, where it is stored, when it is rotated, and what happens if it is compromised. It exists to ensure that:

- No key is ever hard-coded in source.
- Every key has a named owner.
- Every key has a documented rotation schedule.
- Compromise response is a runbook, not an improvisation.

---

## 2. Key Inventory

### 2.1 Application Secrets

| Key | Purpose | Algorithm | Length | Storage | Rotation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| `JWT_SECRET` | Signs + verifies JWT session tokens | HS256 | 256 bits (64 hex chars) | Env var (server-only, never in client bundle) | Annually, or immediately on compromise | Security lead |
| `BREAK_GLASS_KEY` | Admin recovery when normal auth is locked out (e.g. after a mass-deletion event) | SHA-256 (HMAC-style comparison) | 256 bits (64 hex chars) | Env var (server-only); also stored in sealed envelope in DPO's physical safe | After every use (zero-tolerance) | DPO |
| `SENTINEL_ENC_KEY` | Master key for AES-256-GCM encryption of `Credential.secretCipher` at rest | AES-256-GCM | 256 bits (base64-encoded 32 bytes) | Env var (server-only) | Quarterly | Security lead |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses Row-Level Security on Supabase for server-side DB access | JWT (RS256, Supabase-issued) | ~2048 bits RSA-backed | Env var (server-only) | Via Supabase dashboard, every 6 months | Infra lead |
| `SUPABASE_ANON_KEY` | Public-readonly key for client-side Supabase calls | JWT (RS256, Supabase-issued) | ~2048 bits RSA-backed | Env var (NEXT_PUBLIC_*, OK to bundle in client) | Via Supabase dashboard, annually | Infra lead |
| `SMTP_PASS` | Password for `hello@guardianx.in` mailbox on Hostinger | Plaintext (sent over TLS) | n/a | Env var (server-only) | Via Hostinger hPanel, every 6 months | DPO |
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls (charges, refunds) | Bearer token | ~32 chars | Env var (server-only) | Via Stripe dashboard, annually | Finance lead |
| `STRIPE_WEBHOOK_SECRET` | Verifies HMAC signature on incoming Stripe webhooks | HMAC-SHA256 | ~32 chars | Env var (server-only) | Via Stripe dashboard, annually | Finance lead |
| `ZAI_API_TOKEN` | Authenticates Sentinel Engine calls to Z.AI inference API | Bearer token | ~64 chars | Env var (engine-only) | Via Z.AI dashboard, every 6 months | AI lead |
| `WEBHOOK_SECRET_<id>` | Per-webhook HMAC signing secret (one per `WebhookConfig`) | HMAC-SHA256 | 64 hex chars | DB column `WebhookConfig.secret` (encrypted via `SENTINEL_ENC_KEY`) | Per-customer request or annually | Security lead |

### 2.2 Per-Record Cryptographic Material

| Material | Purpose | Algorithm | Storage | Rotation |
| --- | --- | --- | --- | --- |
| Per-credential IV | Nonce for AES-256-GCM encryption of `Credential.secretCipher` | 96-bit random | DB column `Credential.secretIv` (per-record) | Per write (regenerated on every encrypt) |
| Per-credential auth tag | GCM authentication tag for tamper detection | 128-bit | DB column `Credential.secretTag` | Per write |
| Per-attestation hash | SHA-256 of patch contents, chained via `prevHash` | SHA-256 | DB column `Attestation.hash` | Immutable (chain is append-only) |
| Per-evidence SHA-256 | Hash of evidence file for chain-of-custody | SHA-256 | DB column `Evidence.sha256` | Immutable |
| Per-user bcrypt salt | Salt for password hashing | 128-bit (bcrypt internal) | Embedded in bcrypt hash | Per password change |
| Per-user 2FA secret | TOTP shared secret | Base32, 160-bit | DB column `User.twofaSecret` (encrypted via `SENTINEL_ENC_KEY` — TODO) | On 2FA reset |
| Per-user backup codes | 10 single-use 8-digit codes | Bcrypt(12) | DB column `User.backupCodes` (JSON array of bcrypt hashes) | On 2FA reset or after 5 used |

### 2.3 TLS Certificates

| Cert | Purpose | Issuer | Rotation |
| --- | --- | --- | --- |
| Web app HTTPS | `*.guardianx.cloud` | Let's Encrypt (via Caddy auto-HTTPS) | Every 90 days (automatic) |
| Engine HTTPS (if exposed) | `engine.guardianx.cloud` | Let's Encrypt (via Caddy) | Every 90 days (automatic) |
| Stripe webhook | N/A (Stripe terminates TLS) | Stripe-managed | Stripe-managed |
| Supabase TLS | N/A (Supabase terminates TLS) | Supabase-managed | Supabase-managed |
| SMTP TLS | TLS for SMTPS submission | Hostinger-managed | Hostinger-managed |

---

## 3. Key Generation

All keys are generated with one of the following commands. Never use `Math.random()`, never use a memorable string, never reuse a key across environments.

```bash
# JWT_SECRET, BREAK_GLASS_KEY, WEBHOOK_SECRET, ZAI_API_TOKEN, STRIPE_WEBHOOK_SECRET
openssl rand -hex 32

# SENTINEL_ENC_KEY (must decode to exactly 32 bytes for AES-256-GCM)
openssl rand -base64 32

# Per-record IV (used internally by src/lib/sentinel/crypto.ts)
# 12-byte IV (96 bits) per NIST SP 800-38D
openssl rand -base64 12

# Per-record auth tag is produced automatically by GCM, do not generate manually.

# TOTP 2FA secret (base32, 160 bits = 32 chars)
openssl rand -base32 20

# Backup codes (10 × 8 digits)
openssl rand -hex 4   # repeat 10 times, format as NNNN-NNNN

# bcrypt salt (handled automatically by bcryptjs, no manual generation)
```

Verification — confirm length:

```bash
echo -n "5fd8918bde57ff29249e8d90052006f80b75f1a32e6eeee5b51d9572d757da8f" | wc -c   # → 64 (256-bit hex)
echo -n "$(openssl rand -base64 32)" | base64 -d | wc -c                              # → 32 bytes
```

---

## 4. Key Storage

| Storage medium | Approved for | Forbidden for |
| --- | --- | --- |
| Environment variable (server-only, set via `start.sh` or systemd `EnvironmentFile=`) | `JWT_SECRET`, `BREAK_GLASS_KEY`, `SENTINEL_ENC_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `STRIPE_SECRET_KEY`, `ZAI_API_TOKEN` | Anything that needs to reach the browser bundle |
| `NEXT_PUBLIC_*` env var (bundled into client JS) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ENGINE_URL` (if needed) | Any secret, key, password, token |
| Database column (encrypted via `SENTINEL_ENC_KEY`) | Per-credential secrets, per-webhook HMAC secrets, per-user 2FA secrets (after TODO completes) | Plaintext secrets of any kind |
| Database column (bcrypt-hashed) | User passwords, 2FA backup codes | Plaintext passwords |
| Database column (plaintext, but not actually secret) | Audit log `details` (PII-scrubbed), incident metadata | Anything that would let an attacker authenticate |
| Sealed envelope in DPO's physical safe | `BREAK_GLASS_KEY` (offline copy), printed env-file backup | Any key with frequent access needs |
| Source code (`src/**`) | **NOTHING** — no keys of any kind, ever | All keys |
| Commit history | **NOTHING** — even if a key is rotated, the historical commit is a leak | All keys |
| CI logs | Public keys only (no secrets) | All secret keys |
| Docker image layers | Public keys only | All secret keys |

**Verification commands:**

```bash
# Confirm no secret-looking strings are committed to source
gitleaks detect --source . --no-git --verbose

# Confirm no env vars are accidentally exposed to the client bundle
grep -r "process.env.NEXT_PUBLIC_" src/ | grep -v "NEXT_PUBLIC_SUPABASE" | grep -v "NEXT_PUBLIC_ENGINE_URL"

# Confirm the .env files are gitignored
git check-ignore -v .env .env.local .env.production
```

---

## 5. Rotation Schedule

| Key | Frequency | Trigger | Mechanism |
| --- | --- | --- | --- |
| `JWT_SECRET` | Annually | Calendar (Q1 review) | Generate new secret → update env → restart web app → all existing tokens become invalid (users re-login). Coordinate during low-traffic window. |
| `BREAK_GLASS_KEY` | After every use | AuditLog entry `break_glass.used` | Generate new secret → update env → restart web app → log to AuditLog `break_glass.rotated`. Old key is destroyed. |
| `SENTINEL_ENC_KEY` | Quarterly | Calendar (end of each quarter) | Generate new key → re-encrypt every row in `Credential` table (migration script reads with old key, writes with new key) → update env → restart. Brief downtime required. |
| `SUPABASE_SERVICE_ROLE_KEY` | Every 6 months | Calendar | Supabase dashboard → Settings → API → Rotate service_role key → update env → restart web app + engine. |
| `SUPABASE_ANON_KEY` | Annually | Calendar (with `JWT_SECRET`) | Same as service_role, but anon key rotation is non-disruptive (clients re-fetch on next page load). |
| `SMTP_PASS` | Every 6 months | Calendar | Hostinger hPanel → Email Accounts → Change password → update env → restart. |
| `STRIPE_SECRET_KEY` | Annually | Calendar | Stripe dashboard → Developers → API keys → Roll secret key → update env → restart. Old key stops working immediately. |
| `STRIPE_WEBHOOK_SECRET` | Annually (with secret key) | Calendar | Stripe dashboard → Developers → Webhooks → select endpoint → Update secret → update env → restart. |
| `ZAI_API_TOKEN` | Every 6 months | Calendar | Z.AI dashboard → API tokens → Rotate → update env → restart engine. |
| Per-webhook `WEBHOOK_SECRET_<id>` | Per customer request, or annually | Customer request or calendar | `/api/webhooks` PUT endpoint generates new secret + notifies the customer to update their receiver. Old HMACs fail until updated. |
| Per-user bcrypt salt | On every password change | User action | Automatic (bcrypt). |
| Per-user 2FA secret | On 2FA reset | User action | `/api/2fa` DELETE + POST flow. |
| Per-user backup codes | On 2FA reset, or after 5 of 10 used | User action | Automatic. |
| TLS certificates (Let's Encrypt) | Every 90 days | Automatic (Caddy) | Caddy auto-renews 30 days before expiry. |
| Per-record AES IV + tag | On every encrypt/decrypt cycle | Per write | Automatic (`src/lib/sentinel/crypto.ts`). |

---

## 6. Key Compromise Procedure

> Suspected compromise = a key may have been exposed to an unauthorized party.
> Confirmed compromise = we have evidence the key was used by an unauthorized party.

### 6.1 Detect

| Signal | Severity | Action |
| --- | --- | --- |
| Secret in git history (gitleaks alert) | High | Treat as confirmed — rotate immediately |
| Secret in CI log | Medium | Investigate; rotate within 24h |
| Secret in error message to user | High | Treat as confirmed — rotate within 1h |
| Anomalous API usage pattern (e.g. Stripe charges from unknown IP) | Critical | Treat as confirmed — rotate immediately + activate incident response |
| Lost laptop with env file | Critical | Treat as confirmed — rotate all keys immediately |
| Lost sealed envelope (BREAK_GLASS_KEY) | High | Treat as confirmed — rotate BREAK_GLASS_KEY + replace envelope |

### 6.2 Contain (within 1 hour of confirmation)

1. Rotate the compromised key per § 5 mechanism.
2. Update env files on all servers (`web`, `engine`, `recon-tools`).
3. Restart all services.
4. For `JWT_SECRET`: all user sessions are now invalid — users will be force-logged-out. Send a notification email via `/api/breach/notify` if the compromise exposed personal data (DPDPA § 8(6)).
5. For `SENTINEL_ENC_KEY`: begin the re-encryption migration immediately. Until complete, all credential reads + writes will fail.
6. For `SUPABASE_SERVICE_ROLE_KEY`: check Supabase logs for unauthorized queries since the suspected leak timestamp.
7. For `STRIPE_SECRET_KEY`: review Stripe dashboard for unauthorized charges / refunds since the suspected leak timestamp.

### 6.3 Eradicate

1. Identify the root cause of the leak (commit, log, laptop, etc.) and close it.
2. For git-history leaks: rewrite history with `git filter-repo` and force-push, then notify all contributors to re-clone. Add the leaked key to a revocation list so it can never be re-used.
3. For laptop leaks: remotely wipe the laptop (MDM) and revoke any certificates it held.
4. For employee departure: revoke all access keys held by the employee.

### 6.4 Notify (DPDPA § 8(6) — within 72 hours)

If the compromise **may have resulted in a personal data breach**, notify affected users via `/api/breach/notify`:

- `title`: "Cryptographic Key Compromise"
- `description`: what happened, when, what data may have been exposed
- `affectedData`: enumerate the specific data categories (e.g. "email addresses, hashed passwords, scan history")
- `severity`: per incident-response severity scale

Also notify the **Data Protection Board of India** by the DPO via the formal mechanism described in DPDPA § 8(6)(a).

### 6.5 Recover

1. Confirm the new key is in use (test auth, test credential encrypt/decrypt, test Stripe charge).
2. Audit-log `key.rotated` with action details.
3. Run a fresh pentest on the affected surface.
4. Close the Incident.

### 6.6 Post-mortem (within 7 days)

- Blameless review of how the leak happened.
- Update this document and the threat model if a new vector was discovered.
- Add a regression test or CI check if the leak could have been prevented by automation.

---

## 7. Break-Glass Procedure

The `BREAK_GLASS_KEY` is the **last-resort** admin recovery mechanism. It is used when:

- The admin has lost access to their TOTP device + backup codes.
- The admin's email is no longer accessible (and therefore cannot receive a password-reset email).
- A mass-deletion event has locked out all admins.

### 7.1 Usage

1. The DPO retrieves the sealed envelope from the physical safe.
2. The DPO (or a delegated senior engineer) presents the key in a request to `POST /api/auth/break-glass` with the key in the `Authorization: BreakGlass <key>` header. (Route is planned, not yet implemented.)
3. The endpoint issues a temporary admin JWT valid for 30 minutes.
4. Every action taken during the break-glass window is audit-logged with `actor = "break-glass:<dpo-name>"`.
5. On expiry, the key is rotated (per § 5) and a new sealed envelope is created.

### 7.2 Audit Trail

| Field | Value |
| --- | --- |
| `AuditLog.action` | `break_glass.used` |
| `AuditLog.actor` | `break-glass:<dpo-name>` |
| `AuditLog.entity` | user-id being recovered |
| `AuditLog.details` | `{ reason, ip, userAgent, rotatedAt, newEnvelopeId }` |

### 7.3 Review

Every break-glass use is reviewed by the CTO within 24 hours. Misuse (e.g. using it for routine admin work) is a policy violation.

---

## 8. Compliance Evidence

For auditors (ISO 27001, SOC 2, DPDPA), the following artifacts serve as evidence that this policy is followed:

| Evidence | Source |
| --- | --- |
| Key inventory (this document) | `docs/KEY-MANAGEMENT.md` |
| Rotation log | `AuditLog` table, filtered by `action IN ('key.rotated', 'break_glass.used', 'break_glass.rotated')` — exported via `/api/audit-export` |
| Secret-scan report | `gitleaks` CI output (per release) |
| Container-scan report | `trivy` CI output (per release) |
| Dependency audit | `bun audit` + `pip-audit` CI output (per release) |
| TLS cert expiry monitor | Caddy admin API or external uptime monitor (e.g. UptimeRobot) |
| Penetration test report | Annual external assessment |

---

## 9. References

| Doc | Path |
| --- | --- |
| Secure SDLC Policy | `docs/SECURE-SDLC.md` |
| Threat Model (STRIDE) | `docs/THREAT-MODEL.md` |
| Data Flow Diagram | `docs/DATA-FLOW.md` |
| Production Deployment | `docs/PRODUCTION-DEPLOYMENT.md` |
| Crypto utilities (AES-256-GCM) | `src/lib/sentinel/crypto.ts` |
| Auth utilities (bcrypt, JWT) | `src/lib/auth.ts` |
| 2FA utilities (TOTP) | `src/lib/two-factor.ts` |
| Webhook HMAC verification | `src/app/api/webhooks/route.ts` |
| Stripe webhook verification | (planned) `src/app/api/billing/webhook/route.ts` |
| Migration adding `tokenVersion` (session revocation) | `supabase/migrations/0008_token_version.sql` |
