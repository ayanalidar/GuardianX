# Task: voice-unify-agent-x-v2

**Agent:** full-stack-developer
**File touched:** `src/components/sentinel/agent-x/agent-x.tsx` (only)

## Goal

Port `agent-x.tsx` to consume the shared `useSpeechRecognition` hook (at
`src/hooks/use-speech-recognition.ts`) instead of duplicating Web Speech
API types, `getSpeechRecognitionCtor`, `pickPersonaVoice`,
`splitIntoSentences`, and a hand-rolled SpeechRecognition + Web Audio +
TTS lifecycle.

## Plan

1. Strip the duplicated Web Speech types + helpers (top-level).
2. Remove inline voice refs (`ctorRef`, `recRef`, `voicesRef`,
   `audioCtxRef`, `analyserRef`, `micStreamRef`) and the
   feature-detection effect — all owned by the hook now.
3. Wire `const voice = useSpeechRecognition({...})` with
   `onFinalTranscript → sendMessage(text)` and `onInterim → setInterim`.
4. Replace `ensureRecognition` / `startListening` / `stopListening` /
   `micToggle` / `ensureMicAnalyser` / `stopMicAnalyser` / `speakChunked` /
   `stopSpeaking` with `voice.start` / `voice.stop` / `voice.toggle` /
   `voice.speak` / `voice.stopSpeaking`.
5. Replace the waveform render-loop effect with the slim
   `drawWaveform(voice.analyser, ctx2d, w, h)` version (pattern from
   `war-room/voice-control.tsx`).
6. Refactor greeting flow: set `pendingPostGreetingListenRef = true`
   before `voice.speak(greeting)`; add a `useEffect` watching
   `voice.speaking` true→false to fire `voice.start()` once.
7. Refactor proactive poll + `sendMessage` to use `voiceRef.current.speak`.
8. Remove the now-redundant cleanup-on-unmount effect (hook owns it).
9. Update JSX to read `voice.listening` / `voice.speaking` /
   `voice.supported` / `voice.error` directly; keep a local `interim`
   state mirrored via `onInterim`.

## Verification

- `bunx tsc --noEmit` reports 0 errors mentioning `agent-x` or
  `use-speech-recognition`.
- No references to `SpeechRecognitionLike`, `getSpeechRecognitionCtor`,
  `pickPersonaVoice`, `splitIntoSentences`, `ensureRecognition`,
  `ensureMicAnalyser`, `stopMicAnalyser`, `speakChunked` remain in
  agent-x.tsx.
