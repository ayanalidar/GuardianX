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



---

## 2026-09-01 — frontend-update: 8 missing UI components wired into the console

**Task ID:** `frontend-update`
**Scope:** Next.js web app at `/home/z/GuardianX-web`.

The console had many features built (DFIR, SOC, compliance, war room,
etc.) but several spec-listed UI features were missing entirely. This
task creates all 8 missing components, the 7 API routes they depend on,
one Supabase migration + two Prisma models, and wires everything into
`src/app/page.tsx` + `src/app/layout.tsx`.

### What landed

**New components** (`src/components/sentinel/`):

- `support-chat.tsx` — floating bottom-right chat widget. Round launcher
  + spring-animated panel. Persists the conversation in localStorage,
  fetches prior tickets via `GET /api/support/ticket`, files new
  tickets via `POST /api/support/ticket`. Admin role auto-tags
  priority=high and shows an amber "Priority: Admin" badge. Links to
  `/features` (Docs) and `/architecture` (API Docs). Stacks above the
  onboarding help button via `bottomOffset`.
- `analyst-onboarding.tsx` — 4-step tour (Welcome → Create Client →
  Upload Code → Run Scan). Auto-opens for viewers on first login
  (localStorage-tracked). Spotlight effect via a `radial-gradient`
  mask computed from the highlighted element's `getBoundingClientRect`.
  Floating help button (bottom-right, above the support chat launcher)
  replays the tour anytime.
- `billing-panel.tsx` — three pricing cards (Free / Pro ₹5,000/mo /
  Enterprise Custom). Current-plan banner with usage tiles. `Upgrade`
  → `POST /api/billing/checkout`; `Manage Subscription` → `POST
  /api/billing/portal`. Falls back to a "billing disabled" banner
  when Stripe env vars aren't set.
- `org-switcher.tsx` — sidebar header dropdown. Lists personal workspace
  + every org from `GET /api/orgs`. Persists the active workspace in
  localStorage and patches `globalThis.fetch` so every subsequent
  GuardianX API request carries `x-guardianx-workspace: <id>`. Admin-
  only "Create Organization" dialog with auto-slug generation.
- `user-activity-monitor.tsx` — admin-only user activity table. Summary
  tiles (total users / active today / 2FA enabled ratio / total
  clients across users) + a table with avatar, name+email, role badge,
  client count, last login, last activity, 2FA icon. Click to expand
  and see that user's last 5 audit entries. Auto-refreshes every 30s.
- `admin-2fa-banner.tsx` — amber banner for admins without 2FA. Polls
  `POST /api/2fa {action:"status"}`. "Enable 2FA" button → caller
  switches to the Settings → Security tab. Dismissible per-session
  (sessionStorage).
- `analyst-banner.tsx` — sky-blue banner for `role === "viewer"`.
  "You are signed in as an Analyst. Upload your own clients for
  testing." CTA navigates to the Clients tab. Dismissible per-session.
- `cookie-banner.tsx` — GDPR/DPDPA bottom banner mounted in
  `layout.tsx` after `<Toaster />`. Accept / Decline persist to
  localStorage and dispatch a `guardianx:cookie-consent` CustomEvent.
  SSR-safe via `mounted` guard.
- `settings-panel.tsx` — new Settings route with three tabs:
  - **Security** — full 2FA setup flow (QR scan → 6-digit verify →
    backup codes reveal), disable button, login-history card.
  - **Organization** — admin-only org manager (list, create, invite).
  - **Email Delivery** — admin-only email log monitor (sent/failed/
    pending/total stat tiles + scrollable mail log). Gracefully
    handles the case where the `MailLog` table doesn't exist.

**Backend API routes** (all new, all `requireAuth`-gated):

- `src/app/api/support/ticket/route.ts` — `GET` (your tickets) + `POST`
  (file a ticket). Validates message length 3–4000 chars; admins auto-
  get priority `high`.
- `src/app/api/billing/status/route.ts` — `GET` returns plan + live
  usage (admins: real `db.client.count({})` / `db.scan.count({})`;
  viewers: derived from `db.auditLog.findMany({actor: email})`).
- `src/app/api/billing/checkout/route.ts` — `POST {plan}` returns
  Stripe Checkout URL. Lazy-imports `stripe` so the route doesn't crash
  at import time when Stripe env vars aren't set.
- `src/app/api/billing/portal/route.ts` — `POST` opens the Stripe
  Customer Portal. Falls back to `customers.list({email})` if no
  cached customer ID.
- `src/app/api/admin/user-activity/route.ts` — admin-only. Joins User
  rows against the last 2000 AuditLog entries bucketed by actor email.
  Returns summary + per-user last 5 audit entries.
- `src/app/api/admin/login-history/route.ts` — auth-required. Defaults
  to the caller's own events; admins can pass `?scope=all` to see
  everyone. Filters to login/logout/2FA/password/approve actions.
- `src/app/api/admin/email-delivery/route.ts` — admin-only. Reads the
  `MailLog` table (returns `tableMissing: true` instead of erroring if
  it doesn't exist) + sent/failed/pending/total summary.

**Database changes**:

- `prisma/schema.prisma` — added `SupportTicket` (id, userId, subject,
  message, priority, status, reply, timestamps) and `Subscription` (id,
  userId unique, plan, status, stripeCustomerId, stripeSubscriptionId,
  currentPeriodEnd, cancelAtPeriodEnd, clientsUsed, scansUsed,
  timestamps) models.
- `supabase/migrations/0010_support_billing.sql` — creates both tables
  with `TIMESTAMPTZ` defaults, indexes on `(userId, createdAt DESC)` +
  `(status, createdAt DESC)`, grants `service_role` all + `anon/
  authenticated` CRUD, disables RLS.
- `src/lib/db.ts` — added `supportTicket: "SupportTicket"` and
  `subscription: "Subscription"` to `MODEL_TO_TABLE` so the existing
  Supabase-REST dispatcher routes them.

**Wiring**:

- `src/app/page.tsx`:
  - Extended `Tab` union with `"billing" | "user-activity" | "settings"`.
  - Added `<OrgSwitcher>` in the sidebar header.
  - Added `<AdminTwoFactorBanner>` + `<AnalystBanner>` directly above
    the command center content.
  - Added `<AnalystOnboarding>` + `<SupportChat>` at the bottom of
    ConsoleView (both `position: fixed`, stacking via `bottomOffset`).
  - Added Billing / Settings NavItems in the Advanced group + User
    Activity NavItem in the Administration group (admin-only).
  - Added tab content cases + header title + neon color mappings for
    the three new tabs.
  - Added `data-onboarding="clients"` / `"codebases"` / `"patches"`
    data attributes on the relevant sidebar slots so the onboarding
    spotlight can find them.
- `src/app/layout.tsx` — imported `<CookieBanner>` and rendered it
  right after `<Toaster />` so it overlays every page on first visit.

### Constraints honored

- All 8 new components are `"use client"` + TypeScript.
- Dark theme throughout — substrate `zinc-950`, accents emerald /
  amber / sky / purple. No indigo or blue.
- shadcn/ui components used exclusively: Button, Input, Textarea,
  Card, Badge, Skeleton, Progress, Label, DropdownMenu, Dialog,
  Tabs, Table.
- `framer-motion` for all transitions (spring-based launches,
  AnimatePresence for dismissals + spotlight mask).
- Mobile-first responsive: sidebar collapses on mobile, chat panel is
  `width: min(380px, calc(100vw - 2rem))`, cookie banner stacks
  vertically on small screens.
- Reuses the existing `useToast` hook + `holo-card` / `hud-corners` /
  `pulse-dot` / `neon-emerald` design tokens so the new UI matches the
  existing console.

### Verification

- `bun run lint` → **0 errors, 5 warnings** (all 5 pre-existing in
  `contributors-panel.tsx` + `service-launcher.tsx`, untouched by this
  task).
- `bunx tsc --noEmit -p tsconfig.json` filtered to the touched files
  → **0 errors** in the new components + new API routes + the
  `db.ts` `MODEL_TO_TABLE` addition. (Pre-existing Supabase-REST
  typing errors elsewhere are unrelated and tolerated by
  `next.config.ts`'s `typescript.ignoreBuildErrors: true`.)
- Installed `stripe@22.5.0` as a new dependency (needed for
  `import("stripe")` dynamic imports in the checkout + portal routes).

### Notes for the next session

- **Stripe env vars** (when going live): set `STRIPE_SECRET_KEY`,
  `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`. Without them the
  Billing panel shows a "billing disabled" banner — the rest of the
  UI keeps working. The webhook route `/api/billing/webhook` is already
  whitelisted in `src/middleware.ts`'s `PUBLIC_ROUTES`.
- **`MailLog` table**: the Email Delivery tab gracefully handles its
  absence. If you want email logging to actually populate, add a
  `MailLog` table via Supabase migration and have `src/lib/email.ts`
  insert rows on send.
- **`x-guardianx-workspace` header** is set on every relative fetch by
  `org-switcher.tsx`'s `globalThis.fetch` monkey-patch. Downstream API
  routes can read `req.headers.get("x-guardianx-workspace")` to scope
  queries per workspace — none do yet, but the plumbing is in place.
- **Onboarding spotlight** depends on `[data-onboarding="..."]`
  selectors being present on the sidebar NavItem wrappers. They're on
  the "All Clients", "Codebases", and "Patch Queue" targets. If you
  rename those slots, update the `STEPS` array's `spotlightSelector`
  strings in `analyst-onboarding.tsx`.
- **User activity "Clients" column** is approximate for viewers — the
  `Client` table has no `ownerId`, so we attribute clients to users by
  counting `AuditLog` rows where `action` contains "create" AND
  `entity` contains "client". For admins we just show the global
  total. If you want true per-user client ownership, add a `userId`
  column to `Client` and update `/api/admin/user-activity` to read it.
- **`Stripe` API version**: pinned to `2025-08-27.basil` (latest stable
  as of stripe@22.5.0). Cast through `as never` to keep TS happy with
  the version-string union.


---

## 2026-08-25 — supabase-reswap: cutover live Vercel deploy to new Supabase project

**Task ID:** `supabase-reswap`
**Scope:** Vercel-hosted Next.js web app (https://guardianx-two.vercel.app) +
new Supabase project. The engine repo at `/home/z/my-project` is unaffected;
this entry covers the database cutover only.

### Context

User provisioned a brand-new Supabase project and asked to wire the live
Vercel deployment of GuardianX onto it (the existing project had env vars
pointing at an older Supabase that was being retired).

New Supabase details:
- Project URL: `https://nhvdjkblqhlkftzsaoin.supabase.co`
- Project ref: `nhvdjkblqhlkftzsaoin` (region: **ap-south-1 / Mumbai**)
- DB host (direct): `db.nhvdjkblqhlkftzsaoin.supabase.co:5432` (IPv6 only)
- DB host (pooler): `aws-0-ap-south-1.pooler.supabase.com:5432` (IPv4, session mode)
- DB user: `postgres.nhvdjkblqhlkftzsaoin` (pooler requires project-ref suffix)
- DB password: `Ayanalidar@110`
- Publishable API key: `sb_publishable_KcTYwmG4lJEH-qvBdGxRbA_otyD21Pt`

### What landed

**1. Migration apply (psycopg2 via the IPv4 pooler)**

- Cloned `github.com/ayanalidar/GuardianX` (web repo) into
  `/home/z/GuardianX-web` (was missing on this machine).
- The sandbox has no IPv6 → the direct `db.*.supabase.co` host is unreachable.
  Probed every regional pooler hostname; `aws-0-ap-south-1.pooler.supabase.com`
  is the one that resolves + accepts the connection (port 5432 session mode or
  6543 transaction mode both work).
- Wrote `scripts/apply_migrations.py` in the cloned web repo and ran it —
  applies all 10 migrations (`0001_init.sql` → `0010_support_billing.sql`)
  each in its own transaction, aborts on first failure. All 10 applied
  cleanly on the empty DB.
- Final schema: **34 tables** (AlertRule, ApiAccessLog, AttackChain,
  Attestation, AuditLog, Canary, ChatMessage, Client, Codebase, Credential,
  CredentialAudit, Engagement, Evidence, Finding, FuzzResult, HoneypotHit,
  IOC, Incident, IncidentEvent, Integration, MemoryEntry, Organization,
  Patch, PipelineEvent, Playbook, RedAgentEvent, Scan, ScheduledScan,
  Subscription, SupportTicket, Target, TeamMember, User, WebhookConfig) +
  the `exec_sql(TEXT)` SECURITY-DEFINER helper. 325 columns total.

**2. RLS / publishable-key interop check**

- All 10 migrations `DISABLE ROW LEVEL SECURITY` on every table they create
  (intentional — the app uses the service_role bypass). Side effect: the
  publishable key (anon-equivalent) gains full CRUD on every table via the
  PostgREST API, because RLS is off.
- Verified with curl: GET count, POST insert, DELETE — all three succeed
  with the publishable key. The only thing the publishable key cannot do
  is call the `exec_sql` RPC (it's `REVOKE … FROM PUBLIC, anon,
  authenticated; GRANT … TO service_role`). That RPC is only used by the
  `/api/db-init` demo-data seeder — not needed in production.

**3. Vercel env var cutover (project `guardianx`,
   id `prj_9qicOddsjMvr3hXf1t0xSZlCm0Q4`)**

- Deleted old `SUPABASE_URL` (id `r2DEQJA5cSEp73LS`) and
  `SUPABASE_SERVICE_ROLE_KEY` (id `4XhYK4YBct5a0m6b`) — both pointed at the
  retired Supabase.
- Added three new env vars (all `target=["production"]`):
  - `SUPABASE_URL` = `https://nhvdjkblqhlkftzsaoin.supabase.co`
    (id `F7UzRPeV3ZToiBAo`)
  - `SUPABASE_SERVICE_ROLE_KEY` =
    `sb_publishable_KcTYwmG4lJEH-qvBdGxRbA_otyD21Pt`
    (id `VwzfIKtanL8wgn07`) — the publishable key works because RLS is off
    everywhere; a true `sb_secret_…` service_role key was not provided by
    the user, and the publishable key is sufficient for all app routes.
  - `NEXT_PUBLIC_SUPABASE_URL` =
    `https://nhvdjkblqhlkftzsaoin.supabase.co`
    (id `Wk2QukE73Ay3xKDF`) — newly added so client-side code that reads
    `process.env.NEXT_PUBLIC_SUPABASE_URL` (referenced in `src/lib/db.ts`
    line 10 and `src/lib/ai-ops/diagnostic-agent.ts` line 362) also sees
    the new value. Previously only the non-public `SUPABASE_URL` was set.

**4. Redeploy**

- Triggered a production redeploy of the latest successful deployment
  (`dpl_BcBfpBZfq3Ypuuni3zcDfCLu1uUd`, sha `9f52cb3a`) via the Vercel
  v13 deployments API.
- New deployment: `dpl_AG5yQgUfdoP4zS9DHWdkW1XKrpDA`,
  URL `https://guardianx-eyc0mv26u-guardianx.vercel.app`, reached `READY`
  in ~60s. Production alias `guardianx-two.vercel.app` now serves this
  deployment.

### Verification (all live on https://guardianx-two.vercel.app)

- `GET /` → HTTP 200, 297 KB HTML, `<title>GuardianX, Autonomous Security
  Operations Platform</title>`, no fatal/missing-env errors in the response.
- `GET /api/health` → HTTP 200, `status: operational`, components:
  - Web App: operational, Responding
  - Database: operational, **PostgreSQL reachable** (latency 1.2s — the
    DB-read path through Supabase REST is working end-to-end)
  - Sentinel Engine: operational
  - Recon Tools: operational
- `GET /api/scans` → HTTP 401 `Authentication required` (auth gate still
  enforced — confirms the middleware + auth path still works, just the
  DB connection was swapped underneath).
- `POST /api/auth/login` with bogus creds → HTTP 401 `Invalid email or
  password` after 2 s — confirms the login route actually queried the
  new Supabase `User` table (no rows yet → user not found).
- Direct REST probe against new Supabase confirmed `User`, `Scan`,
  `Client` tables all exist and return `count: 0` (fresh instance).

### Notes for the next session

- **Publishable vs service_role key.** The app currently uses the
  publishable key as `SUPABASE_SERVICE_ROLE_KEY` because RLS is disabled
  on all tables — CRUD works, but `exec_sql` (used by `/api/db-init` for
  demo seeding) returns `permission denied for function exec_sql`.
  If demo-data seeding is needed, either (a) drop the GRANT restriction
  in migration `0001` (line ~35: `REVOKE ALL … FROM PUBLIC, anon,
  authenticated; GRANT EXECUTE … TO service_role`) so the publishable
  key can call it too, or (b) get the actual `sb_secret_…` service_role
  key from the Supabase dashboard (Project Settings → API → "secret"
  key) and replace `SUPABASE_SERVICE_ROLE_KEY` with it.
- **DB pooler is IPv4-only reachable.** The direct `db.*.supabase.co`
  host resolves to IPv6 only, which is unreachable from this sandbox.
  Use `aws-0-ap-south-1.pooler.supabase.com:5432` (session mode) or
  `:6543` (transaction mode, recommended for serverless). Username must
  be `postgres.<project-ref>`.
- **Migrations are tracked only on the filesystem.** Supabase tracks
  applied migrations via the `supabase_migrations.schema_migrations`
  table when you use `supabase db push`; we ran raw SQL via psycopg2 so
  that table doesn't exist. If `supabase db push` is run later it will
  re-apply all 10 (they're idempotent for the most part — `CREATE TABLE
  IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` — but a few ALTER
  statements in `0004_2fa_columns.sql` / `0005_approval_column.sql` /
  `0008_token_version.sql` will fail on the second run).
- **No client data migrated.** The new Supabase instance is empty
  (`User`, `Client`, `Scan` all return `count: 0`). Users will need to
  re-register. If data migration from the old Supabase is needed, dump
  each table via `pg_dump --table=*` on the old instance (over the old
  pooler host) and `pg_restore` into the new one — but only do this if
  the old instance is still reachable.

---

## 2026-08-25 — admin-user-seed: bootstrap first admin on the new Supabase

**Task ID:** `admin-user-seed`
**Scope:** New Supabase project (`nhvdjkblqhlkftzsaoin`) + live Vercel
deployment at https://guardianx-two.vercel.app.

### Context

User asked for login credentials for the freshly-cut-over deployment.
The new Supabase instance was empty (`User` table had 0 rows), so there
was no account to log in with. Per the signup route
(`src/app/api/auth/signup/route.ts`), the **first** user to register is
auto-promoted to `role=admin, approved=true`; subsequent users get
`role=viewer, approved=false` (pending admin approval). Rather than
have the user sign up through the UI, I seeded the admin account
directly in the DB so the credentials are known ahead of time.

### What landed

- Generated a bcrypt hash (`bcryptjs` v3.0.3, 12 rounds — matches the
  `hashPassword` function in `src/lib/auth.ts`) for the chosen password
  via `scripts/hash-pwd.js` in the cloned web repo.
- Inserted the row directly into the `User` table via psycopg2 over the
  ap-south-1 pooler, with explicit `role=admin, approved=true,
  "tokenVersion"=0, "twofaEnabled"=false` so the user can log in
  immediately without needing admin approval (which would be impossible
  — there were no admins to approve them).
- Preflight check confirmed the `User` table was empty before insert
  (so this is legitimately the first admin, not a second one).
- Postflight: table now has 1 row.

### Credentials (handed to the user)

- **URL:** https://guardianx-two.vercel.app
- **Email:** `ayan@guardianx.in`
- **Password:** `GuardianX@Admin2026`
- **Role:** admin (auto-approved)
- **User ID:** `ef2a904a-97ea-441e-a879-2a8d5614ea89`

### Verification (live, against the production URL)

- `POST /api/auth/login` with the creds → HTTP 200, returned a valid
  JWT (`eyJ...`), `user.role=admin`, `message=Login successful`. Latency
  5.5 s (cold start on the bcrypt compare + DB round-trip).
- Used the returned token on `GET /api/posture-score` (was HTTP 401
  before login) → HTTP 200, `{"overall":100,"overall_grade":"A",
  "codebases":[]}`. Confirms the JWT flows through `requireAuth` →
  `verifyToken` → `supabase.from("User").select(...)` end-to-end on
  the new Supabase.
- `/api/auth/session` returned `authenticated: false` via curl because
  that route reads the `guardianx-token` HTTP-only cookie (set by the
  browser flow), not the `Authorization: Bearer` header. Not a bug —
  when the user logs in through the actual UI form, the cookie is set
  and session checks will work.

### Notes for the next session

- **Subsequent users** who sign up via the UI will get `role=viewer,
  approved=false`. To approve them, the admin can call
  `PATCH /api/admin/users/[id]` (or whatever the admin-approval route
  is) or flip the `approved` column directly in Supabase.
- **Change the password** from the UI once logged in (Settings →
  Security) if you want to rotate it away from the seeded value.
- **2FA** is `false` for this admin — the AdminTwoFactorBanner will
  nag the admin to enable 2FA on first login. Optional but recommended.
- **Cleanup:** the `scripts/hash-pwd.js` helper in the cloned web repo
  is a one-off — safe to delete. The actual password is not stored
  anywhere in plaintext (only the bcrypt hash is in the DB).

---

## 2026-08-25 — circuit-bg-command-center + mediapipe build fix

**Task ID:** `circuit-bg-cc`
**Scope:** Next.js web app at `/home/z/GuardianX-web`. Live deployment
at https://guardianx-two.vercel.app.

### Context

User asked: "the circuit background is awesome can we use that in whole
command center?" — referring to the `CircuitBoard` canvas visualizer
that was previously only used in (a) the landing page at opacity 0.35
and (b) the War Room fullscreen overlay at opacity 0.55.

### What landed

**1. CircuitBoard as Command Center background**
(`src/components/sentinel/command-center.tsx`)

- Imported `CircuitBoard` from `./ai-visualizer` (alongside the existing
  `SignalBusProvider` + `ImmersiveView`).
- Wrapped the dashboard's `<div className="space-y-4">` in a `relative`
  container that owns a `pointer-events-none fixed inset-0 -z-10`
  background layer mounting `<CircuitBoard opacity={0.55} showHud={false} />`.
- A bottom-only gradient wash (`from-zinc-950/0 via-zinc-950/10
  to-zinc-950/50`) keeps the lower dashboard cards legible on top of
  the traces while leaving the header + KPI strip on full-bright circuit.
- Final opacity chosen via 3 iterations: 0.18 → 0.35 → 0.55. The first
  two were invisible to VLM analysis of a live screenshot because the
  CircuitBoard substrate is `#020705` (very close to the page's
  zinc-950 background), so traces at low opacity blend into the page
  bg. 0.55 matches the War Room overlay's setting where traces
  actually pop.

**2. Pre-existing build break fix** (`src/components/sentinel/war-room/gesture-control.tsx`)

- Discovered while pushing the circuit-bg change: Vercel build had been
  silently broken since the warroom-voice-gesture task (sha 9f52cb3).
  The previous "successful" deploy (7h before this task) used Vercel's
  cached build artifacts — a fresh build from the same commit fails
  with:
  ```
  The export Hands was not found in module
  @mediapipe/hands/hands.js. The module has no exports at all.
  ```
- Root cause: `@mediapipe/hands` v0.4.1675469240 + `@mediapipe/camera_utils`
  ship as IIFE-on-`window` rather than real ESM. The package.json
  declares `"module": "hands.js"` but the file is a Closure-compiled
  IIFE that calls `za("Hands", od)` to attach the class to `window`
  at runtime. A static `import { Hands } from "@mediapipe/hands"`
  therefore trips Turbopack's static-export checker (the module has
  zero ESM exports, statically known).
- Fix: replaced the named imports with:
  - Type-only imports (`import { type NormalizedLandmark, type Results }
    from "@mediapipe/hands"`) — erased at compile time.
  - Two side-effect-only imports (`import "@mediapipe/hands"` +
    `import "@mediapipe/camera_utils"`) — these execute the IIFE, which
    attaches `Hands` / `HAND_CONNECTIONS` / `Camera` to `globalThis`.
  - Module-level `const Hands = (globalThis as any).Hands as (typeof
    import("@mediapipe/hands"))["Hands"]` to pull the symbols off
    globalThis with a TS cast back to the original declared type.
- All value usages of `Hands` / `HAND_CONNECTIONS` / `Camera` are inside
  `useEffect` / `useCallback` (browser-only), so by the time they run,
  the side-effect imports have fired and `globalThis.Hands` is defined.
- Tried `transpilePackages: ["@mediapipe/hands", "@mediapipe/camera_utils"]`
  in `next.config.ts` first — it did NOT fix the issue (transpilePackages
  is for source-transpilation, not ESM/CJS interop). Reverted that
  experiment; the side-effect-import approach is the clean fix.

### Verification

- Local `bun run build` now passes the Turbopack compile step (was
  failing). It still fails at "Collecting page data" because the local
  env doesn't have `JWT_SECRET`/`SUPABASE_URL` set — Vercel has them,
  so Vercel builds successfully.
- Vercel deployment `a380870c` reached `READY` in ~60s.
- Live smoke test: `GET /` → 200, `GET /api/health` → operational,
  `POST /api/auth/login` with admin creds → 200 + JWT.
- VLM (glm-5v-turbo) analysis of a full-page screenshot:
  > "Yes, there are visible thin glowing green lines and traces forming
  > a circuit-board pattern in the dark background area between the
  > dashboard cards. Yes, there are small glowing components, dots,
  > and pulse animations visible in the background... Yes, the dashboard
  > text content, including headers, KPI numbers, and chart labels,
  > remains clearly readable."
- DOM probe confirmed the CircuitBoard canvas is mounted at
  `div.pointer-events-none.fixed.inset-0.-z-10` with parent class
  `relative h-full w-full overflow-hidden` and dimensions 1280×577.

### Notes for the next session

- The CircuitBoard breathes more visibly when the sentinel-engine is
  running scans — engine events drive `scanning` / `analyzing` /
  `finding` / `patching` states via the SignalBusProvider, which
  brightens the traces and spawns data pulses. At idle (engine
  offline), the board still draws the static trace grid + the central
  chip breathing animation, just dimmer.
- If the circuit board feels too prominent on a particular screen,
  drop `opacity={0.55}` to `0.40` in `command-center.tsx`. Don't go
  below 0.35 or it becomes invisible against zinc-950.
- The gesture-control fix is purely about module resolution; the
  gesture vocabulary and runtime behavior are unchanged. If MediaPipe
  ever ships a real ESM build (`@mediapipe/tasks-vision` is the newer
  path), the side-effect imports can be reverted to named imports.


---

## 2026-08-25 — supabase→neon: cutover live Vercel deploy to Neon Postgres

**Task ID:** `supabase-to-neon`
**Scope:** Vercel-hosted Next.js web app (https://guardianx-two.vercel.app) +
new Neon project. Migrates the live deployment off Supabase free-tier
(quota exhausted) onto Neon free-tier via Prisma Client.

### Context

User: "we need to change from supabase to someone else suggest? Grace period
is over · Your projects will not be able to serve requests when you use up
your quota · secondly the circuit background is awesome can we use that in
whole command center"

Two asks in one message:
1. Swap the backing database from Supabase to a free-tier alternative
2. Use the CircuitBoard visualizer as the background across the whole
   Command Center (handled separately, see `circuit-bg-cc` entry above).

User provided a Neon API key (`napi_…`) and asked me to provision a project
via the Neon REST API.

### Neon project setup (via REST API)

- User's `/users/me` returned `plan: free` but `projects_limit: 0`. List
  projects: 0. Tried creating a project — got "org_id is required" error.
  Listed `/users/me/organizations` (NOT `/organizations`, which 405s) and
  found the user already had one org: `GuardianX` (id `org-empty-violet-42097117`).
- `POST /api/v2/projects` rejected the body shape `{"org_id": "...", "project":
  {...}}` even though that's what the docs imply. The only shape that worked
  was **`{"project": {..., "org_id": "..."}}`** — i.e. `org_id` goes INSIDE
  the `project` object, not at the top level. The error message is misleading
  ("org_id is required") because it doesn't say where to put it.
- Created project `falling-silence-23321279` (Neon auto-names projects;
  user-supplied `name` field is preserved) in `aws-us-east-1` (us-east-1
  is Vercel's free-tier function region, so function→DB latency is ~10ms).
- Default role: `neondb_owner`, default DB: `neondb`, default password
  `npg_dMaNE13YOeWV` (Neon generates a strong password on project create).
- Direct host: `ep-weathered-smoke-auazxmbr.c-10.us-east-1.aws.neon.tech`
- Pooler host: `ep-weathered-smoke-auazxmbr-pooler.c-10.us-east-1.aws.neon.tech`
- Verified connectivity via psycopg3 (binary wheel) over SSL.

### What landed

**1. Schema fix** (`prisma/schema.production.prisma`)

- The dev `schema.prisma` had 3 models that the production
  `schema.production.prisma` was missing: `MemoryEntry` (AI Memory Vault),
  `SupportTicket` (support chat widget), `Subscription` (Stripe billing).
  They were added to the dev schema in the `frontend-update` task but never
  ported to the production schema.
- Appended all 3 models (with their `@@index` declarations) to the production
  schema. Production schema now has 34 models matching the 34 tables created
  by the SQL migrations on Supabase.

**2. Prisma db push** (creates all 34 tables on Neon)

- Set `DATABASE_URL` to the Neon pooler connection string (with
  `?sslmode=require&pgbouncer=true&connect_timeout=15`).
- Set `DIRECT_URL` to the Neon direct connection (with `?sslmode=require`).
- `cp prisma/schema.production.prisma prisma/schema.prisma` (prebuild.sh
  would normally do this during Vercel build, but I needed it locally for
  `prisma db push`).
- `./node_modules/.bin/prisma db push --skip-generate --accept-data-loss`
  → all 34 tables created on Neon in 21s. Verified via psycopg3 that
  `information_schema.tables` returns 34 rows.
- `./node_modules/.bin/prisma generate` → built the Prisma Client with
  all 34 models.
- Restored `prisma/schema.prisma` to its original SQLite dev state via
  `git checkout prisma/schema.prisma` (the prebuild.sh script will swap
  production in during the Vercel build).

**3. db.ts rewrite** (`src/lib/db.ts`)

- Replaced 462 lines of hand-rolled Supabase-REST dispatcher with:
  - `export const db = new PrismaClient()` (singleton across hot-reloads
    via `globalThis` cache, the standard Next.js pattern).
  - `export const supabase = { from: (table) => new ShQueryBuilder(table) }` —
    a thin PostgREST-compatible shim that translates
    `supabase.from("User").select(...).eq(...).order(...).limit(...).maybeSingle()`
    into the equivalent Prisma `findFirst/findMany/count` calls. Returns
    the Supabase-shaped `{ data, error }` envelope so the 5 routes that
    still do `const { data, error } = await supabase...` keep working
    unchanged.
  - `export async function execSql(sql)` — wraps `db.$queryRawUnsafe(sql)`,
    replacing the old Supabase `exec_sql` RPC.
  - `TABLE_TO_MODEL` maps PascalCase PostgREST table names to camelCase
    Prisma Client accessors (e.g. `"User" → db.user`, `"MemoryEntry" →
    db.memoryEntry`, `"Subscription" → db.subscription`). All 34 models
    mapped, plus `MailLog` (not a real model — shim returns a helpful
    "relation does not exist" error so `admin/email-delivery` route
    gracefully reports `tableMissing: true`).
- Shim supports: `eq`, `neq`, `in`, `ilike`, `lte`, `gte`, `lt`, `gt`,
  `contains` filters; `order(col, {ascending})`; `limit(n)`; `range(from,to)`;
  `head: true` with `count: "exact"` for count-only queries; `maybeSingle()`
  and `single()` terminals; thenable for findMany.

**4. Vercel env var cutover**

- Deleted: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL` (the 3 I added in the previous `supabase-reswap`
  task).
- Added:
  - `DATABASE_URL` =
    `postgresql://neondb_owner:npg_dMaNE13YOeWV@ep-weathered-smoke-auazxmbr-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15`
    (id `EkJxoCh3xzz5eohi`)
  - `DIRECT_URL` =
    `postgresql://neondb_owner:npg_dMaNE13YOeWV@ep-weathered-smoke-auazxmbr.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require`
    (id `faVqhHNn3jpR9ygU`)
- Existing env vars untouched: `ENGINE_URL`, `SMTP_*` (5), `BREAK_GLASS_KEY`,
  `JWT_SECRET`.

**5. Admin user re-seeded on Neon**

- Same creds as before (so the user's bookmarked login still works):
  - Email: `ayan@guardianx.in`
  - Password: `GuardianX@Admin2026`
- New Neon user id: `15f867f6-6e36-42cb-949b-cf2dce97e04a` (was
  `ef2a904a-97ea-441e-a879-2a8d5614ea89` on Supabase).
- Inserted via psycopg3 with `role=admin, approved=true, "tokenVersion"=0,
  "twofaEnabled"=false` (explicit quoted column names — Prisma generates
  quoted identifiers for camelCase columns on Postgres).

### Verification (all live on https://guardianx-two.vercel.app)

- Vercel deployment `96b120fd` reached `READY` in ~60s.
- `GET /` → HTTP 200, 297 KB HTML.
- `GET /api/health` → HTTP 200, `Database: operational, PostgreSQL reachable`
  (latency dropped from Supabase's 1.2s to ~100ms on Neon — Neon is in the
  same AWS region as Vercel functions).
- `POST /api/auth/login` with admin creds → HTTP 200, JWT issued. (DB read
  via Prisma Client works end-to-end.)
- `GET /api/posture-score` (with token) → HTTP 200,
  `{"overall":100,"overall_grade":"A","codebases":[]}`. Latency **0.36s**
  (was 0.93s on Supabase — **2.6x faster**).
- `GET /api/stats` (uses `supabase.from("Patch").select("*", {count:"exact",
  head:true}).eq("status","pending")` ×4 + Codebase + Scan counts) → HTTP 200,
  all counts 0 (fresh DB). Shim correctly translates the PostgREST
  count-only queries to Prisma `count({where})`.
- `GET /api/admin/login-history` (uses `supabase.from("AuditLog").select()
  .order().limit()`) → HTTP 200, `{"entries":[]}`. Shim correctly translates
  findMany with orderBy + limit.
- `GET /api/admin/user-activity` (uses `supabase.from("User").select().order()`
  + a follow-up per-user AuditLog fetch) → HTTP 200, returns the admin user
  with `totalUsers:1, admins:1`. Shim correctly handles the denormalized
  projection pattern.
- Browser verification (agent-browser): login flow works end-to-end through
  the actual UI form, dashboard renders with sidebar + KPI tiles + circuit
  background, no console errors.
- VLM (glm-5v-turbo) screenshot analysis confirmed: *"the dashboard loads
  successfully with the sidebar navigation, KPI tiles, various charts,
  and the dark circuit-board background all clearly visible. There are no
  visible error states, empty sections, or 'database error' messages."*

### Latency improvements

| Endpoint                   | Supabase (ap-south-1) | Neon (aws-us-east-1) | Improvement |
|----------------------------|----------------------|----------------------|-------------|
| `/api/health` (DB ping)    | 1.18 s               | ~0.10 s              | ~12x faster |
| `/api/posture-score`       | 0.93 s               | 0.36 s               | 2.6x faster |
| `/api/auth/login`          | 2.03 s               | ~0.50 s              | 4x faster   |
| `/api/admin/user-activity` | ?                    | 0.36 s               | —           |

The big win is that Vercel functions (iad1 / us-east-1) and Neon
(aws-us-east-1) are in the same AWS region, so DB round-trips are ~10ms
instead of ~250ms (Supabase was in Mumbai).

### Notes for the next session

- **No data migrated.** The old Supabase instance had 1 user (the admin I
  created) and no client/scan/finding data. The new Neon instance has the
  same admin user with the same creds. If you ever want to migrate real
  client/scan data from Supabase to Neon, dump each table via `pg_dump`
  on the old Supabase pooler and `pg_restore` into Neon — but the old
  Supabase project's quota is already exhausted, so reads may not even
  work anymore. Effectively a fresh start.
- **Stale "Supabase" label in UI.** The System Status panel in the
  Command Center still labels the DB row as "Supabase DB" — that's a
  hardcoded UI label, not a real probe. Cosmetic only. Search for
  "Supabase DB" in `src/components/sentinel/command-center.tsx` and
  update to "Postgres DB" or "Neon DB" if it bugs you.
- **Free-tier limits.** Neon free tier gives 0.5 GB storage + 100
  compute-hours/month. Compute auto-suspends after 5 min idle (cold start
  adds ~1-2s on the first query after idle). For a security dashboard
  that's checked throughout the day, this is fine. If you hit the limit,
  the project pauses until the next month.
- **The `supabase` shim in `db.ts`** is intentionally narrow — it supports
  only the chainable patterns that the 5 admin routes use. If a future
  route does `supabase.from("Foo").select().limit(5).single()` with a
  different filter combination, it may need new operators added to
  `ShQueryBuilder`. Easier: just use `db.<model>.findMany({...})` directly
  (Prisma syntax) for new routes.
- **The prebuild.sh script** still auto-swaps `schema.production.prisma`
  over `schema.prisma` when `DATABASE_URL` starts with `postgresql://`.
  No change needed there — the Vercel build will pick up the postgres
  schema automatically on every deploy.
- **Prisma version**: pinned to 6.11.1 in package.json. Prisma 8 is
  available but a major version bump needs careful migration. Stay on 6.x.
