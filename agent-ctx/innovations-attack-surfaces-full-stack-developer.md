# innovations-attack-surfaces — work record

## Scope
Build 2 innovations targeting novel attack surfaces in GuardianX-web:
1. **AI Prompt Injection Scanner** — probes OpenAI-compatible LLM endpoints
   with 24 adversarial prompts (leakage / jailbreak / tool_hijack /
   exfiltration / override) and reports PASS/FAIL per test.
2. **Deepfake Phishing Simulator** — sends CEO-impersonation phishing
   simulations, plays a TTS deepfake of the phishing message when the target
   clicks, tracks who clicked, trains the clickers.

## Files created
- `src/lib/prompt-injection-tests.ts` — 24 tests + `evaluateResponse` +
  `INJECTION_CATEGORY_META`.
- `src/app/api/prompt-injection/scan/route.ts` — POST, `requireAuth`. 5s
  per-test + 10s overall timeouts via AbortController + Promise.race.
  Persists summary to `AuditLog`.
- `src/app/api/prompt-injection/runs/route.ts` — GET, `requireAuth`. Returns
  last 50 scan summaries from AuditLog.
- `src/app/api/deepfake-phishing/send/route.ts` — POST, `requireAdmin`.
  Creates PhishingSimulation row + dispatches phishing email via
  `sendEmail()` with link to `/phishing/sim?id=...`.
- `src/app/api/deepfake-phishing/track/route.ts` — POST, PUBLIC. Marks the
  simulation clicked when the target lands on the sim page.
- `src/app/api/deepfake-phishing/list/route.ts` — GET, `requireAuth`. Lists
  all simulations + click/training stats.
- `src/app/phishing/sim/page.tsx` — PUBLIC page. Fake CEO video call UI +
  Web Speech API TTS of the phishing message → 5s later reveals "this was a
  simulation" → 4-step inline training.
- `src/components/sentinel/prompt-injection-scanner.tsx` — full-screen tab
  view. Form + progress bar + live test list + summary tiles + category
  bar chart + history table.
- `src/components/sentinel/deepfake-simulator.tsx` — admin tab. Summary
  tiles + create form + click-rate donut chart + campaigns table.

## Files edited
- `prisma/schema.prisma` — added `PhishingSimulation` model.
- `prisma/schema.production.prisma` — same model (mirror).
- `src/middleware.ts` — added PUBLIC_ROUTES: `/api/deepfake-phishing/track`,
  `/api/canary/check`, `/api/canaries/check`.

## Verification
- `bunx prisma generate` ✔ (Prisma Client v6.19.2 now recognizes
  `db.phishingSimulation`).
- `bunx tsc --noEmit 2>&1 | grep -E "prompt-injection|deepfake|phishing"` →
  0 errors in any of my files.
- `bun run lint` → 0 errors, 5 pre-existing warnings in
  `contributors-panel.tsx` and `service-launcher.tsx` (out of scope).

## Notes for the next session
- The 4 persona presets in `deepfake-simulator.tsx` are hardcoded; consider
  extracting to a `phishing-personas.ts` lib if more are needed.
- The phishing sim page uses the Web Speech API (browser-side TTS), so no
  server-side audio generation is required — this matches the task spec.
- The 10s overall timeout on `/api/prompt-injection/scan` is conservative;
  if the user wants to scan slower endpoints, bump `OVERALL_TIMEOUT_MS` and
  `maxDuration` together.
- I did NOT touch `src/lib/db.ts`'s `TABLE_TO_MODEL` map (the supabase shim)
  because (a) I can't touch that file, and (b) my routes use Prisma Client
  directly (`db.phishingSimulation.*`) — no shim needed.
