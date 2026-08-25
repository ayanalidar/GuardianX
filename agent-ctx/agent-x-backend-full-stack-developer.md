# Task: agent-x-backend

**Agent:** full-stack-developer
**Task ID:** `agent-x-backend`
**Date:** 2026-01

## What I did

Built the Agent X backend — a knowledge base module + 3 API routes that
give GuardianX an autonomous AI security operations assistant with full
platform knowledge + LLM-with-heuristic-fallback.

The agent can:
- Greet the user by name + acknowledge last session + brief on posture
- Navigate to any of the 23 sidebar tabs
- Start SAST scans on any codebase (real DB writes + engine kick)
- Approve patches (real DB writes + cryptographic attestation chain append)
- Search findings (action returned to client for execution)
- Explain vulnerabilities from a built-in dictionary (16 topics)
- Give a status report (posture score, counts, top priority)
- Suggest next steps based on real platform state
- Open the War Room (action returned to client)
- Speak context-aware suggestions per tab

## Files created

1. **`src/lib/agent-x/knowledge.ts`** (NEW — platform knowledge base + intent parser)
   - `PLATFORM_FEATURES`: array of 60+ features (imported from `@/components/sentinel/landing/features-data`).
   - `TABS`: array of all 23 sidebar tabs with `key`, `label`, `description`, `canDo`, `aliases`. Mirrors `src/app/page.tsx` exactly (dashboard, clients, pipelines, patches, codebases, redagent, compliance, soc, exfil, scraper, dfir, rnd, advanced, forecast, quantum, constellation, modules, billing, settings, users, user-activity, content, contributors).
   - `resolveTab(text)`: maps free-text aliases (e.g. "patch queue", "vapt", "dast") to a tab key.
   - `INTENT_PATTERNS`: ordered regex patterns for each intent (war_room, approve, scan, search, status, suggest, explain, help, greet).
   - `parseIntent(message)`: pure-regex/heuristic intent parser (no LLM, no DB) that returns `{intent, target?, query?, raw}`. Handles every example case in the spec + many natural variations.
   - `buildKnowledgeContext()`: returns a string summarizing the platform for the LLM system prompt (lists all 23 tabs + top 30 features).
   - `SECURITY_TOPICS`: 16 plain-language vulnerability explanations (SQL injection, XSS, CSRF, SSRF, IDOR, RCE, LFI, RFI, Open Redirect, Auth Bypass, XXE, Deserialization, SSTI, Privilege Escalation, Mass Assignment, JWT) — each with explanation + remediation + CWE.
   - `findSecurityTopic(query)`: keyword-based topic lookup.
   - `getTimeOfDay(timezone)`: returns "morning" | "afternoon" | "evening" | "night" using `Intl.DateTimeFormat` (timezone-aware, default `Asia/Calcutta`).
   - `greetingPrefix(tod)`: friendly greeting prefix per time-of-day (incl. "Working late" for night).
   - `severityRank`, `postureGrade`: helpers.

2. **`src/lib/agent-x/state.ts`** (NEW — platform state aggregator)
   - `gatherPlatformState(userId)`: single parallel DB sweep (`Promise.all`) returning the user, pending patches, recent findings, recent scans, posture score, audit log + derived fields (topPatch, topFinding, codebaseWithMostFindings, recentActivity, lastLoginAt).
   - `computePostureScore(codebases)`: inlined mirror of `/api/posture-score` (same formula: 100 − critical*15 capped at 45 − high*8 capped at 24, +sandboxPass bonus +adversarialWin bonus +approved bonus).
   - `relativeTime`, `daysSince`: helpers for human-friendly timestamps.

3. **`src/app/api/agent-x/chat/route.ts`** (NEW — POST chat endpoint)
   - `export const dynamic = "force-dynamic"; export const maxDuration = 30;`
   - Auth via `requireAuth(req)`.
   - Body: `{ message, context?: { currentTab?, history? } }`.
   - Persists user message + assistant reply to memory vault (fire-and-forget via `onUserMessage` + `onAssistantReply`).
   - Parses intent via `parseIntent()`.
   - Gathers platform state in parallel.
   - Builds heuristic reply + actions based on intent (greet/navigate/scan/approve/status/explain/suggest/search/war_room/help/unknown). Every reply references real data (user's first name, real counts, real patch IDs, real finding titles, real codebase names).
   - For `scan` + `approve` intents, **actually executes the side-effect server-side** (mirrors `/api/voice-command` + `/api/patches/[id]/approve`):
     - scan → finds codebase by name (case-insensitive contains), prevents concurrent scans, creates Scan row + `engineFireAndForget("/api/run-sast", ...)`.
     - approve → resolves patch by `patchId` or `id` (or "last" = top pending), updates status to approved, applies patched source to codebase, appends to tamper-evident attestation chain (SHA-256 hash-chained ledger, genesis prevHash = GENESIS_PREV_HASH), writes to memory vault.
   - **LLM enhancement layer**: for `unknown` + `explain` intents, calls the Z.AI SDK (via `ensureZaiConfig()` + lazy `import ZAI from "z-ai-web-dev-sdk"`). Wrapped in `try/catch` — if the SDK throws (which it does on Vercel since `internal-api.z.ai` is unreachable from AWS us-east-1), falls back to the heuristic reply. System prompt includes the full platform knowledge + real-time state.
   - Returns: `{ reply, actions: [...], suggestions: [...], intent, context: { postureScore, postureGrade, pendingPatches, pendingCritical, criticalFindings, activeScans } }`.

4. **`src/app/api/agent-x/briefing/route.ts`** (NEW — GET activation briefing)
   - `export const dynamic = "force-dynamic"; export const maxDuration = 30;`
   - Auth via `requireAuth(req)`.
   - Called when Agent X is activated (user clicks the activation button).
   - Returns structured briefing:
     - `greeting`: time-of-day greeting ("Good morning, Ayan." / "Working late, Ayan.") + last-login ack ("Welcome back — it's been N days.") + pending-task summary + posture comment (attention if < 70, praise if ≥ 90).
     - `timeOfDay`: "morning" | "afternoon" | "evening" | "night".
     - `lastLogin`: relative time string ("2d ago" / "5h ago" / "just now").
     - `postureScore`, `postureGrade`: 0-100 + A-F.
     - `pendingTasks`: top 8 (patches + critical findings + active scans), sorted by severity (critical first) + age.
     - `criticalCount`: pending critical patches + critical findings.
     - `suggestions`: 3 proactive next-actions based on platform state.
     - `recentActivity`: last 3 user actions from audit log.
     - `activeScans`: count of in-flight scans.

5. **`src/app/api/agent-x/context/route.ts`** (NEW — GET tab-aware suggestions)
   - `export const dynamic = "force-dynamic"; export const maxDuration = 30;`
   - Auth via `requireAuth(req)`.
   - Query param: `?tab={currentTab}`.
   - Resolves the tab via `resolveTab()` (handles aliases — "patches" / "patch queue" / "patching" all → "patches").
   - Returns `{ currentTab, tabTitle, tabDescription, suggestions: [...], quickActions: [...] }`.
   - Per-tab suggestions reference real platform state (active scan count, pending patch count, top patch ID, top finding title, codebase-with-most-findings name, etc.).
   - **Covers all 23 tabs**: dashboard, clients, pipelines, patches, codebases, redagent, compliance, soc, exfil, scraper, dfir, rnd, advanced, forecast, quantum, constellation, modules, billing, settings, users, user-activity, content, contributors — each with 3 context-aware suggestions + 3 quick actions.
   - `quickActions` have shape `{ label, intent, target?, query? }` — the frontend can render them as clickable chips or speak them as voice prompts.

## Key decisions

1. **Knowledge module is pure TypeScript (no LLM, no DB)** — `parseIntent()` runs in <1ms and never fails. The LLM is only an enhancement layer for `unknown` + `explain` intents where it genuinely adds value (free-form Q&A on security topics). For all other intents (greet/navigate/scan/approve/status/suggest/search/war_room/help), the heuristic is already excellent and includes real actions that the LLM can't reliably emit as JSON.

2. **LLM-with-heuristic-fallback** — the spec required this because the Z.AI SDK only works inside the Z.ai Code sandbox (`internal-api.z.ai` is unreachable from Vercel). The chat route calls `ensureZaiConfig()` + lazy-imports the SDK, wraps in `try/catch`, and falls back to the heuristic reply on any failure. The heuristic reply is genuinely useful — it references real DB data (user's name, patch IDs, finding titles, codebase names, counts) and sounds like a competent security analyst talking, not a robot.

3. **Real side-effects for `scan` + `approve`** — when the user says "scan payment-handler.js" or "approve patch SP-2026-001", the chat route actually executes the action server-side (creates a Scan row + kicks the engine, or approves the patch + writes the attestation). This means Agent X isn't just a chatbot — it's an autonomous agent that can act. The actions array returned to the client also includes a `navigate` action so the UI can jump to the relevant tab to show the result.

4. **Single platform-state sweep in parallel** — `gatherPlatformState(userId)` runs 7 Prisma queries via `Promise.all` (user, pending patches + codebases, recent findings + targets, recent scans + codebases, client count, codebases with patches for posture, audit log). Each query is individually `.catch()`-ed so a flaky DB never poisons the whole reply — a failing query returns `[]` or `0` and the rest of the briefing still works.

5. **Posture score inlined** — same formula as `/api/posture-score` (100 − critical*15 capped at 45 − high*8 capped at 24, +sandboxPass bonus +adversarialWin bonus +approved bonus). The briefing + chat routes compute it inline via `computePostureScore()` instead of fetching `/api/posture-score` — saves a network round trip and avoids an auth-context handoff.

6. **16-topic security dictionary** — for the `explain` intent, the heuristic fallback looks up the topic in `SECURITY_TOPICS` (SQL injection, XSS, CSRF, SSRF, IDOR, RCE, LFI, RFI, Open Redirect, Auth Bypass, XXE, Deserialization, SSTI, Privilege Escalation, Mass Assignment, JWT). Each has a 2-3 sentence plain-language explanation + remediation + CWE. If the topic isn't in the dictionary, the LLM (if available) handles it; otherwise the fallback offers to navigate or search findings.

7. **Tab-aware context** — the `context` route covers all 23 tabs with specific suggestions referencing real platform state. For example, on the `patches` tab: "You have N pending patches (M critical). Say 'approve patch <id>' to action one." On the `quantum` tab: "I can scan your code for quantum-vulnerable crypto. Pick a codebase." On the `constellation` tab: "Your 3D threat map is ready. Add clients to populate it."

8. **No indigo/blue colors** (not relevant for API routes, but the spec mentioned it — confirmed no UI to worry about).

9. **Memory vault integration** — `onUserMessage` + `onAssistantReply` + `onPatchApproved` are called fire-and-forget so future sessions can recall what the user asked + what the assistant replied + which patches were approved.

## Verification

- `bun run lint` → 0 errors, 5 warnings (all pre-existing in `contributors-panel.tsx` + `service-launcher.tsx`; **zero** in any `agent-x` file).
- `bunx tsc --noEmit 2>&1 | grep -E "agent-x"` → 0 errors in any in-scope file. (Codebase-wide there are ~173 pre-existing errors in unrelated files like `src/lib/siem/correlation.ts` and `src/lib/two-factor.ts` — same baseline as the prior `public-scan` agent reported.)

## Files NOT touched (per spec)

- `src/app/page.tsx`
- `src/components/sentinel/agent-x/*` (frontend — being built by another agent)
- `src/components/sentinel/command-center.tsx`
- `src/components/sentinel/war-room/voice-control.tsx`
- `src/components/sentinel/command-center-voice.tsx`
- `src/lib/db.ts`
- `src/lib/zai-config.ts`
- `src/lib/email.ts`
- `prisma/schema.prisma` or `prisma/schema.production.prisma`
- Any file under `src/app/api/` outside `agent-x/`

## Notes for the frontend agent

- The chat route returns `actions: [{type: "navigate"|"scan"|"approve"|"search"|"war_room", target?, query?}]`. The frontend should:
  - For `navigate` → `setTab(target)` (use the tab key directly — it's already normalized).
  - For `scan` → no-op (the route already started the scan server-side); just show a toast + navigate to the codebases tab.
  - For `approve` → no-op (the route already approved server-side); just show a toast + navigate to the patches tab.
  - For `search` → navigate to the findings tab with the query pre-filled (or render the search results inline).
  - For `war_room` → open the War Room overlay (`<WarRoomOverlay open={true} />`).
- The chat route's `suggestions` array is meant to be rendered as clickable chips below the reply — clicking a chip sends it as the next message.
- The briefing route's `greeting` is meant to be spoken aloud via TTS as soon as Agent X is activated.
- The briefing route's `pendingTasks` array is meant to be rendered as a checklist — each item has `{type, id, title, severity, age}`.
- The context route's `quickActions` are meant to be rendered as a row of buttons at the top of each tab — clicking sends the action as a chat message.

## Endpoint summary

```
POST /api/agent-x/chat
  Auth: Bearer token or guardianx-token cookie (requireAuth)
  Body: { message: string, context?: { currentTab?: string, history?: {role, content}[] } }
  Returns: { reply, actions: [], suggestions: [], intent, context: { postureScore, postureGrade, pendingPatches, pendingCritical, criticalFindings, activeScans } }
  Side-effects: starts scans, approves patches (real DB writes), writes memory vault entries, optionally calls Z.AI LLM.

GET /api/agent-x/briefing
  Auth: required
  Returns: { greeting, timeOfDay, lastLogin, postureScore, postureGrade, pendingTasks: [], criticalCount, suggestions: [], recentActivity: [], activeScans }

GET /api/agent-x/context?tab={currentTab}
  Auth: required
  Returns: { currentTab, tabTitle, tabDescription, suggestions: [], quickActions: [{label, intent, target?, query?}] }
```
