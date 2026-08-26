# Task: vapt-business-logic

**Agent:** full-stack-developer
**Scope:** GuardianX Next.js web app at `/home/z/my-project` (the project is
labeled `/home/z/GuardianX-web` in the task brief, but the actual repo on disk
lives at `/home/z/my-project` — they are the same GuardianX codebase).

## Goal

Build GuardianX's **Business Logic Testing** engine — AI understands the
target's API schema and tests for:

- Authorization bypass (IDOR/BOLA — accessing other users' resources)
- Price/quantity manipulation (negative prices, zero quantities, overflow)
- Workflow bypass (skipping steps in a multi-step process)
- Rate-limit bypass (sending many requests rapidly)
- Privilege escalation (accessing admin endpoints as a regular user)
- Mass assignment (setting fields the user shouldn't control)

These are the vulnerability classes traditional scanners miss because they
require reasoning about the application's domain logic.

## Files created

1. `src/app/api/vapt/business-logic/route.ts` — auth-required POST route,
   `maxDuration=30`, `force-dynamic`. Creates an Engagement row, discovers
   API endpoints (parses OpenAPI JSON / endpoint list, or probes 16 common
   API paths), uses the Z.AI LLM (via a local `chatWithFallback`
   equivalent — see "LLM note" below) to generate 10 tailored test cases,
   executes each with a 5s `AbortController` timeout, matches the response
   against the test's `failureIndicator` (regex/keyword), persists a
   `Finding` row for each confirmed vuln (with CWE mapped into the
   `owasp` field + description), then returns a summary + per-test results
   + category breakdown.
2. `src/components/sentinel/business-logic-testing.tsx` — `"use client"`
   full-screen tab view. Header with Brain icon + "BUSINESS LOGIC TESTING"
   + emerald accent. Input form (target URL + optional OpenAPI spec
   textarea) + Run button. Animated progress bar with live phase label
   (discovering → generating → executing) while the API is in flight.
   Results: summary cards (Tested / Vulnerable / Critical / High),
   category breakdown bar chart (recharts — Tested vs Vulnerable per
   category, color-coded per vuln class), live test execution log
   (PASS/FAIL with category icon + payload preview), findings table
   (severity badge, title, endpoint, CWE, payload, expandable proof),
   discovery log. Dark theme, emerald/amber/red/cyan/rose/violet accents
   (NO indigo/blue), hud-corners, mobile-first responsive (table on
   desktop → stacked cards on mobile).

## LLM note

The task brief says `src/lib/llm.ts` exports `chatWithFallback`,
`detectProvider`, `getProviderName`. That file does **not** exist in the
current checkout of the repo, and the task constraints explicitly forbid
touching `src/lib/*`. I therefore implemented a local `chatWithFallback`
equivalent inside the route file that wraps the Z.AI SDK directly (the same
pattern already used by `/api/business-logic-test` and `/api/auto-remediation`).
If `src/lib/llm.ts` is later added by another agent, my route can be trivially
migrated to import `chatWithFallback` from there.

## Heuristic fallback

If the LLM is unavailable (Vercel prod without Z.AI keys, network error,
unparseable response), the route falls back to 10 hardcoded test patterns
covering each of the 6 vuln classes:
- IDOR × 2 (user ID swap + order ID enumeration)
- Price manipulation × 3 (negative price, zero price, quantity overflow)
- Workflow bypass × 2 (checkout without cart, payment without payment record)
- Rate limit × 1 (50 rapid login attempts — checks if any 429 was returned)
- Privilege escalation × 1 (admin/users without auth)
- Mass assignment × 1 (role=admin on profile update)

The fallback still executes the HTTP requests and applies the failure
indicators, so even without an LLM the engine produces useful findings.

## SSRF guard

`rejectPrivateHost()` rejects:
- `localhost`, `*.localhost`
- `0.0.0.0`, `::`, `::1`
- IPv4 ranges: `10.x`, `127.x`, `0.x`, `169.254.x` (link-local + cloud
  metadata), `172.16-31.x`, `192.168.x`, `100.64-127.x` (CGNAT)
- `*.internal`, `*.local`, `metadata.google.internal`

Checked on the parsed target URL AND on each test-case endpoint (LLM may
emit other hosts).

## Severity + CWE map

| Category              | Severity  | CWE      |
| --------------------- | --------- | -------- |
| idor                  | high      | CWE-639  |
| price_manipulation    | critical  | CWE-841  |
| workflow_bypass       | high      | CWE-841  |
| rate_limit            | medium    | CWE-770  |
| privilege_escalation  | critical  | CWE-269  |
| mass_assignment       | high      | CWE-915  |

CWE is stored in the Finding's `owasp` field (the Prisma `Finding` model has
no `cwe` column — it has `owasp` — and the task forbids touching `prisma/*`).
CWE is also embedded in the `description` text.

## Engagement lifecycle

- Creates Engagement with `status: "running"`, `stageLabel: "business-logic"`.
- Auto-creates a `Target` row if one doesn't exist for the parsed base URL
  (Target is the FK parent of Engagement and is non-nullable).
- On success: updates to `status: "completed"` + `crawlSummary` (discovery
  log) + `completedAt`.
- On error: updates to `status: "failed"` + `crawlSummary` = error message.

## Verification

- `cd /home/z/my-project && bunx eslint src/components/sentinel/business-logic-testing.tsx src/app/api/vapt/business-logic/route.ts --max-warnings=0` → **EXIT 0**, 0 errors, 0 warnings.
- `cd /home/z/my-project && bunx tsc --noEmit 2>&1 | grep -E "business-logic|vapt/business"` → **0 lines** (my files have 0 type errors; the only tsc errors are 2 pre-existing lines in `index.ts`, the sentinel-engine stub at repo root, which is out of scope).
- Did NOT commit or push.

## Notes for the next session

- The component is **not mounted** in `src/app/page.tsx`. The central
  coordinator (parent task) is responsible for adding it to the sidebar
  NavGroups + tab-content switch. It exports `BusinessLogicTesting`
  (default + named) ready for `<BusinessLogicTesting />` mounting.
- The route creates `Target` rows on demand if no matching `baseUrl` is
  found. If the parent task wants to constrain targets to a specific
  client, it should pre-create the Target row and pass its URL.
- The route uses `db.target.findFirst` + `db.target.create` — both go
  through the Supabase REST shim in `src/lib/db.ts`. Both already work
  without changes.
- The `chatWithFallback` shim wraps `ZAI.create()` lazily (cached) — same
  pattern as `/api/business-logic-test/route.ts`. If the LLM throws, the
  route falls through to the heuristic test patterns, so the engine still
  returns useful results on Vercel without Z.AI keys.
- `next.config.ts` already has `optimizePackageImports: ["lucide-react",
  "framer-motion", "recharts"]` so the heavy imports in the component are
  tree-shaken in dev.
