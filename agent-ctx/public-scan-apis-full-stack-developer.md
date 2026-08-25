# Task: public-scan-apis — full-stack-developer

**Project:** `/home/z/GuardianX-web` (Next.js 16 + TypeScript + Prisma Client + Neon Postgres)

## What I did

Built the 4 public-scan API routes that the homepage ScanWidget +
recent-scans-card rely on, plus a one-line bootstrap fix for the
existing predictive-forecast route.

### Routes built

1. `src/app/api/public-scan/scan/route.ts` — `POST` (public, no auth)
   - Validates URL via `node:url`; auto-prefixes `https://`.
   - **SSRF guard**: blocks private/internal IP literals (10.x / 192.168.x /
     172.16-31.x / 127.x / 169.254.x / 0.x / 100.64-127.x carrier-grade NAT /
     fc00::/7 ULA / fe80:: link-local / ::1 loopback) and `localhost` /
     `*.local` hostnames. Also explicitly blocks GCP's
     `metadata.google.internal`.
   - Creates a `WebsiteScan` row with `status: "running"`.
   - Real HTTP recon with timeouts:
     - main fetch: 10s `AbortController`, `redirect: "follow"`, custom
       `GuardianX-Free-Scan/1.0` UA.
     - 5 well-known path probes (`/robots.txt`, `/security.txt`,
       `/.well-known/security.txt`, `/.env`, `/.git/HEAD`) — 5s each,
       run in parallel.
   - Missing security headers → findings (HSTS / CSP / X-Frame-Options /
     X-Content-Type-Options / Referrer-Policy / Permissions-Policy).
   - `Server` + `X-Powered-By` header disclosure → low findings.
   - `/.env` and `/.git/HEAD` content is read + pattern-matched (env needs
     `KEY=value`; git HEAD needs `ref: refs/heads/` or 40-char sha1) to
     avoid false positives on SPA catch-all routes that 200 on anything.
   - TLS errors on https URLs (regex on the fetch failure reason)
     surface as a critical "TLS certificate issue detected" finding.
   - LLM summary via Z.AI SDK with `ensureZaiConfig()` called first.
     Wrapped in try/catch → falls back to a templated summary.
   - Score: `100 − critical*20 − high*10 − medium*5 − low*2`, clamped 0..100.
   - Persists everything to the row + returns `{ scanId, url, score,
     findingsCount, criticalCount, highCount, mediumCount, lowCount,
     findings, summary, completedAt }`.

2. `src/app/api/public-scan/send-report/route.ts` — `POST` (public)
   - Validates `scanId` + email format.
   - Idempotent: returns 200 `{ ok: true, alreadySent: true, message }`
     if `reportSent` is already true.
   - Builds a dark-theme HTML email (bg `#0a0a0a`, emerald accents) with
     inline styles + `<table>`-based layout (email clients strip external
     CSS). Findings table uses severity-coloured badges (red / amber /
     yellow / cyan / zinc — **NO indigo / blue**).
   - Big color-coded security score (≥80 emerald, 60-79 amber, 40-59
     yellow, <40 red).
   - Severity breakdown chips row (CRIT / HIGH / MED / LOW counts).
   - Executive summary block (LLM persisted via templated fallback since
     the WebsiteScan schema has no `summary` column — but the code reads
     `scan.summary` duck-typed so it auto-picks up the column if added
     later).
   - CTA button → `https://guardianx-two.vercel.app/scan/${scanId}`.
   - Calls `sendEmail(...)` from `@/lib/email`. On success: sets
     `reportSent: true`, writes the same HTML to
     `/tmp/scan-report-${scanId}.html` (for future download link).
   - Fail-soft: SMTP-not-configured → 200 with "delivery unavailable"
     message; hard send failure → 200 with "try again later". Never
     500s — the visitor already has the findings on screen.

3. `src/app/api/public-scan/recent/route.ts` — `GET` (public)
   - `?limit=20` (default 20, hard ceiling 100).
   - Selects only `id, url, score, findingsCount, criticalCount, createdAt`
     (privacy — never `email` / `ipAddress` / `findings` JSON).
   - Returns `{ scans: [...], total: <count of all completed scans>,
     cachedAt }`.
   - 30s module-level cache for the default-limit response (so a homepage
     refresh doesn't hammer the DB); other limits bypass the cache.

4. `src/app/api/public-scan/[id]/route.ts` — `GET` (public)
   - Fetches a scan by `id`; 404 if not found.
   - Returns the full row with findings JSON parsed + summary
     (templated fallback).
   - Privacy: omits `email` / `ipAddress` / `userAgent` / `reportPath`.
   - Next.js 16 async-params signature:
     `ctx: { params: Promise<{ id: string }> }`.

### Predictive-forecast fix

`src/app/api/predictive-forecast/route.ts` previously called
`ZAI.create()` directly, which fails on Vercel because the Z.AI SDK
looks for a `.z-ai-config` file in cwd/homedir/etc (none of which are
writable on Vercel). Added 2 lines:
- `import { ensureZaiConfig } from "@/lib/zai-config";`
- `ensureZaiConfig();` immediately before `const z = await ZAI.create();`

The existing heuristic fallback stays as the safety net — if the LLM
still fails after the config bootstrap, the route falls back to the
heuristic scorer.

## Schema update (necessary for local tsc)

The WebsiteScan model existed in `prisma/schema.production.prisma` only
(added by a prior agent for the Neon DB). It was missing from the local
`prisma/schema.prisma` (SQLite dev), which meant `db.websiteScan.*`
calls wouldn't type-check locally. Added the same model block to
`prisma/schema.prisma` so `bunx prisma generate` produces a Prisma
Client with the WebsiteScan delegate. The block is byte-identical to
the production schema's model — no divergence.

Ran `bunx prisma generate` after the schema edit. Verified
`db.websiteScan` is now in the generated Prisma Client types.

## Files touched

| File | Action |
|---|---|
| `src/app/api/public-scan/scan/route.ts` | NEW |
| `src/app/api/public-scan/send-report/route.ts` | NEW |
| `src/app/api/public-scan/recent/route.ts` | NEW |
| `src/app/api/public-scan/[id]/route.ts` | NEW |
| `src/app/api/predictive-forecast/route.ts` | EDITED (added `ensureZaiConfig()` call + import) |
| `prisma/schema.prisma` | EDITED (added WebsiteScan model — necessary for local tsc) |

## Files NOT touched (per spec)

- `src/components/sentinel/landing/scan-widget.tsx` (frontend agent)
- `src/components/sentinel/landing/recent-scans-card.tsx` (frontend agent — NEW)
- `src/components/sentinel/landing-page.tsx`
- `src/app/page.tsx`
- `src/lib/db.ts`
- `src/lib/email.ts`
- `src/lib/zai-config.ts`
- `prisma/schema.production.prisma` (the WebsiteScan model there was already added by a prior agent)

## Lint + tsc results

```
$ bun run lint
✖ 5 problems (0 errors, 5 warnings)
  # All 5 warnings are pre-existing in contributors-panel.tsx + service-launcher.tsx
  # Zero warnings in any public-scan/* or predictive-forecast file.

$ bunx tsc --noEmit 2>&1 | grep -E "public-scan|predictive-forecast|zai-config"
# Zero output — zero type errors in any in-scope file.
```

## Key decisions / notes

1. **`summary` not persisted.** The WebsiteScan schema has no `summary`
   column (per the spec's persisted-fields list). The LLM summary is
   returned to the scan caller at `/scan` time but the email + GET-by-id
   endpoints use a templated fallback. The code uses a duck-typed
   `scan.summary` access so adding a `summary` column to the schema
   later auto-upgrades the email without code changes.

2. **`.env` / `.git/HEAD` content validation.** A 200 response on
   `/.env` doesn't always mean the env file is exposed — SPAs and
   catch-all routers often return 200 + index.html for any path. The
   scan route fetches the body and pattern-matches:
   - `.env` → `/(^|\n)\s*(?:export\s+)?[A-Z][A-Z0-9_]*\s*=/`
   - `.git/HEAD` → `/ref:\s*refs\/heads\//` or `/^[0-9a-f]{40}\s*$/m`
   Only if the pattern matches is the critical finding emitted.

3. **Recent-route cache.** Module-level 30s cache for the default
   `limit=20` request only. Non-default limits bypass the cache to
   avoid starvation. `revalidate = 30` is also set as a Next.js hint.

4. **Fail-soft email sending.** If SMTP isn't configured (local dev /
   Vercel project without SMTP env vars), `sendEmail` returns
   `{ ok: true, skipped: true }`. The send-report route translates that
   into a 200 with a "delivery unavailable" message rather than a 500 —
   the visitor already has the findings on screen, so the UX stays
   clean.

5. **Privacy in recent/[id] routes.** Neither endpoint returns `email`,
   `ipAddress`, `userAgent`, or `reportPath`. The recent feed (shown on
   the homepage card next to the ScanWidget) only shows URL + score +
   counts + createdAt. The GET-by-id endpoint (full report) shows the
   findings but never the visitor's email or IP.

6. **Z.AI LLM bootstrap.** Every server-side LLM call site now calls
   `ensureZaiConfig()` immediately before `ZAI.create()` — the
   predictive-forecast route (this task) and the scan route (also this
   task). The function is idempotent (`ensured` flag) so repeat calls
   are near-zero cost.
