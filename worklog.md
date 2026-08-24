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



---

## 2026-08-24 — warroom-voice-gesture: backtalk + barehands → War Room

**Task ID:** `warroom-voice-gesture`
**Scope:** Next.js web app at `/home/z/GuardianX-web`.

Ported two of `@jaredrhod`'s open-source agent projects — `backtalk`
(voice) and `barehands` (gesture) — into the GuardianX War Room as
tri-modal (voice OR gesture OR mouse) input layers. Both reference
repos are Python/HTML; this work reimplements their interaction
vocabulary on pure browser APIs so they run inside the existing
Next.js dashboard with no extra services.

### What landed

**Voice Control** (`src/components/sentinel/war-room/voice-control.tsx`)

- backtalk shape (push-to-talk, status ring, spoken reply) on the
  native Web Speech API. STT via `webkitSpeechRecognition` (Chrome/
  Edge), TTS via `SpeechSynthesisUtterance` (cross-browser). **No
  Python server, no API keys, no external deps.**
- Push-to-talk: hold SPACE, or click the mic. 24-bar waveform
  animation when listening. Status ring color: green (idle) / red
  (listening) / amber (speaking).
- Voice commands parsed locally by `parseVoiceCommand`:
  `scan <codebase>`, `show <tab>`, `search findings for <query>`,
  `approve patch <id>`, `what's the security posture?`, `stop`.
- Imperative handle (`VoiceControlHandle`) exposes `speak` /
  `stopSpeaking` / `startListening` / `stopListening` / `isSupported`
  so the parent overlay can drive TTS from gesture or AI events.
- Feature detection via `useSyncExternalStore` (no setState-in-effect,
  no hydration mismatch). Stale-closure bug on the `onend` transcript
  fixed with a `latestTranscriptRef` mirror so the React Compiler
  preserves the `useCallback` memoization.

**Gesture Control** (`src/components/sentinel/war-room/gesture-control.tsx`)

- barehands vocabulary on `@mediapipe/hands` + `@mediapipe/camera_utils`
  (npm packages, first-class TS types). WASM loaded from jsDelivr via
  `locateFile`.
- Gestures: **pinch** → synthetic click on element under cursor;
  **swipe** (wrist x > 0.32 in < 380ms) → tab nav;
  **open palm** → vertical scroll;
  **fist** → synthetic ESC + `onGesture({kind:"fist"})`;
  **two-hand pinch** → zoom (delta between two index tips).
- Spring-animated fixed cursor tracks the index fingertip. Small
  160×120 camera preview in the corner with hand-landmark skeleton
  overlay (toggleable).
- Graceful degradation: camera-permission / WebGL / model-load
  failures show an "OFFLINE" chip; the rest of the War Room keeps
  working with voice + mouse.

**War Room Overlay** (`src/components/sentinel/war-room/war-room-overlay.tsx`)

- Fullscreen (`fixed inset-0 z-[150]`) tri-modal overlay combining:
  - `CircuitBoard` visualizer as a 55%-opacity background.
  - Voice control card (toggle with `V`).
  - Gesture control card (toggle with `G`).
  - Tab strip: overview / clients / patches / findings / system
    (cycleable with `← →`, voice "show <tab>", or gesture swipe).
  - Live scan terminal (bottom-left, reads from `useSignalBus()`).
  - KPI tiles, client pipeline cards, pending-patch list with inline
    approve buttons, critical-findings feed with voice-driven filter,
    system-status grid.
- Closes on ESC, the Exit button, or a fist gesture (barehands'
  "close modal" idiom).
- Voice commands wired through `handleVoiceCommand`: `scan` looks up
  the codebase by name (case-insensitive substring) and POSTs
  `/api/scans`; `approve` POSTs `/api/patches/[id]/approve`; `search`
  filters the in-memory findings list; `status` reads `/api/posture-
  score` aloud; `navigate` switches the internal view + speaks the
  label. Gesture `swipe` cycles views, `fist` closes the overlay.
- Header shows live visualizer state, posture score, clock.

**Voice Command API** (`src/app/api/voice-command/route.ts`)

- POST, `requireAuth`-gated. Accepts pre-parsed command OR raw
  transcript (mirrors `parseVoiceCommand` server-side so external
  clients — mobile, CLI, agents — parse identically).
- Handlers:
  - `scan` → looks up codebase by name, prevents concurrent scans,
    creates a `Scan` row, fire-and-forgets to the engine.
  - `navigate` → no-op server-side (client handles view switch).
  - `search` → ILIKE-style contains query on `Finding.title|category|
    endpoint`, returns up to 25 matches.
  - `approve` → resolves patch by `patchId` OR `id`, applies patched
    source, appends to the tamper-evident attestation chain
    (`computeAttestationHash`), fires `onPatchApproved` memory writer.
  - `status` → computes posture score inline (same formula as
    `/api/posture-score`), returns `{overall, grade, message}`.
- Returns `{ok, action, message, ...payload}` per spec.

**Command Center wiring** (`src/components/sentinel/command-center.tsx`)

- Imported `WarRoomOverlay` and mounted it behind the existing
  "War Room" button (`<WarRoomOverlay open={warRoom} onClose={...} />`).
- The legacy `WarRoomMode` (auto-cycling 3-view fullscreen) is
  replaced by a `_WarRoomModeLegacyStub` (no-op) so any external
  imports still resolve; the War Room button now opens the tri-modal
  overlay. The "Immersive View" button (circuit board only) is
  unchanged.

### Constraints honored

- Voice uses **pure browser Web Speech API** — no Python server
  (backtalk's Whisper/Kokoro path is replaced by SpeechRecognition +
  SpeechSynthesis).
- Gesture uses **`@mediapipe/hands` + `@mediapipe/camera_utils`** (the
  task-specified legacy packages, not `tasks-vision` which barehands
  itself uses — these ship first-class TS types and a `Camera` rAF
  helper that fit the React lifecycle better).
- Both new components are **`"use client"`**.
- **Dark theme, emerald accents** throughout — no indigo/blue.
- Works in **fullscreen mode** (overlay is `fixed inset-0 z-[150]`,
  body scroll locked, ESC to exit).
- All three input modes reach the same actions — voice `show patches`
  and gesture `swipe right` both call `cycleView(1)`; voice `approve
  patch X` and mouse-clicking the Approve button both POST
  `/api/patches/[id]/approve`.

### Verification

- `bun run lint` → **0 errors, 5 warnings** (all pre-existing in
  `contributors-panel.tsx` + `service-launcher.tsx`, unrelated).
- `bunx tsc --noEmit -p tsconfig.json` filtered to the touched files
  → **0 errors**. (Two initial TS errors in `gesture-control.tsx`
  where `wristHistory` was typed `{x,t}` but palm-scroll pushed
  `{x,y,t}` — fixed by widening the type to `{x,y,t}`.)
- One React Compiler error in `voice-control.tsx` (`setState-in-
  effect` for the `supported` flag) fixed by switching to
  `useSyncExternalStore` for feature detection.
- One React Compiler error (`preserve-manual-memoization` on
  `startListening` because the closure captured `interim` state but
  deps only listed `dispatchCommand`) fixed by mirroring the latest
  transcript into a `latestTranscriptRef` so `onend` reads the ref
  instead of the stale state closure.

### Notes for the next session

- The `WarRoomOverlay` inherits `SignalBusProvider` from
  `command-center.tsx`'s wrapper, so `useSignalBus()` returns real
  engine events. If the overlay is ever mounted outside the command
  center (e.g. on a dedicated `/war-room` route), wrap it in
  `<SignalBusProvider>` or the live terminal will be empty.
- The voice parser (`parseVoiceCommand` in `voice-control.tsx`) and
  the server-side parser (`parseTranscript` in `voice-command/route.ts`)
  are intentionally duplicated to keep the client zero-network for
  navigation/search/stop commands. If you add a new voice command,
  update BOTH parsers.
- The MediaPipe Hands WASM is loaded from
  `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/<file>`.
  If the sandbox has no outbound CDN access, gesture init will fail
  gracefully (the "OFFLINE" chip shows). Self-hosting the WASM under
  `/public/mediapipe/` and pointing `locateFile` at the local path is
  the fix if offline operation matters.
- `barehands` itself uses the newer `@mediapipe/tasks-vision`
  HandLandmarker (stage.html loads
  `vision_bundle.mjs@0.10.14`); we stayed on the older
  `@mediapipe/hands` because the task explicitly named those packages
  and they ship TypeScript types. The gesture vocabulary is identical.
- The legacy `WarRoomMode` (auto-cycling 3-view) is gone from the UI
  but its 150-line body is replaced by a `_WarRoomModeLegacyStub` —
  remove the stub if you want a clean diff.
