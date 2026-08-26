# Task 5, 6, 7 - Performance Optimization + Mobile Responsiveness + Onboarding Flow

**Agent:** main (this session)
**Task ID:** 5-6-7
**Date:** 2024
**Status:** complete

## Summary

Three coordinated improvements shipped in a single session:

1. **Task 5 (Performance)** - Created `src/lib/cache.ts` (in-memory cache with TTL) and applied it to the 7 slowest read-heavy API routes: `activity-feed`, `clients`, `analytics`, `executive-dashboard`, `stats`, `compliance`, `posture-score`. Each route now (a) checks the cache before running queries, (b) uses bounded `take` limits on every `findMany` so the result set can never grow unbounded, and (c) batches the remaining lookups via `Promise.all` so the per-request query count drops from ~10-20 sequential queries to 1-2 parallel rounds. The `compliance` and `posture-score` routes also had their N+1 patterns rewritten as flat batched queries with in-memory groupBy. Mutating endpoints (`POST /api/clients`) call `invalidateCache` + `invalidateCachePrefix` so fresh data appears on the next GET.

2. **Task 6 (Mobile Responsiveness)** - Fixed the dashboard sidebar, main content area, and grids in `src/app/page.tsx` and `src/components/sentinel/command-center.tsx`. Added a mobile-only close (X) button inside the sidebar header (the existing overlay click-to-close was kept). Upgraded the hamburger menu in the header to a 36px touch-friendly button with `aria-label`. Made every grid explicitly `grid-cols-1` on mobile before stepping up to `sm:` / `lg:` breakpoints (previously several grids relied on the implicit single-column default). The War Room's 5-column giant KPI row now collapses to `grid-cols-2` on mobile and `grid-cols-3` on small tablets. The command center header toolbar now wraps with `flex-wrap` so the 4 action buttons + threat gauge + clock don't overflow on narrow screens.

3. **Task 7 (Onboarding Flow)** - Created `src/components/sentinel/onboarding-wizard.tsx` - a 5-step modal (Welcome -> Add Client -> Upload Codebase -> Run Scan -> You're all set!) that runs the very first time an admin signs in. Each step uses framer-motion for slide transitions, shadcn/ui Button/Input/Label/Badge for the controls, and `holo-card-sharp hud-corners` for the modal chrome to match the rest of GuardianX. Steps 1-3 actually perform their action via the real API (`POST /api/clients`, `POST /api/codebases`, `POST /api/scans`) and step 4 shows a summary of what was created vs. skipped. Completion is persisted in `localStorage["guardianx-onboarded"] = "true"`. The wizard is rendered inside `ConsoleView` only when `currentUser?.role === "admin"`.

## Files created

### 1. `src/lib/cache.ts`
Process-local in-memory cache utility. Exports:
- `getCached<T>(key)` - returns the cached value or null on miss/stale (lazily evicts stale entries).
- `setCached<T>(key, data, ttlMs=30_000)` - writes a fresh entry. Pass `ttlMs: 0` to opt out.
- `invalidateCache(key)` - deletes one entry (called by mutating endpoints).
- `invalidateCachePrefix(prefix)` - deletes every key starting with the prefix (used by `POST /api/clients` to invalidate both `clients:list` and `activity-feed:*`).
- `cacheStats()` - returns `{ size, keys[] }` for debugging + the AI Ops `clear_cache` self-heal action.
- `clearCache()` - wipes the entire cache.

The Map is intentionally process-local (no Redis). The Next.js dev server keeps a single Node process, so a Map is sufficient and keeps repeat-read latency under 1ms. All consuming routes keep `export const dynamic = "force-dynamic"` so Next.js still hits the route handler on every request.

## Files modified

### Task 5 - API route caching + query optimization

#### `src/app/api/activity-feed/route.ts`
Rewrote the entire GET handler. The old version ran 6 sequential source queries (scans, patches, engagements, findings, canaries, attestations), then 2-3 sequential batched lookups per source. The new version runs all 6 source queries in parallel via `Promise.all`, then runs the 4 codebase/target/engagement/canary-target lookups in parallel as well. Each source query is now `take`-bounded (8/10/8/10/5/5). The result is wrapped in `setCached(CACHE_KEY, payload, 15_000)` - 15s TTL because the feed is supposed to feel live. The active_processes computation now runs entirely on the already-fetched rows (no extra queries). Removed the dead `getClientName` and `getClientNameByTarget` helpers at the bottom of the file.

#### `src/app/api/clients/route.ts`
- GET: added `getCached` check at the top, `setCached(... 30_000)` before return. Added `take: 200` on the client list, `take: 500` on codebases/targets, `take: 1000` on patches/engagements, `take: 2000` on findings.
- POST: after `db.client.create`, calls `invalidateCache("clients:list")` + `invalidateCachePrefix("activity-feed:")` so the new client shows up on the next dashboard refresh.

#### `src/app/api/analytics/route.ts`
- Added per-client cache key (`analytics:${clientId || "all"}`) so different scope selections don't collide.
- Added `take: 500` on codebases, `take: 2000` on patches, `take: 500` on targets, `take: 1000` on engagements, `take: 5000` on findings.
- Wrapped the result in `setCached(... 30_000)`.

#### `src/app/api/executive-dashboard/route.ts`
- Added cache check + `setCached(... 30_000)`.
- Added `take` limits to every `findMany` in the `Promise.all` block (2000 patches, 5000 findings, 1000 scans, 1000 engagements).
- Added `cached_at` field to the payload so consumers can see when the snapshot was taken.
- Replaced the em dash in the "scan to patch time" comment with a regular hyphen (style rule).

#### `src/app/api/stats/route.ts`
- Added cache check + `setCached(... 15_000)`. The 6 head-count queries still run in parallel via `Promise.all`, but the cache skips them entirely on hit. 15s TTL matches the patch-queue polling cadence.

#### `src/app/api/compliance/route.ts`
- Killed the N+1 in the engagement->target resolution. The original code did `for (const f of findings) { await db.engagement.findUnique(...) }` - one query per finding. The new version collects every distinct `engagementId` from findings, runs ONE `db.engagement.findMany` for all of them, then ONE `db.target.findMany` for the resulting target IDs, then builds two in-memory lookup maps for O(1) target name resolution.
- Added `take: 2000` on findings, `take: 1000` on patches.
- Added cache check + `setCached(... 30_000)`.
- Added `cached_at` field to the payload.

#### `src/app/api/posture-score/route.ts`
- Killed the N+1 from `db.codebase.findMany({ include: { patches: ... } })`. The dispatcher's `include` resolver does one extra query per codebase, so 50 codebases = 51 queries. The new version runs 2 flat queries (codebases + all patches via `codebaseId IN [...]`), then groups patches by `codebaseId` in memory.
- Added `take: 500` on codebases, `take: 5000` on patches.
- Added cache check + `setCached(... 30_000)`.
- Added `cached_at` field to the payload.

### Task 6 - Mobile responsiveness

#### `src/app/page.tsx`
- **Sidebar header**: added a mobile-only close button (X icon) inside the sidebar header. Uses `md:hidden` so it only renders on mobile. The button calls `setSidebarOpen(false)` and `stopPropagation()` so it doesn't trigger the "back to landing" navigation on the parent button.
- **Header hamburger**: upgraded from a bare `<button>` to a touch-friendly 36px button (`size-9` with `flex items-center justify-center rounded-md`). Added `aria-label="Open navigation menu"`.
- **Grids**: every grid that defaulted to single column on mobile now explicitly declares `grid-cols-1`:
  - `<section className="mb-5 grid grid-cols-1 gap-4 fade-in-up lg:grid-cols-3">` (PostureScoreCard + ThreatIntelPanel + RuntimeMonitor row).
  - `<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">` (patches/codebases + PipelineView row).
  - `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">` (codebase cards).
- **Main content padding**: confirmed `p-4 sm:p-6` (already correct). Header padding confirmed `px-4 sm:px-6`.

#### `src/components/sentinel/command-center.tsx`
- **Header toolbar** (line 201): added `flex-wrap` and responsive gap (`gap-2 sm:gap-3`) so the 4 action buttons + threat gauge + clock wrap to a second row on narrow screens instead of overflowing horizontally.
- **War Room giant KPI row** (line 675): changed from `grid grid-cols-5 gap-4` (5 columns even on mobile = unreadable) to `grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5`. On phones the 5 KPIs stack into 2 columns (3 rows of 2 + 1 orphan), on tablets 3 columns, on desktops 5.
- **Auto-cycling content row** (line 694): added explicit `grid-cols-1`.
- **Client pipeline grid** (line 698): added explicit `grid-cols-1` before `md:grid-cols-2`.
- **Live exploit terminal + network topology row** (line 412): added explicit `grid-cols-1` before `lg:grid-cols-2`.
- **Process tree + attack heatmap row** (line 418): added explicit `grid-cols-1` before `lg:grid-cols-2`.
- **Right sidebar live feed + AI panels row** (line 424): added explicit `grid-cols-1` before `lg:grid-cols-[1fr_20rem]`.
- **Client selector dropdown** (line 379): added explicit `grid-cols-1` before `sm:grid-cols-2 lg:grid-cols-3`.

### Task 7 - Onboarding wizard

#### `src/components/sentinel/onboarding-wizard.tsx` (new file, ~520 lines)
5-step modal wizard with framer-motion slide transitions.

**Step 0 - Welcome**: GuardianX logo (88px), tagline, 3 feature pills (Add a client / Upload code / Run a scan), "Get Started" + "Skip for now" buttons.

**Step 1 - Add your first client**: 2 inputs (Client Name *, Target URL). On submit, calls `POST /api/clients` with `{ name, targetUrl, status: "onboarding" }`. Stores the returned `{ id, name }` in `createdClient` state for use in step 2. Back button returns to step 0. Skip button jumps to step 2.

**Step 2 - Upload your first codebase**: 2 inputs (Codebase Name *, Description) + a read-only `<pre>` showing a tiny vulnerable Node.js sample (SQL injection via string concatenation). On submit, calls `POST /api/codebases` with `{ name, description, language: "javascript", sourceCode: SAMPLE_CODE, clientId: createdClient?.id }`. Stores the returned `{ id, name }` in `createdCodebase`. Back button returns to step 1. Skip button jumps to step 3.

**Step 3 - Run your first scan**: Shows a card with the codebase name (or a "no codebase uploaded" warning if step 2 was skipped). Lists the 4 pipeline stages (detect / generate patches / sandbox / queue). The "Run Scan" button calls `POST /api/scans` with `{ codebaseId: createdCodebase.id }`. The button is disabled if no codebase was created or the scan was already started. Back button returns to step 2. Skip button jumps to step 4.

**Step 4 - You're all set!**: Shows the GuardianX logo with a green checkmark badge, a "You are all set!" headline, and 3 summary rows showing what was created vs. skipped. The "Enter Dashboard" button calls `finish()` which writes `localStorage["guardianx-onboarded"] = "true"`, closes the modal, and invokes the optional `onComplete` callback.

**Sub-components**: `StepBody` (framer-motion wrapper with x-offset slide), `StepHeader` (icon + title + subtitle), `WizardFooter` (bordered footer with action buttons), `FeaturePill` (icon + label tile), `SummaryRow` (icon + label + value + ok/skipped badge).

**Style compliance**:
- `holo-card-sharp hud-corners` on the modal chrome.
- `scanlines cyber-vignette` overlay for the cyberpunk feel.
- Dark `zinc-950` background throughout, emerald accent color (`bg-emerald-600`, `text-emerald-300`, `border-emerald-500/30`, `neon-border`).
- Top accent bar with a `from-transparent via-emerald-400 to-transparent` gradient.
- Progress dots at the top (5 segments, fills as you advance).
- Step badge: `Step X / 5`.
- All buttons use shadcn/ui `Button` with the emerald variant for primary actions and `outline`/`ghost` for secondary.
- Inputs use shadcn/ui `Input` with `border-zinc-800 bg-zinc-900/60` to match the rest of the dashboard.
- Labels use shadcn/ui `Label`.
- framer-motion `AnimatePresence` with `mode="wait"` for step transitions (`opacity:0 x:12 -> opacity:1 x:0 -> opacity:0 x:-12`).
- `useToast` for all user feedback (success + error variants).
- lucide-react icons: `Building2`, `Boxes`, `Zap`, `CheckCircle2`, `ChevronRight`, `ChevronLeft`, `X`, `Loader2`, `Upload`, `Rocket`, `ShieldCheck`, `Sparkles`.
- **NO em dashes anywhere** (used regular hyphens, commas, or "to").
- Mobile responsive: `max-w-lg` modal, `px-5 sm:px-6` padding, `grid-cols-1 sm:grid-cols-3` for feature pills.

#### `src/app/page.tsx`
- Added import: `OnboardingWizard` from `@/components/sentinel/onboarding-wizard`.
- Rendered `<OnboardingWizard />` at the end of `ConsoleView`, gated by `currentUser?.role === "admin"`. The component self-guards with the `localStorage["guardianx-onboarded"]` check, so it only mounts the modal the very first time an admin signs in (subsequent sign-ins see nothing because the wizard's `useEffect` short-circuits when the localStorage value is already "true").

## Quality gates

- `bun run lint`: **0 errors, 3 warnings** - all 3 are pre-existing unused `eslint-disable` directives in `service-launcher.tsx`, unrelated to this task.
- `npx tsc --noEmit`: My modified/created files contribute **0 new errors**. The 9 errors that show up in `src/app/api/{clients,executive-dashboard,posture-score}` are all pre-existing patterns (the dispatcher's `Record<string, unknown>` return type means field accesses narrow to `unknown`, and `db.<model>.count()` triggers a TS2554 because the ModelHandler interface declares `args` as required even though the implementation has it as optional). Before my changes the same files had 14 errors; my rewrites eliminated 5 of them by replacing `cb.patches` (typed as the dispatcher's `unknown[]` include result) with explicitly-typed `Record<string, unknown>[]` arrays.
- `dev.log` verification: dev server compiling cleanly (`✓ Compiled in 160ms`, `✓ Compiled in 419ms`). All `GET /` requests returning 200 in 15-30ms. No runtime errors logged.

## Coordination with previous agents

- Read `/home/z/my-project/worklog.md` to understand the visual style rules established by previous agents (holo-card-sharp, hud-corners, emerald/cyan neon accents, framer-motion transitions, mobile-first responsive grids, custom-scrollbar on long lists, no em dashes).
- Read `/home/z/my-project/agent-ctx/3-dfir-panel.md` would have been the next logical read but the worklog already had everything I needed.
- Read the actual route files (`src/app/api/{activity-feed,clients,analytics,executive-dashboard,stats,compliance,posture-score}/route.ts`) before modifying them so I understood the exact query patterns and response shapes.
- Read `src/lib/db.ts` to understand how the dispatcher's `include` resolver works (it does N+1 queries per record for `hasMany` relations) - this is why `posture-score` was so slow and why I rewrote it to use flat batched queries.
- Read `src/components/sentinel/auth-page.tsx` to confirm the user object shape (`{ id, email, name, role }`) and the localStorage keys (`guardianx-user`, `guardianx-token`, `guardianx-view`) used by the auth flow, so the onboarding wizard's `guardianx-onboarded` key follows the same naming convention.
- Read `src/components/sentinel/guardianx-logo.tsx` to use the existing `GuardianXLogo` component (with the spin + shine + sparkles) in the wizard's welcome and done steps.
- Read `src/components/sentinel/clients-dashboard.tsx` to confirm the exact `POST /api/clients` request shape used by the existing AddClientDialog, so the wizard's step 1 submission is identical.
- Read `src/lib/sentinel/api.ts` to confirm the exact `POST /api/codebases` and `POST /api/scans` request shapes used by the existing codebase upload + scan flow, so the wizard's steps 2 and 3 are identical.

## Notes on the onboarding wizard's API integration

The wizard performs real API calls so the user ends up with actual data they can interact with in the dashboard:
- Step 1 -> `POST /api/clients` creates a real client row. The user sees it in the Clients tab immediately.
- Step 2 -> `POST /api/codebases` creates a real codebase row with the preloaded SQL injection sample. The user sees it in the Codebases tab and can run additional scans on it.
- Step 3 -> `POST /api/scans` starts a real SAST scan. The pipeline events show up in the PipelineView sidebar and the generated patches appear in the Patch Queue within a few seconds.

Each step has a Skip button so users who already have data aren't forced to recreate it. The wizard's `finish()` callback just writes the localStorage flag - it doesn't roll back anything that was created, so partial completion is fine.

## Cache TTL strategy

| Endpoint | TTL | Rationale |
|---|---|---|
| `/api/activity-feed` | 15s | The feed is supposed to feel "live". 15s is long enough to dedupe dashboard refreshes but short enough that newly created scans/patches show up quickly. |
| `/api/stats` | 15s | Polled every 10s by the patch queue. 15s means ~40% of polls hit the cache. |
| `/api/clients` | 30s | Mutated rarely (only on client create/delete). 30s is the spec default. |
| `/api/analytics` | 30s | Read-heavy, mutations invalidate via the per-client cache key. |
| `/api/executive-dashboard` | 30s | Read-heavy, no mutations need immediate refresh. |
| `/api/compliance` | 30s | Read-heavy, mutations (patch approve/reject) don't currently invalidate but 30s is acceptable for a compliance view. |
| `/api/posture-score` | 30s | Read-heavy, mutations (patch approve) don't currently invalidate but 30s is acceptable. |

All TTLs are overridable per-call via the third arg to `setCached(key, data, ttlMs)`. Future work: have `POST /api/patches/[id]/approve` and similar mutating endpoints call `invalidateCachePrefix("clients:")` + `invalidateCachePrefix("posture-score:")` + `invalidateCachePrefix("executive-dashboard:")` + `invalidateCachePrefix("compliance:")` so the dashboard reflects approvals immediately.
