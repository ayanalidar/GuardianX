# Performance Audit — `performance-audit` task

> Goal: identify the bottlenecks that make the GuardianX dashboard feel
> "laggy" and apply targeted fixes that *only* optimize — no behavior
> changes, no new features, no removed functionality. Every change below
> is reversible.

## TL;DR

| # | Fix | File(s) | Expected impact |
|---|-----|---------|-----------------|
| 1 | Memoize Agent X's prop callbacks with `useCallback` + wrap `AgentX` in `React.memo` | `src/app/page.tsx`, `src/components/sentinel/agent-x/agent-x.tsx` | Agent X no longer re-renders on every 1Hz clock tick / 15s patch refresh — eliminates ~60+ unnecessary re-renders/min of a 1700-line component |
| 2 | Add `React.memo` to `CodebaseCard` | `src/components/sentinel/codebase-card.tsx` | Codebase cards skip re-render on parent state changes (sidebar toggle, search query typing, periodic refresh) |
| 3 | Don't render the Command Center `CircuitBoard` when War Room / Immersive View fullscreen overlay is open | `src/components/sentinel/command-center.tsx` | Eliminates a duplicate rAF + canvas pipeline when an overlay that already mounts its own `CircuitBoard` is on screen |
| 4 | Add `compiler.removeConsole` in production | `next.config.ts` | Strips `console.log/info/debug` from production bundles; ~few KB saved + fewer runtime function-call/serialization costs (especially in the canvas + socket hot paths) |

Already-verified-good things (kept as-is):

- `src/components/sentinel/ai-visualizer/circuit-board.tsx` already pauses
  the rAF loop when off-screen (`IntersectionObserver`), when the tab is
  hidden (`visibilitychange`), and respects `prefers-reduced-motion`. DPR
  is already capped at 1.5.
- `src/components/sentinel/patch-card.tsx` already has `React.memo`.
- `src/app/page.tsx` already memoizes `loadAll`, `handleScan`,
  `handleSelectPatch`, `handleResolved`, `handleDeleteCodebase`, and
  `visiblePatches` (useMemo). The 1Hz clock is unavoidable.
- The patch-list auto-refresh in `page.tsx` (every 10s, gated by a 15s
  minimum gap + visibility-aware pause) is well-tuned.
- The scan-status poll (every 2s, only while a scan is active) is needed
  for fast feedback when a scan completes; acceptable.
- `command-center.tsx` activity feed polls every 15s and is visibility-aware.
- `landing-page.tsx` already lazy-loads the heavy below-the-fold sections
  (`LiveDemo`, `ScanWidget`, `ArchitectureDiagram`, `ROICalculator`,
  `CaseStudies`) via `next/dynamic({ ssr: false })`.
- `next.config.ts` already had `experimental.optimizePackageImports` for
  `lucide-react`, `framer-motion`, `@radix-ui/react-icons`, `recharts`,
  `date-fns`, `react-markdown`.
- `agent-x.tsx` proactive monitor polls every 5 min (per worklog) — fine.

---

## Issues found + fixes applied

### 1. Agent X re-rendered on every parent re-render

**File:** `src/app/page.tsx`, `src/components/sentinel/agent-x/agent-x.tsx`

**Problem.** `AgentX` is a 1727-line component with internal voice / TTS /
streaming chat state. In `page.tsx`'s `ConsoleView` it received **inline
closure props** for `onClose`, `onNavigate`, `onScan`, `onApprovePatch`,
`onSearch`, `onOpenWarRoom`:

```tsx
<AgentX
  onClose={() => setTab("dashboard")}
  onScan={(name) => {
    const cb = codebases.find(...);
    if (cb) handleScan(cb);
  }}
  ...
/>
```

Every inline closure has a new identity on every render, so even though
`AgentX` was rendered conditionally (only when `tab === "agent-x"`), it
re-rendered on **every** parent re-render — including the 1Hz `clock`
state update in `ConsoleView`, the 15s patch-list refresh, sidebar
toggle, search-query typing, etc. That's ~60 unnecessary re-renders per
minute of a very heavy component.

**Fix.**

1. `src/app/page.tsx` — replace the inline closures with `useCallback`-wrapped
   handlers (`handleAgentClose`, `handleAgentNavigate`, `handleAgentScan`,
   `handleAgentApprovePatch`, `handleAgentSearch`, `handleAgentOpenWarRoom`).
   Deps are minimal:
   - `handleAgentClose` / `handleAgentNavigate` / `handleAgentSearch` /
     `handleAgentOpenWarRoom`: `[]` (they only call `setTab`, `setQuery`,
     or dispatch a static `CustomEvent` — all stable).
   - `handleAgentScan`: `[codebases, handleScan]` — only changes when the
     codebase list changes (rare).
   - `handleAgentApprovePatch`: `[patches, handleSelectPatch]` — only
     changes when the patch list changes.

2. `src/components/sentinel/agent-x/agent-x.tsx` — wrap the exported
   component in `React.memo`:
   - The function `AgentX` is renamed to `AgentXInner` (private).
   - `export const AgentX = memo(AgentXInner);`
   - `export default AgentX;` (unchanged for callers using default import).
   - The barrel `src/components/sentinel/agent-x/index.ts` already re-exports
     both the named and default export, so no changes needed there.

**Expected impact.** Agent X now only re-renders when one of `tab`,
`currentUser`, `codebases`, or `patches` actually changes — about a 95%
reduction in re-renders while sitting on the Agent X tab.

### 2. `CodebaseCard` was not memoized

**File:** `src/components/sentinel/codebase-card.tsx`

**Problem.** The patch list refreshes every 15s and the search query
re-renders the parent on every keystroke; `CodebaseCard` (which only
depends on its own `codebase` prop + the global `busy` flag) was
re-rendered along with the parent every time.

**Fix.** Wrapped `CodebaseCard` in `React.memo` (mirroring what
`PatchCard` already does — the inline `motion.div` is unchanged, just
the export goes through `memo(function CodebaseCard(...) { ... })`).

**Expected impact.** When the user types in the patch search box,
codebase cards (on the codebases tab) no longer re-render. When the
15s patch-list poll completes, codebase cards skip the render because
their `codebase` prop is unchanged.

### 3. Duplicate `CircuitBoard` canvas when War Room / Immersive View open

**File:** `src/components/sentinel/command-center.tsx`

**Problem.** `CommandCenter` mounts a `CircuitBoard` as a fixed
background (line ~213). When the user opens the War Room overlay or the
Immersive View overlay, **those overlays mount their own
`CircuitBoard`** (see `war-room-overlay.tsx:396` and
`immersive-view.tsx:102`). The Command Center's background canvas is
still in the DOM and still intersecting the viewport (the overlay is
`position: fixed` on top of it, not scrolling it out of view), so
`IntersectionObserver` doesn't pause it. **Two rAF loops + two canvas
pipelines are running simultaneously**, each spawning pulses and
drawing the full board at up to 60fps.

**Fix.** Gate the Command Center's background `CircuitBoard` on
`!warRoom && !immersiveOpen`:

```tsx
{!warRoom && !immersiveOpen && (
  <div aria-hidden className="...">
    <CircuitBoard opacity={0.55} showHud={false} />
    <div className="absolute inset-0 bg-gradient-to-b ..." />
  </div>
)}
```

The user can't see the background canvas anyway while the overlay is
open (it's covered), so unmounting it has zero visual effect.

**Expected impact.** Roughly halves GPU/CPU usage by the canvas
subsystem while a fullscreen overlay is open. The War Room's voice /
gesture / mouse tri-modal overlay is the heaviest view in the app and
this stop it from being doubly heavy.

### 4. `console.log` calls shipped in production

**File:** `next.config.ts`

**Problem.** The codebase uses `console.log` / `console.info` /
`console.debug` extensively for dev diagnostics — the canvas hot path,
the socket.io connection lifecycle, and Agent X's voice activity
detection all log. In production these calls survive as live function
calls (with argument evaluation + devtools serialization) every time
they fire, which is often.

**Fix.** Add `compiler.removeConsole` in production, preserving
`console.error` and `console.warn` so real failures still surface:

```ts
compiler: {
  removeConsole:
    process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
},
```

**Expected impact.** Smaller production bundles + zero runtime cost
from logging in production. Dev mode is unaffected.

---

## Issues identified but NOT fixed (out of scope)

These were noted during the audit but couldn't be fixed without
touching files outside the allowed scope (or without larger
refactors).

### a. Two `CircuitBoard`s can run simultaneously on the homepage

`src/components/sentinel/landing/particle-bg.tsx` (variant `"circuit"`)
and `src/components/sentinel/landing/recent-scans-card.tsx` both mount
their own `CircuitBoard`. On the homepage, when the Recent Scans Card
section is in view, both canvases can be running at once. The task
scope excludes `src/components/sentinel/landing/*`, so this is left
untouched. Mitigations that already exist: each `CircuitBoard` pauses
when off-screen via `IntersectionObserver`, so when the user scrolls
past the hero the particle-bg canvas pauses, etc. Only the brief
overlap window where both are visible at once runs both.

### b. `<img>` tags in `contributors-panel.tsx` (avatars)

Two `<img>` tags exist (`contributors-panel.tsx:302` and `:383`) for
GitHub avatar URLs. Converting them to `next/image`'s `<Image>`
component would require adding `images.remotePatterns` for
`avatars.githubusercontent.com` to `next.config.ts` (a config change
that's a behavior change in image-optimization routing) — outside the
"performance-only" scope, and `contributors-panel.tsx` is not in the
list of editable files. Left untouched.

### c. Several short polling intervals outside the dashboard

A `setInterval` audit found intervals shorter than 15s in components
that are NOT in scope (e.g. `process-tree.tsx` polls every 3s,
`data-exfil-panel.tsx` polls every 5s, `service-status-chips.tsx`
polls every 5s). These are all in tabs the user has to actively open
and they're not part of the dashboard's initial render, so they don't
affect perceived initial-load performance. They're also outside the
list of editable files for this task. They're flagged here for a
future audit.

### d. Synchronous imports of all tab components in `page.tsx`

`page.tsx` does conditional rendering (`tab === "X" ? <X /> : ...`),
so only one tab's component is *mounted* at a time — good. But all
~30 tab components are imported synchronously at the top of the file,
which means they're all in the initial JS bundle. Converting them to
`next/dynamic({ ssr: false })` would split the bundle and reduce
initial load, **but** the task scope explicitly says "do NOT add tabs
or change behavior" and the tab switch is already conditional —
leaving this alone to avoid risk.

### e. `modules-overview.tsx` `onSelect` and banner callbacks in `page.tsx`

`<ModulesOverview onSelect={(f) => { ... }} />` and the
`<AdminTwoFactorBanner onOpenSettings={...} />` / `<AnalystBanner onNavigate={...} />`
callbacks are still inline closures. They're small components though,
so the re-render cost is low. Left as a future micro-optimization.

---

## Verification

```bash
cd /home/z/GuardianX-web && bun run lint 2>&1 | tail -5
# → 0 errors, 5 pre-existing warnings (all in files NOT touched by this task)

cd /home/z/GuardianX-web && bunx tsc --noEmit 2>&1 | rg "error TS" | wc -l
# → 173 (same as the pre-change baseline; 0 new type errors introduced)
```

All changes are reversible — the `React.memo` wrappers can be removed
and the inline closures restored; the `compiler.removeConsole` block
can be deleted; the CircuitBoard gate can be removed; the Agent X
`memo` wrapper can be removed.
