# GuardianX — Data Flow Diagram

**Document ID:** DATA-FLOW
**Version:** 1.0
**Owner:** GuardianX Data Protection Officer
**Review cycle:** Quarterly, or upon adding any new data processor
**Aligned with:** DPDPA 2023 § 8(5) (Security safeguards), § 10 (Right to access), § 11 (Right to erasure), § 16 (Cross-border transfer)

---

## 1. Purpose

This document traces every flow of personal data through the GuardianX platform. For each flow, it documents:
- the data elements that move,
- the encryption protecting them in transit and at rest,
- the parties with access,
- the lawful basis (DPDPA § 5 / § 7),
- and the retention rule.

It is the source of truth for the Privacy Impact Assessment and the Right to Access export (`/api/user/export-data`).

---

## 2. Actors

| Actor | Type | Trust boundary |
| --- | --- | --- |
| **User** | Data Principal (the customer logging in) | External, browser |
| **Admin** | Data Fiduciary's employee | External, browser, role=admin |
| **Web App** | Next.js 16 | DMZ (public-facing, auth-gated) |
| **Sentinel Engine** | Bun microservice | Internal |
| **Recon Tools** | Bun + Python microservice | Internal, isolated |
| **Supabase (PostgreSQL)** | Database + Auth | External (Supabase cloud, region-locked) |
| **z-ai API** | AI inference provider | External (Z.AI cloud) |
| **SMTP (Hostinger)** | Email relay | External (Hostinger cloud) |
| **Stripe** | Payment processor | External (Stripe cloud) |
| **AuditLog** | Internal audit trail | Internal (Supabase table) |
| **Grievance Officer** | Human, DPO | Internal |

---

## 3. High-Level Diagram

```
  ┌──────────┐
  │   User   │
  │  Browser │
  └────┬─────┘
       │  HTTPS (TLS 1.2+, HSTS, CSP)
       ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                       Caddy (Reverse Proxy)                    │
  │   auto-HTTPS, rate-limit, X-Frame-Options, X-Content-Type       │
  └───────────────────────────────────────────────────────────────┘
       │
       ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                 GuardianX Web App (Next.js 16)                 │
  │   /api/auth/*         ──┐                                       │
  │   /api/codebases/*    ──┤  JWT-gated (Edge middleware)          │
  │   /api/scans/*        ──┤  + requireAuth / requireAdmin         │
  │   /api/patches/*      ──┤  + per-IP rate limit                  │
  │   /api/incidents/*   ──┤  + Zod input validation                │
  │   /api/user/export-data    │                                    │
  │   /api/auth/delete-account │                                    │
  │   /api/breach/notify   ─────┤  (admin-only)                      │
  └───┬───────────────┬────────┴──────────────┬──────────────┬─────┘
      │               │                       │              │
      │ Supabase      │ Sentinel Engine      │ SMTP         │ Stripe
      │ service-role  │ (HTTP, internal)     │ (TLS)        │ (TLS)
      ▼               ▼                       ▼              ▼
  ┌──────────┐  ┌──────────────────────┐  ┌──────────┐  ┌──────────┐
  │ Supabase │  │  Sentinel Engine      │  │ Hostinger│  │  Stripe  │
  │ Postgres │  │  (Bun + TS)           │  │   SMTP   │  │          │
  │          │  │   ├─ z-ai API (HTTPS) │  │          │  │          │
  │          │  │   └─ Recon Tools      │  └────┬─────┘  └────┬─────┘
  │          │  │      (Nmap/Nuclei/   │       │             │
  │          │  │       ffuf/sqlmap)    │       │             │
  │          │  └───────────┬───────────┘       │             │
  │          │              │ findings,         │             │
  │          │              │ patches, events   │             │
  │          │              ▼                   │             │
  │          │  ┌──────────────────────┐        │             │
  │          │  │  Supabase Postgres    │        │             │
  │          │  │  (same instance)     │        │             │
  │          │  └──────────────────────┘        │             │
  │          │                                  │             │
  │  AuditLog │                                  │             │
  │  (table)  │◀─────────────────────────────────┘             │
  │           │  (every state change writes here)               │
  └───────────┘                                                 │
       ▲                                                         │
       │  webhook (HMAC-signed)                                 │
       └─────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Flows

### Flow 1 — User → Web App (HTTPS)

| Property | Value |
| --- | --- |
| **Source** | User browser |
| **Destination** | Caddy reverse proxy → Next.js |
| **Data elements** | Email, password (only on `/api/auth/login` and `/api/auth/signup`), JWT cookie on every subsequent request, request bodies for scan/patch/incident operations |
| **Encryption (transit)** | TLS 1.2+ (Let's Encrypt cert via Caddy); HSTS preload; `X-Forwarded-Proto` enforced |
| **Encryption (at rest)** | N/A (transit only) |
| **Who has access** | User (their own browser); Caddy logs (IP + UA + status only, no body); Next.js runtime (full request) |
| **Lawful basis (DPDPA)** | § 6 (consent — given at signup) + § 7(c) (compliance with legal obligation) |
| **Retention** | Cookies: 7 days; Caddy access logs: 30 days; Next.js dev logs: ephemeral |
| **Cross-border** | User's country → Supabase region (recommend `ap-south-1` Mumbai for India users) |

### Flow 2 — Web App → Supabase (PostgreSQL)

| Property | Value |
| --- | --- |
| **Source** | Next.js API routes (server-side only) |
| **Destination** | Supabase REST API → PostgreSQL |
| **Data elements** | All entities: User, Client, Codebase, Scan, Patch, Finding, Attestation, AuditLog, Incident, Evidence, Credential (encrypted), WebhookConfig |
| **Encryption (transit)** | TLS 1.2+ (HTTPS to `*.supabase.co`) |
| **Encryption (at rest)** | Supabase-managed (PostgreSQL TDE + S3-level encryption for backups) |
| **Who has access** | Supabase service-role key holder (server env only); Supabase project owner (dashboard); no anon access to privileged tables |
| **Lawful basis** | § 5(b) (employment / service contract), § 7(a) (voluntary consent at signup) |
| **Retention** | Active records: until user requests erasure (DPDPA § 11); AuditLog: 7 years; Evidence: case-closed + 7 years; ApiAccessLog: 90 days; HoneypotHit: 30 days |
| **Cross-border** | Depends on Supabase region selection; recommend `ap-south-1` for DPDPA § 16 compliance |

### Flow 3 — Web App → Sentinel Engine (Internal HTTP)

| Property | Value |
| --- | --- |
| **Source** | Next.js API route (e.g. `/api/scans`, `/api/codebases`) |
| **Destination** | Sentinel Engine on `http://localhost:3003` (or Railway internal URL in prod) |
| **Data elements** | Codebase source code, scan instructions, target URLs, auth headers |
| **Encryption (transit)** | HTTP locally (loopback only); HTTPS via Caddy if engine is remote |
| **Encryption (at rest)** | Engine does not persist data — it streams results back to Supabase |
| **Who has access** | Engine service account (no shared secret today — recommend adding) |
| **Lawful basis** | § 5(b) (service performance) |
| **Retention** | Engine holds data in-memory for the duration of the scan only |
| **Cross-border** | Same region as web app (recommend co-located) |

### Flow 4 — Sentinel Engine → z-ai API (AI Analysis)

| Property | Value |
| --- | --- |
| **Source** | Sentinel Engine (`mini-services/sentinel-engine/src/lib/sentinel/engine/ai.ts`) |
| **Destination** | Z.AI cloud API over HTTPS |
| **Data elements** | Code snippets (max 4KB per call), vulnerability descriptions, remediation prompts. **No PII is sent** — code snippets are stripped of emails/passwords by `src/lib/sanitize.ts` before submission |
| **Encryption (transit)** | TLS 1.2+ |
| **Encryption (at rest)** | Z.AI's retention policy applies (see their DPA) |
| **Who has access** | Z.AI as a Data Processor; GuardianX is the Data Controller |
| **Lawful basis** | § 5(b) (service performance — the user has requested AI-assisted analysis); § 7(a) (consent — accepted in ToS) |
| **Retention** | Z.AI's API logs per their policy; GuardianX does not retain the AI's response beyond storing it in `Patch.aiExplanation` (a code/technical description, not PII) |
| **Cross-border** | Z.AI region — verify in Z.AI dashboard; if non-India, must be on DPDPA § 16 approved list or contractual safeguards (Standard Contractual Clauses) must be in place |

### Flow 5 — Sentinel Engine → Recon Tools (Nmap / Nuclei / ffuf / sqlmap)

| Property | Value |
| --- | --- |
| **Source** | Sentinel Engine (`mini-services/sentinel-engine/src/lib/sentinel/engine/recon-client.ts`) |
| **Destination** | Recon Tools microservice on `http://localhost:3005` |
| **Data elements** | Target URL, target scope, auth header (if provided), scan intensity |
| **Encryption (transit)** | HTTP locally (internal network) |
| **Encryption (at rest)** | None — tool runs in-memory, returns findings JSON |
| **Who has access** | Engine service account only |
| **Lawful basis** | § 5(b) (service performance) + § 7(d) (compliance with legal obligation — authorized pentest) |
| **Retention** | Tool holds target URL for the duration of the scan only |
| **Cross-border** | Same region as engine (internal network only — no cross-border transit) |

### Flow 6 — Engine → Supabase (Findings, Patches, Events)

| Property | Value |
| --- | --- |
| **Source** | Sentinel Engine (pipeline.ts, redagent-pipeline.ts) |
| **Destination** | Supabase REST API |
| **Data elements** | Scan results, detected findings, generated patches, attestation hashes, pipeline events |
| **Encryption (transit)** | TLS 1.2+ |
| **Encryption (at rest)** | Supabase-managed (PostgreSQL TDE) |
| **Who has access** | Same as Flow 2 (service-role key) |
| **Lawful basis** | § 5(b) |
| **Retention** | Same as Flow 2 |
| **Cross-border** | Same as Flow 2 |

### Flow 7 — Web App → SMTP (Hostinger) → User

| Property | Value |
| --- | --- |
| **Source** | `src/lib/email.ts` `sendEmail` / `sendBulkEmail` |
| **Destination** | `smtp.hostinger.com:465` → recipient's MX |
| **Data elements** | Recipient email, subject, plain-text body. **Triggering events:** account-deletion confirmation (`src/app/api/auth/delete-account/route.ts`), breach notification (`src/app/api/breach/notify/route.ts`), daily/weekly digest (`src/app/api/email-digest/route.ts`) |
| **Encryption (transit)** | SMTPS (TLS 1.2+ via port 465), AUTH PLAIN over TLS |
| **Encryption (at rest)** | Hostinger's mailserver retention applies (default 30 days for sent mail) |
| **Who has access** | Hostinger as a Data Processor; recipient (their inbox) |
| **Lawful basis** | § 5(b) (service performance — confirmation of action); § 8(6) (legal obligation — breach notification) |
| **Retention** | Hostinger mailserver logs: 90 days; GuardianX does not retain the email body beyond the AuditLog `details` summary |
| **Cross-border** | Hostinger region — verify in hPanel; if EU/US, ensure SCC in place |

### Flow 8 — Web App → Stripe → User (Billing)

| Property | Value |
| --- | --- |
| **Source** | Next.js API routes (`/api/billing/*` planned) |
| **Destination** | Stripe API over HTTPS; user redirected to Stripe Checkout |
| **Data elements** | Customer email, plan ID, payment amount; **no card numbers ever touch GuardianX** (Stripe Elements / Checkout handles PCI data) |
| **Encryption (transit)** | TLS 1.2+ |
| **Encryption (at rest)** | Stripe-managed (PCI-DSS Level 1) |
| **Who has access** | Stripe as a Data Processor; GuardianX receives only the customer email + subscription status via webhook |
| **Lawful basis** | § 5(b) (contract performance) + § 7(c) (compliance) |
| **Retention** | Stripe retains per their DPA; GuardianX stores `customer_id` + `subscription_status` only |
| **Cross-border** | Stripe region (US/EU/India depending on account); must be on DPDPA § 16 approved list or have SCC |
| **Webhook integrity** | HMAC-SHA256 signature verification on every webhook (Stripe-signature header) |

### Flow 9 — Admin → Web App → AuditLog (Every Action Logged)

| Property | Value |
| --- | --- |
| **Source** | Admin browser → Web App API route |
| **Destination** | `AuditLog` table in Supabase |
| **Data elements** | Action type (e.g. `user.approved`, `breach.notified`, `patch.approved`), entity ID, actor email, JSON details (with PII review-enforced scrubbed), timestamp |
| **Encryption (transit)** | TLS 1.2+ (HTTPS) |
| **Encryption (at rest)** | Supabase-managed |
| **Who has access** | Admin role only (via `/api/audit-log`, `/api/audit-export`); DPO; auditor (read-only export) |
| **Lawful basis** | § 7(d) (compliance with legal obligation) + § 31 (record-keeping for legal proceedings) |
| **Retention** | 7 years (standard compliance retention) |
| **Cross-border** | Same as Flow 2 |

### Flow 10 — User → Web App → Supabase (Account Deletion, DPDPA § 11)

| Property | Value |
| --- | --- |
| **Source** | Authenticated user → `/api/auth/delete-account` |
| **Destination** | Supabase (delete owned records + anonymize User row); SMTP (confirmation email) |
| **Data elements** | User's password (for verification — discarded after `verifyPassword`); user's original email (preserved only in AuditLog `actor` field, per DPDPA § 31) |
| **Encryption (transit)** | TLS 1.2+ (HTTPS for the API call); TLS 1.2+ (SMTPS for the email) |
| **Encryption (at rest)** | Anonymized user record: random bcrypt hash; original email gone from `User.email` |
| **Who has access** | Post-deletion: nobody (the row exists only to satisfy FK integrity on AuditLog rows) |
| **Lawful basis** | § 11 (Data Principal's right to erasure — user-initiated) |
| **Retention** | Anonymized stub: retained indefinitely (no PII); AuditLog entries: 7 years |
| **Cross-border** | Same as Flow 2 |

### Flow 11 — User → Web App → Supabase (Data Export, DPDPA § 10)

| Property | Value |
| --- | --- |
| **Source** | Authenticated user → `/api/user/export-data` |
| **Destination** | User browser (downloadable JSON) |
| **Data elements** | Profile (password redacted), clients, codebases, scans, patches, findings, engagements, targets, attestations, audit_logs, login_history |
| **Encryption (transit)** | TLS 1.2+ (HTTPS) |
| **Encryption (at rest)** | N/A (downloaded once, not stored by GuardianX after delivery) |
| **Who has access** | The user (their own data only); `Cache-Control: no-store` prevents intermediate caching |
| **Lawful basis** | § 10 (Right to Access Information) |
| **Retention** | N/A — data is in the user's hands after download |
| **Cross-border** | Same as Flow 1 (depends on user's location) |

### Flow 12 — Admin → Web App → All Users (Breach Notification, DPDPA § 8(6))

| Property | Value |
| --- | --- |
| **Source** | Admin → `/api/breach/notify` |
| **Destination** | Incident record (Supabase); all affected users (via SMTP) |
| **Data elements** | Breach title, description, affected-data summary, severity, recipient emails |
| **Encryption (transit)** | TLS 1.2+ (HTTPS to API); TLS 1.2+ (SMTPS to recipients) |
| **Encryption (at rest)** | Incident record: Supabase-managed; AuditLog entry: Supabase-managed |
| **Who has access** | Admin role; DPO; recipients (their inboxes) |
| **Lawful basis** | § 8(6) (legal obligation to notify the Board and affected Data Principals of personal-data breaches) |
| **Retention** | Incident record: case-closed + 7 years; AuditLog entry: 7 years; recipient mailboxes: per their provider |
| **Cross-border** | Same as Flow 7 for recipients |

---

## 5. Data Retention Summary

| Data category | Retention | Source of rule |
| --- | --- | --- |
| User profile | Until erasure request (DPDPA § 11) | DPDPA § 10 |
| Client records | Until erasure request | DPDPA § 10 |
| Codebases / Scans / Patches | Until erasure request | DPDPA § 10 |
| Findings | Until erasure request | DPDPA § 10 |
| AuditLog | 7 years | DPDPA § 31 (legal proceedings) + § 7(d) (compliance) |
| Evidence (immutable) | Case-closed + 7 years | DFIR best practice |
| ApiAccessLog | 90 days | Operational need (rate-limit tuning) |
| HoneypotHit | 30 days | Operational need (attack-pattern analysis) |
| Anonymized user stub (post-erasure) | Indefinitely (no PII) | DPDPA § 31 (FK integrity for AuditLog) |
| Email bodies (SMTP logs) | 90 days (Hostinger) | Hostinger ToS |
| Caddy access logs | 30 days | Operational need |

---

## 6. Cross-Border Transfer Register (DPDPA § 16)

| Processor | Data transferred | Region | Lawful basis | Safeguards |
| --- | --- | --- | --- | --- |
| Supabase | All personal data | `ap-south-1` (Mumbai) — recommended | § 5(b) | Supabase DPA + region pinning |
| Z.AI | Code snippets (no PII) | Z.AI region (verify) | § 5(b) | Z.AI DPA (verify); Standard Contractual Clauses if non-India |
| Hostinger SMTP | Email + recipient address | Hostinger region (verify) | § 5(b) + § 8(6) | Hostinger DPA (verify); SCC if non-India |
| Stripe | Customer email + plan | Stripe region | § 5(b) | Stripe DPA (PCI-DSS Level 1) |
| Caddy / Vercel | IP + UA + status (no PII) | Edge CDN region | § 5(b) | Vercel DPA; no PII transferred |

---

## 7. References

| Doc | Path |
| --- | --- |
| Secure SDLC Policy | `docs/SECURE-SDLC.md` |
| Threat Model (STRIDE) | `docs/THREAT-MODEL.md` |
| Key Management | `docs/KEY-MANAGEMENT.md` |
| Production Deployment | `docs/PRODUCTION-DEPLOYMENT.md` |
| Privacy Policy (public) | `src/app/privacy/page.tsx` |
| Data Privacy API | `src/app/api/data-privacy/route.ts` |
| Data Export API (DPDPA § 10) | `src/app/api/user/export-data/route.ts` |
| Account Deletion API (DPDPA § 11) | `src/app/api/auth/delete-account/route.ts` |
| Breach Notification API (DPDPA § 8(6)) | `src/app/api/breach/notify/route.ts` |
