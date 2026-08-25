# Task ID: agent-x-frontend
# Agent: full-stack-developer
# Date: 2026-01

## Scope

Built the **Agent X frontend** — an always-on conversational AI panel +
dashboard header activation button for the GuardianX Command Center.
Replaces the existing `CommandCenterVoiceBar` with a sophisticated,
TTS-talkback, continuous-listening SOC analyst assistant.

## Work Log

1. **Read context** — read the worklog at `/home/z/my-project/worklog.md`
   to understand prior work (jaredrhod-integration, siem, dfir, ai-ops
   modules). Reviewed the existing `VoiceControl` component at
   `src/components/sentinel/war-room/voice-control.tsx` to understand
   the imperative handle (`speak`, `startListening`, `stopListening`,
   `isSupported`) + `onCommand` callback contract.

2. **Built `agent-x.tsx`** — the main AgentX panel component (1093 lines):
   - Mounts `<VoiceControl continuous speakResponses={false} compact>`
     visually-hidden (sr-only) — reuses VoiceControl's SpeechRecognition
     instance + auto-restart-in-`onend` behavior for always-on listening,
     but bypasses VoiceControl's own `speakResponses` so we can speak
     our own LLM reply with a slower, lower-pitched voice persona.
   - Custom `speakReply()` uses `SpeechSynthesisUtterance` directly with
     rate=0.95, pitch=0.85, and a male-coded en voice picker
     (David/Alex/Daniel/Fred/etc.) for an authoritative SOC persona.
   - On open: fetches `/api/agent-x/briefing`, speaks the personalized
     greeting aloud, drops a "briefing" message into the conversation,
     and auto-starts continuous listening after a 600ms delay (so the
     mic doesn't capture the greeting's own TTS output).
   - VoiceCommand handler reconstructs synthetic transcripts for
     built-in intents (scan / navigate / approve / search / status) so
     the Agent X LLM stays in the loop. `stop` cancels TTS locally.
   - Tab-aware context: fetches `/api/agent-x/context?tab={currentTab}`
     on tab change and surfaces 2-4 quick-reply chips.
   - Proactive monitoring: polls `/api/agent-x/briefing` every 60s;
     if pending patches appeared or posture score dropped, speaks a
     heads-up aloud + drops an `alert` message into the conversation.
   - Conversation history: last 20 messages persisted to
     `localStorage` (`agent_x_conversation`); restored on first open
     with a "Picking up where we left off…" banner.
   - Text input fallback for browsers without SpeechRecognition.
   - Visual: floating panel `fixed bottom-20 right-4 z-[90]`, dark
     glass (`bg-zinc-950/90 backdrop-blur-xl border border-emerald-500/30
     rounded-xl`) with `hud-corners` corner brackets. Header has Bot
     icon + pulsing dot + "ACTIVE" badge + close button. Body has
     scrollable messages (max-h-80, custom-scrollbar), 3-bounce
     thinking dots, animated waveform when listening, pulsing radio
     icon when speaking. Briefing strip shows posture score / patches
     / critical count with tone-aware coloring.
   - ESC closes panel (defers to VoiceControl's ESC-to-stop-listening
     when mic is hot).
   - Cleanup TTS + listening on close + unmount.

3. **Built `activation-button.tsx`** — `AgentXActivationButton` (117
   lines): dashboard header toggle.
   - Small (`h-8 px-2.5 text-[10px]`) button with Bot icon.
   - Inactive state: subtle zinc border, dim Bot icon.
   - Active state: emerald glow, pulsing dot via `pulse-dot` token,
     "ACTIVE" badge.
   - Tooltip: "Activate Agent X (X)" / "Deactivate Agent X".
   - Owns the **'X' keyboard shortcut** — toggles Agent X via `onClick`
     when not focused in an input/textarea/contenteditable and no
     modifier keys held (so Ctrl+X cut, Cmd+X, Alt+X don't trigger).
   - Reuses shadcn `Tooltip` + `motion` from framer-motion.

4. **Built `index.ts`** — barrel export for `AgentX` +
   `AgentXActivationButton` + their props types. Also re-exports
   `AgentX` as the default for ergonomic imports.

5. **Linted + type-checked**:
   - `bun run lint` — 0 errors, 0 warnings in the 3 agent-x files
     (5 pre-existing warnings remain in `contributors-panel.tsx` and
     `service-launcher.tsx` — untouched).
   - `bunx tsc --noEmit` — 0 type errors in agent-x files (other
     pre-existing errors in `ai-ops/`, `siem/`, `two-factor.ts` are
     untouched).

## Stage Summary

### Files created

- `src/components/sentinel/agent-x/agent-x.tsx` (NEW, 1093 lines)
- `src/components/sentinel/agent-x/activation-button.tsx` (NEW, 117 lines)
- `src/components/sentinel/agent-x/index.ts` (NEW, 16 lines)

### Files NOT touched (per task constraints)

- `src/app/page.tsx` — central coordinator mounts Agent X + activation button.
- `src/components/sentinel/command-center.tsx` — untouched.
- `src/components/sentinel/command-center-voice.tsx` — central coordinator
  replaces with Agent X.
- `src/components/sentinel/war-room/voice-control.tsx` — imported, not modified.
- `src/app/api/agent-x/*` — parallel agent builds the backend.
- `src/lib/agent-x/*` — parallel agent builds the agent lib.
- `src/lib/db.ts`, `src/lib/zai-config.ts`, `prisma/schema*.prisma` — untouched.

### Key decisions

1. **Reuse VoiceControl as STT/TTS primitive, NOT use its `speakResponses`**.
   VoiceControl's own `speak()` uses rate=1.05 / pitch=0.95. Agent X is
   a "sophisticated + lethal" SOC analyst — we want slower + lower-pitched,
   so we run our own `SpeechSynthesisUtterance` directly with rate=0.95
   / pitch=0.85 and a male-coded voice picker. The local `speakingLocal`
   flag tracks our own TTS playback.

2. **Reconstruct synthetic transcripts for built-in VoiceCommands**
   (scan / navigate / approve / search / status). VoiceControl's parser
   strips intent + target apart; we rebuild a short utterance so the
   Agent X LLM stays in the loop and produces a contextual reply. Only
   `stop` short-circuits to local TTS cancellation.

3. **'X' keyboard shortcut lives in the activation button**, not in
   AgentX. AgentX receives only `open` + `onClose` (no `onOpen`), so it
   cannot self-toggle. The activation button is always mounted in the
   header, so 'X' works whether or not the panel is currently open.

4. **Briefing API contract mirror types** declared locally in
   `agent-x.tsx` — the backend (`/api/agent-x/briefing`, `/chat`,
   `/context`) is built by a parallel agent. We don't import shared
   types from `src/lib/agent-x/*` (that path is owned by the parallel
   agent) to avoid coupling + race conditions. The local mirror types
   are tolerant of optional fields so the panel degrades gracefully
   when the backend is still bootstrapping.

5. **Proactive monitoring baseline refs**: `lastPatchCountRef` /
   `lastPostureScoreRef` are seeded on the first briefing fetch so we
   don't false-alarm on the very first poll. Subsequent polls compare
   against the last seen value.

6. **Conversation persistence to localStorage** (`agent_x_conversation`)
   + restore-on-first-open with a "Picking up where we left off…"
   banner. Restored only ONCE per mount so re-opening after a close
   keeps the in-memory conversation.

7. **Visual tokens**: reused `hud-corners`, `pulse-dot`, `neon-emerald`,
   `custom-scrollbar` from `globals.css`. NO `holo-card-sharp` (its
   gradient bg would conflict with the dark glass spec).

### Lint result

```
$ bun run lint
✖ 5 problems (0 errors, 5 warnings)  ← all pre-existing, none in agent-x
```

```
$ bunx tsc --noEmit 2>&1 | grep agent-x
(no output — 0 type errors in agent-x files)
```
