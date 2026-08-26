# GuardianX Knowledge Base

Public knowledge base at `/docs`. This file is the source of truth for article
outlines + content guidelines — the rendered page (`src/app/docs/page.tsx`)
mirrors the structure below. When you add or update an article, update BOTH
this file and the `CATEGORIES` constant in the page.

> **Task #10-customer-success** — built alongside the in-app support chat
> (`src/components/sentinel/support-chat.tsx`), status page (`/status`), demo
> environment (`/demo`), and feature-request board (`/feature-requests`).

## Structure

- **6 categories**, each with **3-5 articles** (current total: 27 articles).
- Each article has: `slug` (URL-safe id), `title`, `summary` (1-line TL;DR),
  `body` (2-4 sentences), and optional `keywords` (used by the client-side
  search filter).
- The page renders a **client-side search bar** that matches against the
  title + summary + body + keywords. No server-side index needed at this
  scale (<100 articles).
- The page also has **category filter chips** and links to `/api-doc`
  (interactive Swagger UI), `/contact` (support form), and `/status`
  (system health).

## Content guidelines

1. **Voice**: second-person ("you"), present tense, terse. Imagine you're
   pair-programming with a senior engineer over Slack — short sentences,
   no marketing fluff.
2. **Length**: summary ≤ 80 chars; body ≤ 500 chars. If an article needs
   more, split it into a parent + child articles, or move the deep-dive to
   a dedicated MDX page under `/docs/[category]/[slug]`.
3. **Code samples**: inline `code` for short identifiers, fenced blocks for
   multi-line. Keep samples runnable — paste-then-run.
4. **Cross-references**: link to other articles by slug (e.g., "See the
   [adversarial-patching](#adversarial-patching) article"). Link to API docs
   as `/api-doc`, internal pages as `/{path}`, external as full URLs.
5. **Keywords**: 3-6 per article. Include synonyms a user might search
   ("signup" vs "sign up", "rate limit" vs "throttle"). Lowercase.
6. **Tone on errors**: be specific. "Why did my scan fail?" lists the 4 most
   common causes with the fix for each — not "check the logs and retry".
7. **Compliance claims**: only state what GuardianX actually does. Don't
   claim certification we don't have; describe the control mapping the
   Compliance tab performs.
8. **Update cadence**: review quarterly. The `last-reviewed` field is
   intentionally omitted from the public schema to avoid stale-date noise;
   track review dates in this file's changelog below.

## Categories + article outlines

### 1. Getting Started (4 articles)

- **create-account** — Create your GuardianX account
  - Signup flow, email verification, admin approval, first-user-becomes-admin rule.
- **first-scan** — Run your first SAST scan
  - Add codebase → Start Scan → pipeline stages → expected duration.
- **console-tour** — Tour of the console
  - The 8 main tabs (Dashboard, Clients, Pipelines, Codebases, Patches,
    RedAgent, Compliance, DFIR) + the Help button guided tour.
- **roles-permissions** — Roles & permissions
  - Admin vs Viewer capabilities; approval workflow; ownership model.

### 2. Scanning & VAPT (4 articles)

- **sast-vs-dast** — SAST vs DAST — when to use each
  - Static (source code) vs dynamic (live HTTP) — strengths, weaknesses, coverage.
- **full-vapt** — Run a full VAPT in one click
  - URL → recon → crawl → SAST → DAST → secret scan → PDF report. ~5 min.
- **interpreting-findings** — Interpreting finding severities
  - Critical / High / Medium / Low definitions, CVSS, confidence score.
- **secret-scanning** — Secret scanning (audit-scraper)
  - 40+ credential patterns, file:line attribution, rotate-and-remove remediation.

### 3. Patch Management (4 articles)

- **patch-lifecycle** — The patch lifecycle
  - Generated → sandbox-tested → adversarial → pending → approved/rejected.
- **reviewing-patches** — Reviewing a patch
  - Diff view, AI reasoning, sandbox logs, chat panel, approve/reject/rollback.
- **adversarial-patching** — Adversarial patching explained
  - 5-round red-team/blue-team loop, won/lost indicator, what it means for confidence.
- **rollback** — Rolling back a patch
  - Revert + auto-incident + POST /api/patches/[id]/rollback for CI/CD.

### 4. Compliance (4 articles)

- **frameworks-supported** — Compliance frameworks supported
  - DPDPA, GDPR, ISO 27001, SOC 2, PCI-DSS, NIST CSF. Per-framework posture.
- **dpdpa-2023** — DPDPA 2023 — what to know
  - India's DPDP Act, Section 8(5)/8(6) mapping, 72h breach window.
- **attestations** — Cryptographic attestations
  - SHA-256 hash chain on every approved patch, tamper-evident, exportable.
- **audit-export** — Exporting audit logs
  - CSV / JSON, time-range, paginated, SIEM ingestion notes.

### 5. API Integration (5 articles)

- **authentication** — Authenticating with the API
  - JWT, Bearer header, cookie, 7-day expiry, revocation via tokenVersion bump.
- **rate-limits** — Rate limits
  - 300/min general, 10-20/15min auth, 5/day demo, 429 headers, escalation path.
- **webhooks** — Configuring webhooks
  - Event types, HMAC-SHA256 signature, retry policy, secret rotation.
- **ci-cd** — CI/CD integration
  - POST /api/ci-cd/scan, severity threshold, GitHub Actions example.
- **openapi-spec** — Browsing the OpenAPI spec
  - /api-doc Swagger UI, /api/openapi.json raw spec, Postman import.

### 6. Troubleshooting (5 articles)

- **pending-approval** — Account stuck on 'pending approval'
  - Why, escalation path, first-user-becomes-admin rule reminder.
- **scan-failures** — Why did my scan fail?
  - 4 common causes: size, language, sandbox timeout, DB unreachable.
- **email-not-sending** — Email delivery issues
  - SMTP config, test email, Email Log, port 587 + STARTTLS guidance.
- **db-init** — Database not initialized
  - Run /supabase/migrations/0001_init.sql, then POST /api/db-init.
- **contact-support** — How to contact support
  - In-app chat (24h SLA), email hello@guardianx.in (urgent), /status, admin priority.

## How to add a new article

1. Pick the right category (or create a new one — update `CATEGORIES` in
   `src/app/docs/page.tsx` AND add an outline section here).
2. Add the article object to the category's `articles` array in the page
   component. Use a kebab-case `slug`, a ≤80-char `title`, a ≤80-char
   `summary`, a 2-4-sentence `body`, and 3-6 `keywords`.
3. Add the outline entry to this file under the category section.
4. Run `bun run lint` to catch TypeScript/ESLint errors.
5. Manually verify the search bar finds the new article by keyword + title.

## How to migrate to MDX (when this outgrows a single page)

The current single-page approach works up to ~100 articles. Past that:

1. Create `src/app/docs/[category]/[slug]/page.tsx` as a dynamic route.
2. Move each article's body to `src/content/docs/[category]/[slug].mdx`.
3. Replace the `CATEGORIES` constant with a `getStaticProps`-style loader
   that reads the MDX files at build time.
4. Keep the search bar client-side (compile a Lunr.js or FlexSearch index
   at build time from the frontmatter + body).
5. Add a `lastReviewed` frontmatter field + a "Last reviewed: YYYY-MM-DD"
   line at the bottom of each article.

## Changelog

- **2024 (Task #10-customer-success)**: Initial 27 articles across 6
  categories. Placeholder content; outlines tracked in this file.
