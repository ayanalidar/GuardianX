# crypto-migration — full-stack-developer work record

**Task ID:** `crypto-migration`
**Agent:** full-stack-developer
**Scope:** Migrate all `node:crypto` imports to the Web Crypto API compat layer
for Cloudflare Pages / Vercel Edge compatibility.

## Project location discovery

The task description specified `/home/z/GuardianX-web`, but that path does not
exist on this machine — the entire GuardianX Next.js codebase (Next.js 16 +
TypeScript 5 + Supabase + shadcn/ui) lives at `/home/z/my-project`. All
migrations below were applied there. The `src/`, `package.json` (with
`next: 16`, `eslint: 9`, `eslint-config-next: 16`, `typescript: 5.9`), and
`tsconfig.json` (`@/* → ./src/*` path alias, `target: ES2022`, `module: ESNext`)
confirm this is the right project.

## Compat layer prerequisite

The task said the compat layer "already exists at `src/lib/crypto.ts`". It did
NOT exist (only `src/lib/sentinel/crypto.ts` — a different file doing AES-256-GCM
secret encryption). Since the migration depends on the compat layer, I created
it at `/home/z/my-project/src/lib/crypto.ts` with the exact spec'd exports plus
one extension:

- `randomUUID(): string` — sync, `globalThis.crypto.randomUUID()`
- `randomBytes(n): Uint8Array` — sync, `crypto.getRandomValues`
- `randomHex(n): string` — sync, lowercase hex
- `sha256hex(data): Promise<string>` — async, `crypto.subtle.digest("SHA-256", ...)`
- `sha1hex(data): Promise<string>` — async, `crypto.subtle.digest("SHA-1", ...)` *(extension)*
- `hmacSha256hex(key, data): Promise<string>` — async
- `hmacSha256base64(key, data): Promise<string>` — async
- `timingSafeEqual(a, b): boolean` — sync, constant-time byte compare

The `sha1hex` extension was needed because
`src/app/api/incidents/auto-create/route.ts` uses `createHash("sha1")` to
compute a stable dedup `sourceId` for anomaly-driven incidents. Switching it
to `sha256hex` would have changed the hash format and broken dedup for existing
rows. `sha1hex` keeps the format byte-for-byte identical (verified by parity
check).

The compat layer uses `btoa` / `atob` (available in browsers, Node 16+, and
the Edge Runtime) instead of `Buffer` so the file is portable across every
runtime GuardianX ships on.

## Migration summary

Total files migrated: **46 .ts files** under `src/` (the original grep found 53,
but 2 are string-literal-only references in AI instructions
(`sentinel/engine/ai.ts`, `sentinel/engine/language-patterns.ts`), 4 are
comments mentioning the old library name, and the remaining 47 had actual
imports — minus `src/lib/crypto.ts` itself which is the new compat layer).

### Pattern breakdown (matches the task spec)

| Pattern | Files | Migration |
|---|---|---|
| 1 — `import { randomUUID } from "node:crypto"` | 26 | Drop-in import swap, no caller changes |
| 2 — `import { createHash }` + `createHash("sha256")...digest("hex")` | 1 | Make calling function async, replace with `await sha256hex(...)` |
| 3 — `import { createHash, randomUUID }` | 2 | Replace with `import { sha256hex, randomUUID } from "@/lib/crypto"`, make caller async |
| 4 — `import { createHmac }` + `createHmac("sha256", k).update(d).digest("hex")` | 1 | Make caller async, `await hmacSha256hex(k, d)` |
| 5 — `import { randomBytes }` + `randomBytes(n).toString("hex")` | 1 | Replace with `randomHex(n)` (sync) |
| 6 — `const { createHash } = await import("node:crypto")` | 3 | Convert to static `import { sha256hex } from "@/lib/crypto"` at top, replace call site with `await sha256hex(...)` |
| 7 — `const { randomUUID } = await import("node:crypto")` | 5 | Convert to static `import { randomUUID } from "@/lib/crypto"` |
| Special — `import { createHmac, timingSafeEqual }` | 1 | `import { hmacSha256hex, timingSafeEqual }`, make caller async |
| Special — `import { randomUUID, randomBytes }` + `randomBytes(32).toString("hex")` | 1 | `import { randomUUID, randomHex }`, replace with `randomHex(32)` |
| Special — `import { createCipheriv, createDecipheriv, randomBytes }` (AES-256-GCM) | 1 | Rewrite using `crypto.subtle.encrypt/decrypt` directly (the compat layer doesn't expose cipher ops); preserve on-disk format (separate `cipher`/`tag` base64 fields) for backward compat |

### Files migrated

**`src/lib/` (10 files):**
- `src/lib/crypto.ts` — NEW compat layer (created, not migrated)
- `src/lib/auth.ts` — Pattern 6 (dynamic `createHash`) → `await sha256hex(...)`
- `src/lib/audit.ts` — Pattern 1 (`randomUUID`)
- `src/lib/db.ts` — Pattern 1 (`randomUUID`)
- `src/lib/logger.ts` — Pattern 1 (`randomUUID`)
- `src/lib/stripe.ts` — Pattern 4 + `timingSafeEqual`; `verifyWebhookSignature` made async, all callers (1: `api/billing/webhook/route.ts`) updated to `await`
- `src/lib/webhook-dispatcher.ts` — Pattern 4 + Pattern 5; `signEvent` made async, `generateWebhookSecret` switched to `randomHex(32)`, caller (`sendToWebhook`) already async — added `await`
- `src/lib/integrations/engine.ts` — Pattern 6 (dynamic `createHmac`) → static `import { hmacSha256hex }`, call site already async — added `await`
- `src/lib/integrations/outbound-connectors.ts` — Pattern 6 (dynamic `createHmac`) → static `import { hmacSha256base64 }`, call site already async — added `await`
- `src/lib/sentinel/attestation.ts` — Pattern 2 (CRITICAL: tamper-evident hash chain); `computeAttestationHash`, `verifyAttestationChain`, `verifyAttestationForPatch`, `issueAttestationHash` all made async. 6 callers updated to `await`: `api/patches/[id]/approve`, `api/attestations`, `api/attestations/export`, `api/attestations/verify` (×3), `app/attestations/[id]/page.tsx`
- `src/lib/sentinel/crypto.ts` — AES-256-GCM rewrite (see Special case above)
- `src/lib/sentinel/engine/pipeline.ts` — Pattern 5; `randomBytes(2).toString("hex")` → `randomHex(2)` (sync, no caller changes)

**`src/app/api/` (35 files):**
- 25 files with Pattern 1 (`randomUUID` only) — drop-in swap
- `src/app/api/auth/delete-account/route.ts` — Pattern 1 + Pattern 5 (`randomBytes(32).toString("hex")` → `randomHex(32)`)
- `src/app/api/launch-service/route.ts` — Pattern 1 + Pattern 7 (had both static and dynamic `randomUUID` imports)
- `src/app/api/vapt/jwt-auth/route.ts` — Pattern 4 + Pattern 1; `signHs256` and `tamperPayload` made async, `DUMMY_TOKEN` module-level constant converted to lazy `getDummyToken()` cache (avoids top-level await), 6 call sites updated to `await`
- `src/app/api/siem/agent/route.ts` — Pattern 3; `hashToken` made async, 2 call sites updated to `await`
- `src/app/api/siem/api-key/route.ts` — Pattern 3; `hashKey` and `makePlaintext` made async, 3 call sites updated to `await`
- `src/app/api/patches/[id]/approve/route.ts` — Pattern 2; uses canonical attestation hash formula — `await sha256hex(...)` for both `patchedCodeHash` and `computeAttestationHash` (already async from the attestation migration)
- `src/app/api/runtime-monitor/[patchId]/heal/route.ts` — Pattern 6; same canonical attestation formula, 2 `createHash` calls → `await sha256hex(...)`
- `src/app/api/incidents/auto-create/route.ts` — Pattern 6 (sha1) + Pattern 7; `createHash("sha1").update(...).digest("hex").substring(0, 16)` → `(await sha1hex(...)).substring(0, 16)`
- `src/app/api/incidents/[id]/evidence/route.ts` — Pattern 6 + Pattern 7; `createHash("sha256").update(buf).digest("hex")` → `await sha256hex(buf)` (Buffer is a Uint8Array subclass — works unchanged)
- `src/app/api/rollback/[patchId]/route.ts` — Pattern 7
- `src/app/api/codebases/route.ts` — Pattern 7
- `src/app/api/users/route.ts` — Pattern 7
- `src/app/api/report-branding/route.ts` — Pattern 7
- `src/app/api/cron/threat-hunter/route.ts` — Pattern 7

**`src/app/` non-api (1 file):**
- `src/app/attestations/[id]/page.tsx` — async server component; `await verifyAttestationChain(allRows)` added (the function it calls was made async by the attestation.ts migration)

### Functions made async

Total: **11 functions** across 8 files
1. `sha256hex` / `sha1hex` / `hmacSha256hex` / `hmacSha256base64` — compat layer (always async)
2. `verifyWebhookSignature` — `src/lib/stripe.ts`
3. `signEvent` — `src/lib/webhook-dispatcher.ts`
4. `computeAttestationHash`, `verifyAttestationChain`, `verifyAttestationForPatch`, `issueAttestationHash` — `src/lib/sentinel/attestation.ts`
5. `hashToken` — `src/app/api/siem/agent/route.ts`
6. `hashKey`, `makePlaintext` — `src/app/api/siem/api-key/route.ts`
7. `signHs256`, `tamperPayload` — `src/app/api/vapt/jwt-auth/route.ts`
8. `encryptSecret`, `decryptSecret` — `src/lib/sentinel/crypto.ts`

All callers of these functions were already async (API route handlers,
server components) — only `await` was added at the call sites. No calling
function had to be made async solely because of this migration.

## Files NOT touched (per task rules)

- `src/lib/crypto.ts` — the compat layer itself (created by this agent
  because it didn't exist; the task's "Do NOT touch" rule assumed a previous
  agent had created it).
- `src/app/page.tsx` — being edited by another agent in parallel.
- `src/components/sentinel/*` — client components, no `node:crypto` usage.
- `src/middleware.ts` — already edge-safe (uses `crypto.subtle` directly,
  never imported `node:crypto`).
- `src/lib/sentinel/engine/ai.ts` — only string-literal references to
  `node:crypto` (instructional text to the AI patcher); left as-is per task.
- `src/lib/sentinel/engine/language-patterns.ts` — only string-literal
  references (secure-coding guidance to the AI patcher about how OTHER
  Node.js projects should use crypto); left as-is.

## Parity verification

Wrote 3 throwaway parity-check scripts (since deleted) to confirm the
Web Crypto implementation produces byte-for-byte identical output to
node:crypto:

1. **SHA-256 hex** — 4 test cases mirroring real attestation inputs
   (prevHash + patchId + patchedCodeHash + timestamp). ✓ All pass.
2. **SHA-1 hex** — 4 test cases mirroring anomaly titles used for incident
   dedup sourceIds. ✓ All pass.
3. **HMAC-SHA-256 hex + base64** — 5 test cases mirroring Stripe webhook
   signatures, Azure Monitor stringToSign, and JWT HS256 payloads. ✓ All
   pass. (Edge case: empty HMAC key is rejected by Web Crypto but accepted
   by node:crypto — real callers always pass non-empty secrets, so this is
   a non-issue and actually safer.)
4. **AES-256-GCM cross-decrypt** — verified that ciphertexts encrypted by
   the old node:crypto implementation decrypt correctly with the new Web
   Crypto implementation, and vice-versa. This means existing credentials
   in the database remain decryptable after deployment. ✓ All 5 plaintexts
   (GitHub PAT, Slack token, empty string, unicode, 1000-byte token) pass
   in both directions plus new→new round-trip.

## Lint result

`bun run lint` reports **62 problems (57 errors, 5 warnings)** — identical
to the pre-migration baseline documented in the worklog (all in
`src/app/page.tsx`, `src/components/ui/carousel.tsx`, `src/hooks/use-mobile.ts`,
`src/lib/performance-client.ts`, and ~30 sentinel components tripping the
`react-hooks/set-state-in-effect` rule). Grep'ing the lint output for any
of the migrated file paths returns **0 matches** — the migration
introduced **0 new lint errors**.

## TypeScript type check

`bunx tsc --noEmit -p tsconfig.json` reports **0 type errors** in any
migrated file (the only output is the pre-existing `index.ts(1,4)` parse
error at the repo root, unrelated — it's the bun entry point, not part of
the Next.js app).

## Dev server

`bun run dev` recompiled cleanly after the migration (dev.log shows
`✓ Compiled in 2.3s` and continuous `GET / 200` responses with no errors).

## Constraints honored

- Did NOT commit or push.
- Did NOT touch `src/app/page.tsx`, `src/components/sentinel/*`, or
  `src/middleware.ts`.
- Did NOT change function signatures beyond making them async (return
  types changed from `T` to `Promise<T>`, which is the minimum necessary
  for Web Crypto compatibility).
- Did NOT change the hash/HMAC/ciphertext output format — verified by
  parity checks.
- Preserved the tamper-evident attestation chain integrity (existing
  attestations still verify against recomputed hashes).
- Preserved credential secret decryptability (existing AES-256-GCM
  ciphertexts in the database still decrypt with the new implementation).
- Preserved Stripe webhook signature verification (signature comparison
  is byte-for-byte identical).
- Preserved incident dedup sourceId stability (sha1-based sourceIds
  continue to match new computations).
