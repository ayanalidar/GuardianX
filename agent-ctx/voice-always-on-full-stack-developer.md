# Task: voice-always-on

**Agent:** full-stack-developer
**Task ID:** `voice-always-on`
**Date:** 2026-01

## What I did

Added continuous (always-on) voice mode to the GuardianX voice control
component, plus a new floating CommandCenterVoiceBar wrapper that mounts
voice control across the whole Command Center (not just inside the War
Room overlay).

## Files touched

- `src/components/sentinel/war-room/voice-control.tsx` (edited — added
  `continuous` prop, `onStateChange` prop, `userStoppedRef`, auto-restart
  in `onend`, per-final-chunk dispatch in continuous mode, floating
  top-center "● LISTENING" status chip, CONTINUOUS badge, branched idle
  hint text, `VoiceControlState` export).
- `src/components/sentinel/command-center-voice.tsx` (NEW —
  `CommandCenterVoiceBar` wrapper, dark theme, mobile-first, 'V'
  shortcut to toggle mic, spring-in transcript panel above the chip).

## Key decisions

1. **Auto-restart in `onend`, not from a separate polling loop** — Chrome
   ends continuous SpeechRecognition sessions after ~60s even with
   `continuous=true`. Calling `rec.start()` from inside `onend` (when
   `!userStoppedRef.current`) is the standard resilience pattern. Wrapped
   in `try/catch` with a 250ms retry for `InvalidStateError` if `start()`
   is called too quickly.
2. **Per-final-chunk dispatch in continuous mode** — instead of
   accumulating the whole session transcript and dispatching on `onend`
   (which could be never if the user keeps talking), each `isFinal` chunk
   fires `dispatchCommand(parseVoiceCommand(chunk))` immediately. Single-
   shot mode keeps the original "flush on `onend`" path so hold-SPACE
   phrases still dispatch as one command.
3. **`userStoppedRef` set BEFORE `stop()`/`abort()`** — both in
   `stopListening()` and the unmount cleanup, so the `onend` they
   trigger doesn't try to auto-restart a dying/dead session.
4. **Hide VoiceControl's own UI inside the wrapper** (`sr-only`) and
   provide my own mic button + transcript panel — keeps the chip
   visually unified while still letting VoiceControl own the
   SpeechRecognition instance and render its floating top-center status
   indicator (which is `position: fixed` and escapes any parent hiding).
5. **`'V'` keyboard shortcut** skips inputs/textarea/contentEditable and
   any modified 'v' (Ctrl+V, Cmd+V, Alt+V).
6. **No indigo/blue** anywhere — pure emerald/zinc/amber palette per the
   design constraints.

## Verification

- `bun run lint` → 0 errors, 8 warnings (all pre-existing in unrelated
  files; none in touched files).
- `bunx tsc --noEmit` filtered to `voice-control` and
  `command-center-voice` → 0 errors.

## Files NOT touched (per task constraints)

- `src/app/page.tsx`
- `src/components/sentinel/command-center.tsx`
- `src/components/sentinel/war-room/gesture-control.tsx`
- `src/components/sentinel/war-room/war-room-overlay.tsx`
- `src/components/sentinel/landing/features-data.ts`
- `src/components/sentinel/modules-overview.tsx`
- `src/lib/db.ts`

## Notes for downstream agents

- The Command Center (`src/components/sentinel/command-center.tsx`)
  needs to mount `<CommandCenterVoiceBar onCommand={handleVoiceCommand} />`
  once at its root to actually wire this in. When that lands, the bar
  will just start working.
- The `'V'` shortcut in CommandCenterVoiceBar will collide with the
  immersive-view 'V' toggle in `ai-visualizer/immersive-view.tsx`. Both
  fire simultaneously. May need reconciliation.
