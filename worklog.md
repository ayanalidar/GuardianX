# GuardianX Worklog

A running record of agent-driven work on the GuardianX codebase.
The sentinel-engine lives at `/home/z/my-project`; the Next.js web app
lives at `/home/z/GuardianX-web`. Append new entries to the bottom.

---

## 2026-01 — jaredrhod-integration: AI Memory Vault + AI Visualizer

**Task ID:** `jaredrhod-integration`
**Scope:** Next.js web app at `/home/z/GuardianX-web` (the Next.js half
of the project — the sentinel-engine repo at `/home/z/my-project` is
unaffected by this integration; both halves share this worklog).

Ported two of `@jaredrhod`'s open-source agent projects into GuardianX:

1. **ai-memory-vault** — markdown-style persistent memory for the
   Guardian AI chat assistant. Source patterns cribbed from
   `/tmp/ai-memory-vault/templates/` (VAULT-INDEX / MEMORY.md /
   DAILY-NOTE frontmatter conventions, the "fewer fuller notes" rule,
   "Recent Activity / Active Threats / User Preferences / Recent
   Conversation" section shape).
2. **ai-visualizer** — React + canvas port of the `board` face from
   `/tmp/ai-visualizer/faces/board/index.html` and the state-bus
   plumbing from `/tmp/ai-visualizer/core.js`.

### What landed

**AI Memory Vault** (`src/lib/memory-vault/` + `src/app/api/memory/`)

- `src/lib/memory-vault/memory-store.ts` — Supabase-backed
  `MemoryEntry` table accessor (proxied via `db.memoryEntry.*` in
  `src/lib/db.ts`). `storeMemory`, `getMemories`, `searchMemories`,
  `getRecentContext`. Content capped at 500 chars. Categories:
  `scan_result | finding | patch | user_preference | conversation |
  client_context | threat_intel` (the 5 required + 2 extras for
  future scope).
- `src/lib/memory-vault/memory-context.ts` — `buildContextForChat(userId)`
  pulls the latest 5 scans / 10 findings / 8 patches / 5 prefs / 6
  conversations and shapes them into a markdown block (## Recent
  Activity / ## Active Threats / ## User Preferences / ## Recent
  Conversation) that gets injected into the Guardian chat system
  prompt. Open findings are surfaced as "Active Threats" via the
  `status:open` tag, and drop off once a matching `status:patched`
  memory is written.
- `src/lib/memory-vault/memory-writer.ts` — fire-and-forget event
  writers (`onScanComplete`, `onFindingFound`, `onPatchApproved`,
  `onUserMessage`, `onAssistantReply`, `onUserPreference`) that
  convert platform events into memories. Failures are swallowed
  (logged) so a memory write never blocks the user-facing flow.
- `src/app/api/memory/route.ts` — `GET /api/memory?category=&limit=`
  and `POST /api/memory { category, title, content, tags? }`,
  `requireAuth`-gated.
- `src/app/api/memory/context/route.ts` — `GET /api/memory/context`
  returns the built markdown string + char count (used by
  `guardian-chat.tsx` to badge the header with vault size).
- `src/app/api/memory/ingest/route.ts` — internal POST for the
  sentinel-engine to record off-band events (scan_complete /
  finding_found / patch_approved / user_preference) so the vault
  stays current without the chat route having to be in the loop.
- `supabase/migrations/0009_memory_vault.sql` — creates the
  `MemoryEntry` table with indexes on `(userId, createdAt DESC)` and
  `(userId, category, createdAt DESC)`, RLS disabled (the app uses
  service_role). Mirrored in `prisma/schema.prisma` as the
  `MemoryEntry` model.
- `src/components/sentinel/guardian-chat.tsx` — header now badges a
  `Brain` icon with the live vault size in chars; the actual context
  is fetched server-side by `/api/guardian-chat/route.ts`, merged
  into the system prompt as a `Memory vault (recent activity...)`
  block with a fallback "(memory vault is empty — this may be a new
  user)" string when fresh. After each turn the assistant reply
  length is echoed back so the badge updates without a refetch.
- `src/app/api/guardian-chat/route.ts` — `onUserMessage` is fired
  before the LLM call, `onAssistantReply` after, so the next turn
  already has the prior turn as context. Best-effort: a thrown
  memory write is caught and warned, never blocks the reply.

**AI Visualizer** (`src/components/sentinel/ai-visualizer/`)

- `src/components/sentinel/ai-visualizer/circuit-board.tsx` —
  canvas-based React port of the `board` face. Procedurally routes
  traces across a grid (mulberry32 RNG, seed 7 so the board looks
  identical every boot), places ~34 components (ICs / resistors /
  caps) on top, and spawns data pulses that flow along the traces
  lighting up components as they hit. A central chip "breathes" at
  idle and amps up under load. Pulses spawn from chip pins outward,
  ~62% biased to the chip side. Pulses use additive blending with a
  cached radial-gradient glow sprite (the same `makeGlow` trick from
  `core.js` `U.makeGlow`). rAF loop is paused when the canvas is
  off-screen (IntersectionObserver) or the tab is hidden, and DPR is
  capped at 1.5 — matches the perf rules in `core.js`. HUD: corner
  brackets, GUARDIANX brand, status mode label, live clock, signal
  indicator. `forcedState` prop lets callers pin a state without the
  bus (used by the landing particle-bg variant).
- `src/components/sentinel/ai-visualizer/signal-bus.tsx` — React
  Context provider that owns the single source of truth for the
  visualizer state. Connects to the sentinel-engine socket.io relay
  (via `ENGINE_SOCKET_URL` + `engineSocketOptions()` from
  `src/lib/sentinel/engine-socket.ts`) and listens for
  `pipeline:event` payloads. Each event is mapped (by message regex
  on stage/message/level) to one of five states:
  `idle | scanning | analyzing | finding | patching`. States
  auto-expire (scanning 30s, analyzing 20s, finding 4s, patching 6s)
  so a missed "scan_complete" doesn't strand the board in `scanning`
  forever. Keeps a 40-event ring buffer for the live feed. Also
  exposes `push()` so local UI actions (e.g. "user approved a patch")
  can drive the visualization without waiting for the engine to
  echo them back. `useSignalBus()` returns a no-op shim when used
  outside a provider, so leaf components (homepage particle bg)
  don't crash without a provider.
- `src/components/sentinel/ai-visualizer/neural-link.tsx` — bonus
  port of the `neural` face (constellation of brain-region clusters
  with traveling dots along bezier tendrils). Same state mapping,
  same color story (green / amber / red on the dark substrate).
- `src/components/sentinel/ai-visualizer/immersive-view.tsx` —
  fullscreen overlay (ESC to close, `V` to toggle circuit/neural)
  for wall-projection / SOC-monitoring use. Overlays scan progress,
  live findings feed (from the SignalBus event ring), and AI status
  prose per state.
- `src/components/sentinel/ai-visualizer/index.ts` — barrel export
  of the provider + hook + three views.
- `src/components/sentinel/command-center.tsx` — wraps the dashboard
  in `<SignalBusProvider>` and mounts `<ImmersiveView>` behind a
  button, so every page that uses the command center gets a live
  visualizer context.
- `src/components/sentinel/landing/particle-bg.tsx` — `variant="circuit"`
  swaps the homepage particle background for a dimmed (`opacity=0.35`,
  HUD-off) `CircuitBoard` instance.

### Colors / states (per spec)

States: `idle | scanning | analyzing | finding | patching`
(colors pulled from `core.js` :root):
- green `#3ddc84` (idle / scanning / patching base)
- amber `#e7c368` (analyzing / amber traces)
- red `#ff4d5e` (finding)
Plus a "hot" companion per color for the pulse head (`#a6ffd0`,
`#ffe9ae`, `#ffb0b8`).

### Constraints honored

- TypeScript throughout (`strict: true`, `noImplicitAny: true` in
  `tsconfig.json`; the ai-visualizer + memory-vault files type-check
  clean — `bunx tsc --noEmit` reports zero errors for them).
- `"use client"` on every component that touches the DOM, canvas,
  IntersectionObserver, socket.io, or React state.
- Dark theme — substrate `#020705`, emerald accent throughout, no
  light-mode branch.
- No external Python server. The reference `ai-visualizer/server.py`
  was replaced by direct socket.io-client → sentinel-engine
  connection (the engine already speaks socket.io for pipeline
  events). The `/state` and `/config` polling endpoints from
  `core.js` are unused — state is pushed in via `pipeline:event`.

### Verification

- `bun run lint` → **0 errors, 5 warnings** (all pre-existing in
  `contributors-panel.tsx` + `service-launcher.tsx`, unrelated to
  this work).
- `bunx tsc --noEmit -p tsconfig.json` filtered to the touched
  files → **0 errors**. (One TS narrowing issue in `neural-link.tsx`
  where the `splat()` closure call made TS widen the outer `let`
  canvas contexts back to `| null` / infer them as `never`; fixed by
  snapshotting the narrowed bindings into explicitly-typed local
  consts before the for-loop. `circuit-board.tsx` and `signal-bus.tsx`
  were clean from the start.)
- Build-time TS errors are tolerated by `next.config.ts`'s
  `typescript.ignoreBuildErrors: true`, but the new files don't lean
  on that — they're type-clean on their own.

### Notes for the next session

- The memory vault is wired into the chat route but the
  `/api/memory/ingest` endpoint isn't called by the sentinel-engine
  yet — the engine runs at `/home/z/my-project` (separate repo).
  When the engine is updated to call `/api/memory/ingest` on
  scan_complete / finding_found / patch_approved, the chat assistant
  will start surfacing "Last time you scanned CyberShield, we found
  3 SQL injections — 2 are still unpatched." automatically.
- `signal-bus.tsx` infers event type from message regex; if the
  engine's stage names change, update `deriveState()` and the
  `pipeline:event` listener in tandem.
- The `immersive-view.tsx` is reachable from the Command Center via
  an "Immersive View" button — easy to miss in the UI.


