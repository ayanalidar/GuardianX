# Task: `performance-audit`

**Agent:** full-stack-developer
**Scope:** GuardianX Next.js web app at `/home/z/GuardianX-web` — performance audit + targeted optimization only. No behavior changes, no new features, no removed functionality. Every change is reversible.

## What I read

Audited the key files called out in the task brief:
- `src/app/page.tsx` (955 lines — dashboard shell + tab router)
- `src/components/sentinel/command-center.tsx` (736 lines — main dashboard view, mounts `CircuitBoard`)
- `src/components/sentinel/landing-page.tsx` (229 lines — homepage, lazy-loads heavy sections)
- `src/components/sentinel/agent-x/agent-x.tsx` (1728 lines — heavy always-on AI panel)
- `src/components/sentinel/ai-visualizer/circuit-board.tsx` (868 lines — canvas animation)
- `next.config.ts` (27 lines — build config)
- `src/components/sentinel/patch-card.tsx` (already `React.memo`'d — verified)
- `src/components/sentinel/codebase-card.tsx` (was NOT `React.memo`'d — fixed)

Cross-cutting greps for `setInterval(` and `<img ` across `src/` to find polling + un-optimized image tags.

## What was already good (verified, not touched)

- `circuit-board.tsx` already pauses rAF on `document.hidden` and on `IntersectionObserver` off-screen, caps DPR at 1.5, and respects `prefers-reduced-motion`.
- `patch-card.tsx` already wraps in `React.memo`.
- `page.tsx` already wraps `loadAll`, `handleScan`, `handleSelectPatch`, `handleResolved`, `handleDeleteCodebase` in `useCallback` and `visiblePatches` in `useMemo`.
- `page.tsx` patch-list auto-refresh (10s tick, 15s min gap, visibility-aware pause) is well-tuned.
- `command-center.tsx` activity feed polls every 15s and is visibility-aware.
- `landing-page.tsx` already lazy-loads `LiveDemo`, `ScanWidget`, `ArchitectureDiagram`, `ROICalculator`, `CaseStudies` via `next/dynamic({ ssr: false })`.
- `next.config.ts` already had `experimental.optimizePackageImports` for `lucide-react`, `framer-motion`, `@radix-ui/react-icons`, `recharts`, `date-fns`, `react-markdown`.

## Issues found + fixes applied

### 1. Agent X re-rendered on every parent re-render (HIGH IMPACT)

**Problem.** `<AgentX>` received inline closure props (`onClose`, `onNavigate`, `onScan`, `onApprovePatch`, `onSearch`, `onOpenWarRoom`). Every inline closure has a new identity on every render, so the 1727-line `AgentX` re-rendered on every parent re-render — including the 1Hz `clock` state update in `ConsoleView`, the 15s patch-list refresh, sidebar toggle, search-query typing. ~60 unnecessary re-renders/min.

**Fix.**
- `src/app/page.tsx`: replaced inline closures with `useCallback`-wrapped handlers
  (`handleAgentClose`, `handleAgentNavigate`, `handleAgentScan`, `handleAgentApprovePatch`, `handleAgentSearch`, `handleAgentOpenWarRoom`).
  Deps minimized — `[]` for the ones that only call `setTab` / `setQuery` / dispatch a static CustomEvent; `[codebases, handleScan]` / `[patches, handleSelectPatch]` for the ones that close over those arrays.
- `src/components/sentinel/agent-x/agent-x.tsx`: renamed the exported function to `AgentXInner` (private) and added `export const AgentX = memo(AgentXInner);`. Default export preserved via `export default AgentX;`. Barrel `src/components/sentinel/agent-x/index.ts` unchanged.

**Expected impact.** ~95% reduction in `AgentX` re-renders while sitting on the Agent X tab.

### 2. `CodebaseCard` not memoized (MED IMPACT)

**Problem.** `CodebaseCard` re-rendered on every parent state change (search query typing, periodic patch-list refresh).

**Fix.** Wrapped `CodebaseCard` in `React.memo` (mirroring `PatchCard`).

### 3. Duplicate `CircuitBoard` canvas when War Room / Immersive View open (HIGH IMPACT)

**Problem.** `CommandCenter` mounts a `CircuitBoard` as a fixed background. The War Room overlay (`war-room-overlay.tsx:396`) and Immersive View (`immersive-view.tsx:102`) each mount their *own* `CircuitBoard`. When an overlay opens, the Command Center's background canvas is still in the DOM and still intersecting the viewport (the overlay is `position: fixed` on top of it, not scrolling it out of view), so `IntersectionObserver` doesn't pause it. **Two rAF loops + two canvas pipelines ran simultaneously.**

**Fix.** `src/components/sentinel/command-center.tsx`: gate the background `CircuitBoard` on `!warRoom && !immersiveOpen`. The user can't see the background canvas while the overlay is on top anyway, so unmounting it has zero visual effect.

**Expected impact.** Roughly halves GPU/CPU usage by the canvas subsystem while a fullscreen overlay is open.

### 4. `console.*` calls shipped in production (LOW-MED IMPACT)

**Problem.** The codebase uses `console.log/info/debug` extensively in the canvas hot path, socket.io lifecycle, and Agent X voice activity detection. In production these survive as live function calls (with argument evaluation + devtools serialization) every time they fire.

**Fix.** `next.config.ts`: added `compiler.removeConsole` in production, preserving `console.error` and `console.warn`.

## Files edited

- `src/app/page.tsx` — added 6 `useCallback` handlers + replaced inline closures passed to `<AgentX>`. (Performance fixes only — no behavior change.)
- `src/components/sentinel/agent-x/agent-x.tsx` — added `memo` import, renamed `AgentX` to `AgentXInner`, added `export const AgentX = memo(AgentXInner);`. (Pure addition; existing named + default exports preserved.)
- `src/components/sentinel/codebase-card.tsx` — added `memo` import + wrapped export in `React.memo`.
- `src/components/sentinel/command-center.tsx` — gated the background `CircuitBoard` div on `!warRoom && !immersiveOpen`.
- `next.config.ts` — added `compiler.removeConsole` in production.
- `PERFORMANCE.md` (NEW) — full audit + fix documentation.

## Files NOT touched (per scope)

- `src/lib/*` (all lib files)
- `prisma/*`
- `src/app/api/*`
- `src/components/sentinel/war-room/*`
- `src/components/sentinel/landing/*`
- `src/components/sentinel/ai-visualizer/circuit-board.tsx` (already optimized per worklog — verified)

## Issues flagged but NOT fixed (out of scope, documented in PERFORMANCE.md)

- **Two `CircuitBoard`s on the homepage**: `landing/particle-bg.tsx` (variant `"circuit"`) + `landing/recent-scans-card.tsx` both mount their own canvas. Files are outside the editable scope. Mitigated by `IntersectionObserver` pausing when each scrolls out of view.
- **`<img>` tags for GitHub avatars in `contributors-panel.tsx`**: would need `images.remotePatterns` config change (a behavior change). File outside scope.
- **Short polling intervals in non-dashboard panels**: `process-tree.tsx` (3s), `data-exfil-panel.tsx` (5s), `service-status-chips.tsx` (5s). All in user-opened tabs that don't affect initial load. Outside scope.
- **Synchronous imports of all ~30 tab components in `page.tsx`**: only one is mounted at a time (conditional render is correct), but all are in the initial bundle. Converting to `next/dynamic({ ssr: false })` would split the bundle but the task said "do NOT add tabs or change behavior".

## Verification

```
cd /home/z/GuardianX-web && bun run lint 2>&1 | tail -5
  → 0 errors, 5 pre-existing warnings (all in files NOT touched)

cd /home/z/GuardianX-web && bunx tsc --noEmit 2>&1 | rg "error TS" | wc -l
  → 173 (same as pre-change baseline — 0 new type errors)
```

The dev server log (`/tmp/my-project/dev.log`) shows continued `200` responses with no compile errors after the edits.

No commits / pushes made.
