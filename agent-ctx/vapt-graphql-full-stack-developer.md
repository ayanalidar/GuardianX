# Task ID: vapt-graphql — Agent: full-stack-developer

## Scope
- 1 API route: `src/app/api/vapt/graphql/route.ts` (NEW)
- 1 component: `src/components/sentinel/graphql-testing.tsx` (NEW)

## Notes
- Task instructions referenced `requireAuth` and `chatWithFallback` from `@/lib/llm`,
  but that module does not exist in the project. The actual `requireAuth` utility
  lives in `@/lib/auth` (with the identical signature `requireAuth(req)` returning
  `{ ok: true; user } | { ok: false; response }`). Used that, since the task
  forbade touching `src/lib/*`. `chatWithFallback` is not required by the
  GraphQL-test flow (no LLM call needed).
- Used `fetchUrl` from `@/lib/sentinel/engine/http-attacker` for HTTP probes
  (consistent with the rest of the VAPT codebase).
- `requireAuth` enforces both authentication AND admin-approval (fail-safe).

## API behavior
- `POST /api/vapt/graphql`, `force-dynamic`, `maxDuration=30`, auth required.
- Body: `{ graphqlUrl: string }`.
- SSRF guard: rejects `localhost`, `127.0.0.0/8`, `10/8`, `172.16/12`,
  `192.168/16`, `169.254/16` (link-local), `100.64/10` (CGNAT), `::1`,
  `0.0.0.0`, and `.local/.internal/.lan/.home/.localhost` TLDs.
- Creates `Target` (authorized=true since user explicitly requested the test)
  + `Engagement` rows.
- Runs 7 test categories sequentially and creates a `Finding` for every
  vulnerable result with `proofRequest` + `proofResponse`.
- Updates engagement status to `completed` + `completedAt`.
- Returns `{ engagementId, targetId, testedBy, graphqlUrl, testedCount,
  vulnerableCount, criticalCount, findings[], _meta }`.

## Tests implemented
1. Introspection (`__schema{types{name}}` + `__type(name:"User"){fields{name}}`)
   — medium, CWE-200.
2. Query Depth (depths 5, 10, 15, 20) — high, CWE-674. Stops at first
   depth-limited error.
3. Batching Abuse (100 → 1000 identical queries in one batch) — medium,
   CWE-770.
4. Field Suggestions (`{users{id}}` plural) — checks "did you mean" —
   low, CWE-209.
5. Alias Abuse (100 aliases in one query: `a1:user{id} a2:user{id} ...`)
   — medium, CWE-770.
6. Mutation Testing (`createUser`, `deleteUser` without auth) — critical,
   CWE-862.
7. Subscription Testing (subscription query probe over HTTP, info-only)
   — info, CWE-200.

## Component behavior
- "GRAPHQL TESTING" header with `Network` icon, cyan/violet neon accents.
- URL input + "Run GraphQL Tests" button.
- 7 stage cards revealed progressively while the request is in flight.
- After run: 4 summary tiles (tested / vulnerable / critical / passed) +
  findings table with expandable rows (request / response / remediation
  proof blocks).
- Category badges: Introspection=amber, Query Depth=red, Batching=orange,
  Field Suggestions=sky, Alias=violet, Mutation=red, Subscription=cyan.
- Dark theme, hud-corners, holo-card-sharp, custom-scrollbar, mobile-first.
- NO indigo/blue (sky used only for the explicitly-requested Field
  Suggestions badge).

## Verification
- `bunx eslint src/components/sentinel/graphql-testing.tsx
  src/app/api/vapt/graphql/route.ts` → 0 errors.
- `bunx tsc --noEmit` → only pre-existing `index.ts(1,4)` error (unrelated);
  0 errors in either of my new files.
- Pre-existing project lint errors in OTHER files (e.g.
  `src/hooks/use-mobile.ts`, `src/lib/performance-client.ts`) are not in
  scope and were not touched.
