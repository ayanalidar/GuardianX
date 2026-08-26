# Task 1 - SIEM Module Build

**Agent:** main
**Task ID:** 1
**Scope:** Recreate the GuardianX SIEM module from scratch - 3 library files plus 7 API routes.

## Files Delivered

### Library files (under `src/lib/siem/`)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/lib/siem/search.ts` | Unified log search engine. Queries 7 log tables in parallel (AuditLog, ApiAccessLog, HoneypotHit, Canary, IncidentEvent, Finding, Patch), normalizes each record into a UnifiedLogEntry (source, type, severity, title, description, ipAddress, timestamp). Exports `unifiedSearch(query)` with full-text + source/severity/time-range/IP filters, plus `getSiemStats(timeRange)` for dashboard counts (by source, by severity, top IPs, recent critical). |
| 2 | `src/lib/siem/correlation.ts` | Correlation rule engine. RuleDefinition = { conditions[], timeWindowSec, minMatchCount, groupBy, action, actionConfig }. `evaluateRule(rule)` searches events per condition via unifiedSearch, groups by ipAddress/source/type, checks minMatchCount within window. Actions: `create_incident` (deduped by sourceId), `add_ioc` (upsert + bump hitCount), `forward_alert` (uses `forwardEvent` from `@/lib/integrations/engine` if available, falls back to direct HTTP POST or audit log), `log_only`. `evaluateAllRules()` runs every active AlertRule. `getDefaultRules()` returns 4 templates (brute force, honeypot+canary chain, critical findings without patches, high-volume incident events). |
| 3 | `src/lib/siem/retention.ts` | Three-tier lifecycle (hot 7d / warm 30d / cold 365d). `getRetentionPolicy()` + `setRetentionPolicy(patch)` persist as Integration row with type=`siem_retention_policy`. `getRetentionStats()` returns per-source counts of records older than each threshold. `runCleanup()` deletes records older than coldDays. |

### API routes (under `src/app/api/siem/`)

| # | Route | Methods | Auth | Purpose |
|---|-------|---------|------|---------|
| 1 | `search/route.ts` | GET | requireAuth | Unified search with q, sources, severities, from, to, range (24h/7d/30d), ip, limit |
| 2 | `rules/route.ts` | GET, POST, PATCH, DELETE | requireAuth | CRUD for AlertRule rows (rules are serialized into the existing condition/channel/channelConfig columns). POST supports `importDefault=0..3` to import a default template. |
| 3 | `stats/route.ts` | GET | requireAuth | Dashboard stats by range (default 24h) |
| 4 | `retention/route.ts` | GET, POST | requireAuth | GET returns policy (or stats with `?stats=true`); POST updates policy (or runs cleanup with `?action=cleanup`) |
| 5 | `ingest/route.ts` | POST | X-Client-Key | External log ingestion. Accepts single entry, array, or `{entries:[...]}` (max 1000). Routes by `source` field to AuditLog / ApiAccessLog / HoneypotHit / IncidentEvent. |
| 6 | `agent/route.ts` | POST, GET, PATCH | X-Client-Key (POST/PATCH), requireAuth (GET) | POST registers a new SIEM agent (returns agentId + agentToken once). GET returns a bash install script (or `?format=curl` one-liner). PATCH is the heartbeat endpoint. Agents stored as Integration rows with type=`siem_agent`. |
| 7 | `api-key/route.ts` | POST, DELETE | requireAuth | POST generates a new SIEM API key for a client (returns plaintext once, stores SHA-256 hash in Integration row with type=`siem_api_key`). DELETE revokes by `?id=` or all keys for `?clientId=`. Exports `validateClientApiKey(headerValue)` used by ingest + agent routes. |
| 8 | `client-integration/route.ts` | GET | requireAuth | Returns all 4 integration options for a client (syslog forwarder, HTTP ingest API, guardian agent, Splunk/ELK webhook). Each option includes setup steps, config snippet, and a `status` of available/configured/partial based on existing key/agent/splunk rows. |

## Design Decisions

- **No schema migration required.** Reused the existing `AlertRule` model to store correlation rules (packed into `condition`/`channel`/`channelConfig` columns) and the `Integration` model to store retention policy, SIEM API keys, and agent registrations (each with a distinct `type` discriminator).
- **Forwarder integration is optional.** The correlation engine dynamically imports `@/lib/integrations/engine` to call `forwardEvent` for the `forward_alert` action. If the module is ever removed, the engine falls back to direct HTTP POST (if `actionConfig.forwardUrl` is set) or audit-log-only mode.
- **X-Client-Key auth pattern.** SIEM API keys are SHA-256 hashed at rest (never decrypted). The plaintext is returned exactly once on creation. The `validateClientApiKey()` helper is shared between `/ingest` and `/agent` and bumps `lastUsedAt` on every successful auth.
- **7-source parallel search.** Each source has its own normalizer that maps the raw DB record to a `UnifiedLogEntry`. Filters that the Supabase proxy supports natively (date range, IP equality) are pushed down to the DB; everything else (free-text query, severity allow-list, type match) is applied post-fetch.
- **Idempotent incident creation.** `create_incident` action dedupes by `sourceId = "siem:{ruleId}:{groupKey}"` so repeated rule fires within an open incident don't create duplicates.
- **Defensive cleanup.** `runCleanup()` fetches IDs of stale records (capped at 1000 per source per run) and deletes them one-by-one so a single failure doesn't abort the whole cleanup pass.

## Quality Gates

- `bun run lint`: **0 errors** in any SIEM file. 3 pre-existing warnings in `service-launcher.tsx` (unrelated).
- `npx tsc --noEmit`: **0 errors** in any SIEM file (after fixing 2 initial strict-mode issues - dynamic import cast and `count({})` argument count).

## Coding Patterns (match existing GuardianX conventions)

- `export const dynamic = "force-dynamic"` on every route
- `import { db } from "@/lib/db"` for DB access (Prisma-compatible Supabase proxy)
- `import { requireAuth } from "@/lib/auth"` for JWT-protected routes
- `(record.createdAt as Date).toISOString()` for date serialization on read
- `new Date()` for date columns on write
- JSON columns: `JSON.parse(row.config || "{}")` on read, `JSON.stringify(obj)` on write
- Error handling: `try { ... } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 }); }`
- IDs: `import { randomUUID } from "node:crypto"` and `import { createHash } from "node:crypto"` for SHA-256 key hashing
- No em dashes in comments or strings (used regular hyphens or the word "to" instead)

## Defensive Coding Highlights

- Every per-source search query wrapped in try/catch - a single failing table doesn't break the whole search.
- `evaluateAllRules()` catches per-rule evaluation errors so one bad rule doesn't abort the others.
- `runCleanup()` skips individual delete failures.
- `validateClientApiKey()` never throws - returns null on any failure.
- `forward_alert` action has 3 fallback tiers: integrations engine -> direct HTTP POST -> audit log only.
- Retention policy POST validates that hotDays <= warmDays <= coldDays.
- Agent PATCH heartbeat supports both X-Client-Key auth (for agents) and requireAuth (for admin manual updates).
