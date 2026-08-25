# Task: scan-widget-cinematic
**Agent:** full-stack-developer
**Task ID:** `scan-widget-cinematic`
**Date:** 2026-01

## Scope
Rewrite the homepage "Scan Your Website For Free" widget to call REAL scan APIs
(being built in parallel by another agent) and create a cinematic
"RecentScansCard" panel that streams live public scans on a CircuitBoard
background. Mount the new card on the landing page right after the scan widget.

## Files touched
- `src/components/sentinel/landing/scan-widget.tsx` — full rewrite (768 lines)
- `src/components/sentinel/landing/recent-scans-card.tsx` — NEW (601 lines)
- `src/components/sentinel/landing-page.tsx` — added import + `<RecentScansCard />` mount

## What I did

### 1. scan-widget.tsx — rewrite for real APIs
Kept the 5-phase UX (`idle → scanning → findings → email → done`) and most of
the styling. Replaced ALL mock logic with real HTTP calls:

- **`startScan()`** → `POST /api/public-scan/scan` with `{url, email?}`.
  - Defensive `parseScanResponse()` coerces every field; severity validated
    against the union.
  - Phase labels cycle every 2s through: "Resolving DNS…", "Fetching
    headers…", "Probing well-known paths…", "Analyzing TLS…", "Generating
    report…".
  - Pseudo progress bar (ease-out, capped at 90% via rAF) snaps to 100% when
    the API responds, then transitions to the findings phase 280ms later.
  - HTTP 400 → "Invalid URL…"; HTTP 500 → "Scan failed (HTTP 500)…";
    network error → "Network error…". All errors land in the existing red
    error strip and revert the phase to `idle` so the user can retry.
- **`submitEmail()`** → `POST /api/public-scan/send-report` with
  `{scanId, email}`. Shows a spinner (`sendingReport` state) and transitions
  to the done phase on 200.
- **Findings display** renders the REAL findings array. Each card now also
  shows the `remediation` line (was in the type but not previously rendered).
- **Score** rendered as a big number with color coding: 90+ emerald,
  70-89 amber, 50-69 orange, <50 red.
- **Summary** — the LLM-generated prose shown in a cyan "Guardian AI summary"
  block below the score.
- Title changed to **"Scan Your Website For Free"** (exact wording per spec).
- Rate-limit (1 scan / browser / hour via `localStorage.gx_scan_last_run`)
  and `normalizeUrl` helper preserved.
- Added an **"Enter Lab Console →"** CTA (calls `onEnter`) both in the done
  phase (replacing "Sign up for full access") and as a persistent footer
  link so users can jump into the lab without completing a scan.
- Findings list now uses `custom-scrollbar max-h-96 overflow-y-auto` so long
  finding lists don't blow out the card.
- AbortController cleans up any in-flight scan request on unmount or reset.

### 2. recent-scans-card.tsx — cinematic card (NEW)
Self-contained `"use client"` component, no props. Streams
`GET /api/public-scan/recent?limit=20` on mount + every 30s, plus a 60s
tick to refresh "Xm ago" labels between polls.

- **Background:** `<CircuitBoard opacity={1} showHud={false} />` wrapped in a
  `opacity-25` container + a dark gradient overlay so cards stay legible.
- **Header:** pulsing emerald `pulse-dot` + "Live scan feed" eyebrow +
  "Recent Public Scans" headline + "TOTAL SCANS" stat card + status pill
  (LIVE/SYNC/WAIT/ERR).
- **Marquee:** framer-motion `useMotionValue` + `useAnimationFrame`
  (continuous right-to-left scroll, 36s per pass). Pauses on hover. Track is
  duplicated for seamless looping. Respects `prefers-reduced-motion`
  (renders a static row).
- **Each ScanCard:** dark glass (`bg-zinc-950/80 backdrop-blur
  holo-card-sharp hud-corners`), emerald accents, responsive width
  `w-[280px] sm:w-[220px] lg:w-[200px]` (1 card on mobile, ~3 on tablet,
  ~5-6 on desktop). Shows: truncated URL, big color-coded score, findings
  count + critical-count badge (or "clean" badge), 5-severity distribution
  bar (critical=red, high=amber, medium=yellow, low=sky, info=zinc),
  C/H/M/L/I legend, and `timeAgo` label.
- **Empty state:** animated bouncing up-arrow with "Be the first to scan"
  pointing up at the ScanWidget above.
- **Error state:** red icon + "Live feed unavailable" (keeps any previously
  loaded data instead of blinking empty on a poll hiccup).
- **Loading state:** 6 `SkeletonCard` components with `animate-pulse` shimmer.
- **Defensive parsing:** `parsePayload` accepts both `{scans, total}` and a
  bare array. `parseScan` + `readSeverityCounts` handle flat fields
  (`criticalCount` etc.), nested objects (`severityCounts` /
  `severityDistribution` / `counts`), and a raw `findings[]` array as
  fallback. This makes the card resilient to whatever shape the parallel
  API agent settles on.

### 3. landing-page.tsx — mount
Normal (non-dynamic) import + `<RecentScansCard />` mounted immediately
after `<ScanWidgetLazy onEnter={onEnter} />`.

## Verification
- `bun run lint` → **0 errors** (5 pre-existing warnings in unrelated
  `contributors-panel.tsx` / `service-launcher.tsx`).
- `bunx tsc --noEmit` filtered to my files → **0 type errors** in
  `scan-widget.tsx`, `recent-scans-card.tsx`, `landing-page.tsx`. All
  remaining tsc errors are in `mini-services/*` (separate Bun subprojects
  outside my scope).
- No commit/push — leaving that to the central coordinator.

## Constraints honored
- TypeScript strict ✓
- `"use client"` on both components ✓
- shadcn/ui primitives available (not all needed — I used the existing
  `holo-card-sharp` / `hud-corners` tokens + custom Tailwind to match
  the cinematic landing-page design language)
- lucide-react icons only ✓
- framer-motion for the marquee ✓
- NO indigo or blue colors (emerald/cyan/amber/orange/red/sky/yellow/violet/zinc) ✓
- Dark theme (bg zinc-950, dark cards) ✓
- Mobile-first responsive ✓
- Reuses `holo-card-sharp`, `hud-corners`, `neon-emerald`, `pulse-dot`,
  `custom-scrollbar` tokens ✓
- CircuitBoard imported via `import { CircuitBoard } from "../ai-visualizer"`
  ✓
- Did NOT touch: `src/app/page.tsx`, `src/lib/db.ts`, `src/lib/email.ts`,
  `src/lib/zai-config.ts`, `src/app/api/public-scan/*`,
  `src/app/api/predictive-forecast/route.ts`, `prisma/schema.prisma`,
  `prisma/schema.production.prisma`, `circuit-board.tsx`, or any other
  sentinel component outside my scope ✓

## Dependencies on other agents
This task assumes the parallel API agent has built (or will build):
- `POST /api/public-scan/scan` → `{scanId, url, score, findingsCount,
  findings[], summary, completedAt}`
- `POST /api/public-scan/send-report` → takes `{scanId, email}`, emails the
  report
- `GET /api/public-scan/recent?limit=20` → `{scans[], total}` (or bare array;
  my parser accepts both)

Until those routes exist, the widget will surface a friendly error in the
red strip ("Scan failed (HTTP 404)…") and the RecentScansCard will show its
"Live feed unavailable" error state. Both gracefully recover once the
routes come online (next poll cycle / next scan attempt).
