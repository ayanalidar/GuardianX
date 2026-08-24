# warroom-voice-gesture — Voice + Gesture Control for the GuardianX War Room

**Task ID:** `warroom-voice-gesture`
**Agent:** claude (main session)
**Date:** 2026-08-24
**Repo:** `/home/z/GuardianX-web` (Next.js 16 / App Router)

## What was built

Tri-modal (voice + gesture + mouse) control for the GuardianX War Room,
inspired by `jaredrhod/backtalk` (voice) and `jaredrhod/barehands`
(gesture). Both source repos are Python/HTML reference implementations;
this work ports their *interaction vocabulary* onto pure browser APIs so
they run inside the existing Next.js dashboard with no extra services.

### Files added

1. **`src/components/sentinel/war-room/voice-control.tsx`** — backtalk-
   inspired voice interface built on the native Web Speech API.
   - STT via `window.webkitSpeechRecognition` (Chrome/Edge).
   - TTS via `SpeechSynthesisUtterance` (cross-browser).
   - No Python server, no API keys, no external deps.
   - Push-to-talk: hold SPACE, or click the mic.
   - Voice commands (parsed locally via `parseVoiceCommand`):
     - `scan <codebase>` → triggers a scan
     - `show <tab>` → navigates to a tab
     - `search findings for <query>` → filters findings
     - `approve patch <id>` → approves a patch
     - `what's the security posture?` → reads posture aloud
     - `stop` → cancels TTS playback
   - Waveform animation (24-bar, framer-motion driven) when listening.
   - Status ring color: green (idle) / red (listening) / amber (speaking).
   - Imperative handle exposes `speak`, `stopSpeaking`, `startListening`,
     `stopListening`, `isSupported` to the parent overlay.
   - Feature detection via `useSyncExternalStore` (no setState-in-effect).
   - Stale-closure bug for the `onend` transcript fixed with a
     `latestTranscriptRef` mirror (React Compiler-friendly).

2. **`src/components/sentinel/war-room/gesture-control.tsx`** —
   barehands-inspired hand tracking on `@mediapipe/hands` +
   `@mediapipe/camera_utils` (npm packages, types shipped).
   - WASM assets loaded from jsDelivr CDN via `locateFile`.
   - Gestures:
     - **Pinch** (thumb-index < 0.055 normalized) → synthetic click on
       the element under the cursor (walks up to closest clickable
       ancestor: `button`, `[role="button"]`, `[role="tab"]`,
       `[data-gx-clickable]`).
     - **Swipe** (wrist x travels > 0.32 in < 380ms) → tab nav via
       `onGesture({kind:"swipe", direction})`.
     - **Open palm** (4+ fingers extended) → vertical scroll.
     - **Fist** (0 fingers extended, thumb in) → dispatches a synthetic
       ESC KeyboardEvent + `onGesture({kind:"fist"})`.
     - **Two-hand pinch** → zoom (delta between two index tips).
   - Fixed-position cursor (spring-animated) tracks the index fingertip.
   - Small camera preview (160×120) in the corner with hand-landmark
     skeleton overlay (toggleable).
   - Graceful degradation: camera-permission / WebGL / model-load
     failures show a friendly "OFFLINE" chip, the rest of the War Room
     keeps working with voice + mouse.

3. **`src/components/sentinel/war-room/war-room-overlay.tsx`** —
   fullscreen tri-modal overlay that combines:
   - The `CircuitBoard` visualizer (from `ai-visualizer/`) as a
     background at 55% opacity.
   - Voice control card (toggleable with `V`).
   - Gesture control card (toggleable with `G`).
   - Tab strip: overview / clients / patches / findings / system
     (cycleable with `← →`, voice "show <tab>", or gesture swipe).
   - Live scan terminal (bottom-left) — reads from `useSignalBus()`.
   - KPI tiles, client pipeline cards, pending-patch list with inline
     approve buttons, critical-findings feed with voice-driven filter,
     system-status grid.
   - Closes on ESC, the Exit button, or a fist gesture.
   - Header shows live visualizer state, posture score, clock.
   - Voice commands are wired through `handleVoiceCommand`: scan looks
     up the codebase by name (case-insensitive substring) and POSTs
     `/api/scans`; approve POSTs `/api/patches/[id]/approve`; search
     filters the in-memory findings list; status reads `/api/posture-
     score` aloud via the voice handle.
   - Gesture `swipe` cycles views, `fist` closes the overlay.

4. **`src/app/api/voice-command/route.ts`** — POST endpoint, `requireAuth`-
   gated. Accepts either a pre-parsed command (`{command: {action, target}}`)
   or a raw transcript (`{transcript: "scan cybershield"}`). Mirrors
   `parseVoiceCommand` server-side so external clients (mobile, CLI,
   agents) parse identically. Handlers:
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
   - Returns `{ok, action, message, ...payload}` per the task spec.

### Files modified

5. **`src/components/sentinel/command-center.tsx`** — wired the new
   `WarRoomOverlay` behind the existing "War Room" button. The legacy
   `WarRoomMode` (auto-cycling 3-view fullscreen) is replaced by a
   `_WarRoomModeLegacyStub` (kept as a no-op so any external import
   still resolves). The War Room button now opens the tri-modal
   overlay; the Immersive View button (circuit board only) is unchanged.

### Constraints honored

- Voice uses **pure browser Web Speech API** — no Python server
  (backtalk's Whisper/Kokoro path is replaced by SpeechRecognition +
  SpeechSynthesis).
- Gesture uses **`@mediapipe/hands` + `@mediapipe/camera_utils` npm
  packages** (the task-specified legacy packages, not `tasks-vision`
  which barehands itself uses — these ship first-class TS types and a
  `Camera` rAF helper that fit the React lifecycle better).
- Both new components are **`"use client"`**.
- **Dark theme, emerald accents** throughout — no indigo/blue.
- Works in **fullscreen mode** (the overlay is `fixed inset-0 z-[150]`,
  body scroll locked, ESC to exit).
- All three input modes (voice OR gesture OR mouse) reach the same
  actions — voice `show patches` and gesture `swipe right` both call
  `cycleView(1)`; voice `approve patch X` and mouse-clicking the
  Approve button both POST `/api/patches/[id]/approve`.

### Verification

- `bun run lint` → **0 errors, 5 warnings** (all pre-existing in
  `contributors-panel.tsx` + `service-launcher.tsx`, unrelated).
- `bunx tsc --noEmit -p tsconfig.json` filtered to the touched files
  → **0 errors**. (Two initial TS errors in `gesture-control.tsx`
  where `wristHistory` was typed `{x,t}` but palm-scroll pushed `{x,y,t}`
  — fixed by widening the type to `{x,y,t}`.)
- One React Compiler error in `voice-control.tsx` (`setState-in-effect`
  for the `supported` flag) fixed by switching to `useSyncExternalStore`
  for feature detection.
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
