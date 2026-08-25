# Task ID: agent-x-tab — Agent: full-stack-developer

## Scope
Rebuild GuardianX Agent X (`/home/z/GuardianX-web`) as a sidebar tab
(not floating drawer), interruptible streaming TTS, no per-tab
auto-explaining, 100x more sophisticated UI/UX.

## Files touched
- `src/components/sentinel/agent-x/agent-x.tsx` — REWROTE (was 1093 lines,
  now 1726 lines). Removed VoiceControl dependency; agent-x now owns its
  own SpeechRecognition + Web Audio API AnalyserNode.
- `src/app/api/agent-x/provider/route.ts` — NEW. GET endpoint returns
  `{provider: string}` from `getProviderName()` in `@/lib/llm`.
- `src/components/sentinel/agent-x/activation-button.tsx` — minor.
  Updated doc comments to reflect Agent X is now a sidebar tab.
  Kept component intact for back-compat (page.tsx still imports it).

## Key decisions
- **No more VoiceControl wrapper.** Built my own SpeechRecognition instance
  inside agent-x.tsx with onsoundstart/onspeechstart for VAD-based interrupt
  detection. The `speakingRef` gates `recognition.onend` auto-restart so TTS
  playback can't race with the mic. After utterance.onend, recognition
  restarts if it was live.
- **Streaming TTS**: replies split into sentences; first sentence spoken
  immediately, subsequent ones queued. Display also progressive — message
  bubble starts with first sentence and grows as subsequent chunks
  arrive (timed cadence).
- **Layout**: full-screen, conversation (70%) | briefing panel (30%).
  Briefing panel shows posture score with progress bar, pending patches
  list, critical findings list, recent activity. Stacks vertically on
  mobile.
- **Greeting**: fetched ONCE on first open via /api/agent-x/briefing.
  Built locally as "Good {timeOfDay}, {firstName}. {postureSummary} What
  are you up to today?". Spoken via TTS; listening only starts after
  utterance.onend (no 600ms timer race).
- **Removed** the useEffect that auto-fetched /api/agent-x/context?tab={tab}
  on tab change. currentTab is sent in the chat request body only.
- **Proactive monitoring**: 5-min poll (was 60s); compares pending PATCH
  IDs (not counts) before alerting on a new critical patch.
- **Quick actions bar**: 4 static chips ("Brief me" / "Show patches" /
  "Explain a vuln" / "What should I do next?") at the bottom, always
  visible.
- **Conversation export**: download icon in header → exports messages
  as .txt via Blob + URL.createObjectURL.
- **Provider badge**: GET /api/agent-x/provider → badge in header showing
  active LLM (OpenAI / Anthropic / Groq / OpenRouter / Z.AI / Heuristic).
- **Waveform**: real-time canvas driven by AnalyserNode.getByteFrequencyData
  on the mic stream (echoCancellation+noiseSuppression). Pauses when
  speaking; clears when not listening.
- **Message animations**: framer-motion spring-in with staggered delay,
  3-dot thinking precursor.
- **open/onClose back-compat**: open={false} renders null; open={true}
  renders full-screen tab. onClose is preserved in props interface
  but a no-op (tab system controls visibility).

## Lint result
`bun run lint` → 0 errors, 0 warnings in agent-x files. (5 pre-existing
warnings in other files: contributors-panel.tsx + service-launcher.tsx.)

## TSC result
`bunx tsc --noEmit 2>&1 | grep -E "agent-x|provider/route|activation-button"`
→ 0 errors. (173 pre-existing errors in other files I'm not allowed to
touch — lib/siem/*, lib/two-factor.ts, etc.)

## Constraints honored
- TypeScript strict ✓
- "use client" on agent-x ✓
- shadcn/ui (Button, Input, Badge, Skeleton) ✓
- lucide-react icons ✓
- framer-motion animations ✓
- No indigo/blue colors (emerald/cyan/amber/rose/zinc only) ✓
- Dark theme (bg zinc-950) ✓
- Mobile-first responsive (briefing stacks below on mobile) ✓
- Design tokens reused: holo-card-sharp, hud-corners, neon-emerald, pulse-dot ✓

## Files NOT touched (per task constraints)
- src/app/page.tsx
- src/components/sentinel/command-center.tsx
- src/components/sentinel/war-room/voice-control.tsx
- src/components/sentinel/landing/agent-x-showcase.tsx
- src/components/sentinel/animated-demo.tsx
- src/app/solutions/page.tsx, architecture/page.tsx, company/page.tsx
- src/lib/db.ts, llm.ts, zai-config.ts
- prisma/schema.prisma, schema.production.prisma

## How the central coordinator should mount AgentX
Since the parent (page.tsx) currently mounts `<AgentX open={agentXOpen} ... />`
as a floating element at the bottom of ConsoleView, the coordinator may
want to either:
(a) Render AgentX inside the main content area when `tab === "agent-x"`
    by setting `agentXOpen = (tab === "agent-x")` and unmounting it
    otherwise, OR
(b) Add "agent-x" to the sidebar tab list and conditionally render the
    AgentX component in the main content slot for that tab.

Both approaches work because AgentX now renders `h-full w-full` and
returns `null` when `open={false}`.
