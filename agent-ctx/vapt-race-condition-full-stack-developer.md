# vapt-race-condition — work record

## Scope
Build **Race Condition Testing** for GuardianX-web:
1. **API route** — `POST /api/vapt/race-condition` (auth-required, `maxDuration=30`,
   `force-dynamic`) that fires concurrent requests to a target URL using
   `Promise.all` + `AbortController` to detect TOCTOU vulnerabilities
   (double-spend, duplicate submissions, concurrent balance deductions,
   rate-limit races, coupon abuse).
2. **Component** — full-screen tab view with input form, live counter,
   big number tiles, scatter-chart timeline, response-distribution pie chart,
   and findings table. Dark theme with amber/red accents, hud-corners.

## Files created
- `src/app/api/vapt/race-condition/route.ts` (NEW, ~470 LOC)
  - `requireAuth` guard, SSRF guard (rejects private/loopback/link-local IPs
    incl. 169.254.0.0/16, 127.0.0.0/8, ::1, fc00::/7, metadata.google.internal).
  - Creates a synthetic `Target` + `Engagement` row (via `db.target.create`
    + `db.engagement.create`) — `Engagement.targetId` is NOT NULL, so a
    synthetic target is required.
  - Runs 5 race-condition tests sequentially using `fireConcurrent()`:
    1. **Double-Spend** (50 concurrent) — all succeed → critical CWE-362,
       >1 → medium, ==1 → safe.
    2. **Duplicate Submission** (50 concurrent POSTs with identical body) —
       >1 succeed → critical CWE-362.
    3. **Concurrent Balance Deduction** (20 concurrent POSTs amount=100) —
       total deducted > 100 → critical CWE-362.
    4. **Rate-Limit Race** (100 concurrent) — 0 blocked → medium CWE-770.
    5. **Coupon Abuse** (20 concurrent same-coupon POSTs) — >1 succeed →
       high CWE-362.
  - For each confirmed race condition, calls `db.finding.create` with
    `title`, `severity`, `category`, `owasp` (CWE), `endpoint`, `method`,
    `description`, `proofRequest`, `proofResponse` (sample response body
    truncated to 1200 chars), `payload`, `confidence`, `remediation`.
  - Returns `{ engagementId, testsRun, raceConditionsFound, findings, tests,
    distribution, totalFired, totalSucceeded }`. Each test includes a
    `timeline: { index, durationMs, status, testName }[]` for the scatter
    chart.
- `src/components/sentinel/race-condition-testing.tsx` (NEW, ~880 LOC)
  - `"use client"` full-screen tab view.
  - Header: "RACE CONDITION TESTING" with `Zap` icon (amber), animated ping,
    `CWE-362` + `CWE-770` badges.
  - Form: target URL input, method `Select` (GET/POST/PUT/PATCH/DELETE/HEAD),
    request body `Textarea`, headers `Textarea` (key:value), concurrency
    `Slider` (10-200, step 5).
  - "Fire Concurrent Requests" button (amber-accent, monospace).
  - While running: live counter card with 3 stats — Fired / Completed /
    Successful — animated via `setInterval` toward `concurrency * 5`
    expected total.
  - After run:
    - 3 big number tiles: Requests Fired, Successful Responses, Race
      Conditions Detected (amber / emerald / red).
    - Scatter chart (recharts `ScatterChart` + 5 `Scatter` series colored
      red/orange/amber, X = request index, Y = latency ms, dashed red
      reference line at 10s timeout threshold).
    - Findings table (shadcn `Table`) — test name + cwe, concurrency,
      successes (highlighted red if >1), detected (yes/no with shield icon),
      severity badge.
    - Response distribution pie chart (recharts `PieChart` — 200 OK
      emerald, 4xx amber, 5xx red, timeout zinc).
    - Confirmed findings list (red-accented) when `raceConditionsFound > 0`.
    - "No race conditions detected" banner (emerald) when safe.
  - Empty state with `Zap` icon and 5 test-name badges.
  - Dark theme throughout (`bg-zinc-950`, `bg-zinc-900/40`), amber + red
    accents, hud-corners on every major section. Mobile-first responsive
    (single column on mobile, 2-3 column grid on `md`/`lg`).
  - `framer-motion` for section transitions and tile entrance animations.

## Files NOT touched (as required)
- `src/app/page.tsx`, `src/lib/*`, `prisma/*`, `war-room/*`, existing API
  routes — untouched. The `package.json` was already augmented with the
  `lint` script by the environment (I did not modify it).

## Implementation notes
- `chatWithFallback` does not exist in the codebase — the task mentioned
  it as part of "existing infra", but only `db` and `requireAuth` are
  actually available. The race-condition analysis is rule-based (status
  code + success-count heuristics), so no AI call is needed.
- The Supabase dispatcher (`db`) returns `Record<string, unknown>` for
  every model — all reads are cast to the expected primitive (`as string`,
  `as Date`) at the call site. The proxy auto-generates a `cuid` for
  rows that lack an `id`, but we provide our own `randomUUID()` to keep
  the IDs predictable for the engagement/finding FK relation.
- The `Engagement.targetId` column is NOT NULL, so the API creates a
  synthetic `Target` row (with `authorized: true`) per scan rather than
  requiring the user to pre-create one. This matches the pattern used by
  `full-vapt/route.ts` (lines 102-113).
- SSRF guard: rejects http/https URLs whose hostname resolves to private
  IPv4 (10/8, 172.16-31/12, 192.168/16, 127/8, 169.254/16, 100.64-127/10,
  198.18-19/15, 0/8, 255/8), IPv6 (::1, ::, fe80::/10, fc00::/7), and
  cloud metadata hostnames (metadata.google.internal).
- `fetch()` is called with `redirect: "manual"` so 3xx responses show up
  in the distribution chart rather than silently following the redirect.
- Per-request timeout = 10s via `AbortController` (per task spec).
- All 5 tests share the same `targetUrl` (the user-provided URL) — each
  test sends its own default body when the user doesn't supply one
  (e.g., `{"amount":100,"action":"deduct"}` for the balance-deduction
  test).

## Verification
- `bunx tsc --noEmit 2>&1 | grep race-condition` → **0 errors** (grep
  exit code 1 = no matches).
- `bunx eslint --max-warnings=0 src/app/api/vapt/race-condition/route.ts
  src/components/sentinel/race-condition-testing.tsx` → **0 errors**
  (exit code 0).
- `bun run lint 2>&1 | grep -E "race-condition"` → **0 matches** in my
  files. The 62 pre-existing problems reported by `bun run lint` are in
  unrelated files (`performance-client.ts`, etc.) and were not introduced
  by this task.

## Notes for the next session
- The race-condition tests are sequential by design (each test waits for
  the previous to complete via `await`). True concurrent test execution
  would conflate response data across tests, making the per-test
  `succeeded`/`failed` stats unreliable. Total wall-clock time is
  ~5 × 10s worst case = 50s; the route's `maxDuration = 30` may need
  bumping to 60 if the target is slow.
- The "Rate-Limit Race" test fires up to 100 concurrent requests — some
  WAFs/proxies may rate-limit by IP and return 429 to ALL requests,
  causing a false-negative. The test only reports "no rate-limiting" if
  zero requests are blocked (429/403) AND at least 10 requests fired.
- The component's live counter is optimistic (uses `setInterval` to
  interpolate toward the expected total) because the API is a single
  POST that returns when all tests are done. For true streaming progress
  we'd need a socket.io mini-service or SSE — out of scope for this task.
