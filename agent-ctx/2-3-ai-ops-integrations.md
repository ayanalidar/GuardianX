# Task 2-3 - AI Ops Agent + Integration Hub

**Agent:** main
**Task ID:** 2-3
**Status:** complete

## Summary
Recreated the GuardianX AI Ops Agent (autonomous SRE/security-ops agent with self-healing) and the Integration Hub (connector framework with 9 built-in + 20 outbound + 8 import + 5 enrichment connectors). The AI Ops agent can scan the codebase, probe every API route + DB table + mini-service, diagnose failures by feeding source code to the LLM, and execute one of 9 self-heal actions. The Integration Hub provides a unified SecurityEvent contract that fans out to every active connector with an in-memory forwarding log.

## Files delivered

### AI Ops lib (`src/lib/ai-ops/`)
- `codebase-index.ts` - Filesystem scanner. `getCodebaseIndex()` walks `src/`, extracts routes/components/libs/pages/models with 1-min TTL cache. `getCodebaseSummary()` returns compact text for AI prompts. `readFileSource(path)` reads a single file with path-traversal protection. `invalidateCodebaseIndex()` clears the cache (used by `reindex_codebase` self-heal action).
- `health-checker.ts` - `runFullHealthCheck()` (all API routes + all DB tables + engine + system probes) and `quickHealthCheck()` (1 DB + 1 API + engine). `setApiBaseUrl(url)` + `setApiBaseUrlFromRequest(req)` configure the base URL - NEVER hardcodes localhost, uses `new URL(req.url).origin`. Mints internal admin JWT via `createToken()` from `@/lib/auth`.
- `diagnostic-agent.ts` - `diagnoseFailure(component, error)` reads source via `readFileSource`, sends to ZAI LLM with strict JSON output schema (rootCause, severity, suggestedFixes[].autoExecutable, relatedFiles). `chatWithAgent(message, history)` includes codebase summary + health state in the system prompt. `executeFix(action)` implements 9 self-heal actions: `restart_engine`, `rerun_migration` (POST /api/db-init), `clear_cache`, `fix_env` (checks required env vars), `reinstall_deps`, `reseed_siem_rules` (idempotent baseline splunk/elk/datadog rows), `reindex_codebase`, `evaluate_correlations` (joins IOCs against ApiAccessLog), `run_retention_cleanup` (deletes AuditLog + ApiAccessLog older than 90d). `setDiagApiBaseUrl(url)` exported as required.

### AI Ops API routes (`src/app/api/ai-ops/`)
- `health/route.ts` - GET. `?full=true` for full scan.
- `scan/route.ts` - POST. Full health scan + AI diagnosis of failing probes. Returns `{ health, diagnoses, summary }`.
- `diagnose/route.ts` - POST. Body `{ component, error }` -> Diagnosis.
- `fix/route.ts` - POST admin-only + GET list. Executes self-heal action.
- `codebase/route.ts` - GET. `?summary=true`, `?file=<path>`, `?reindex=true`.
- `chat/route.ts` - POST. Body `{ message, history }` -> `{ reply, context }`.

### Integration Hub lib (`src/lib/integrations/`)
- `engine.ts` - `SecurityEvent` interface, `forwardEvent()` fan-out (in-memory log of last 100), 9 built-in connectors (splunk HEC, elk bulk, datadog logs, jira issue, pagerduty events v2, securityhub batchImport, teams MessageCard, slack attachment, generic webhook with HMAC-SHA256 sig). `getConnectorSchemas()` returns catalog with `category` field. `testIntegration()` probes a connector with a synthetic event. Lazy dynamic `import("./outbound-connectors")` wrapped in try/catch so engine never fails to load if that file is missing. 8 categories: SIEM & Monitoring, Alerting & Notification, Collaboration, ITSM & Ticketing, Cloud & Infrastructure, Compliance & Reporting, DevOps & CI/CD, Generic.
- `outbound-connectors.ts` - 20 additional connectors (WhatsApp/Twilio, Telegram, Email/SendGrid, SMS/Twilio, Discord, CloudWatch, Azure Monitor, GCP Logging, Kubernetes Event, ServiceNow, Freshservice, Zendesk, Linear, Trello, Google Sheets, SharePoint, DocuSign, GitHub PR Comment, GitLab MR Comment, RBI/SEBI Compliance). Each has `send()` doing a single fetch POST/PUT with 10-15s timeout.
- `import-connectors.ts` - 8 vulnerability scanner parsers (Burp XML, OWASP ZAP JSON, Nessus .nessus XML, Nuclei JSONL, Qualys host-list XML, SonarQube issues JSON, Snyk JSON, Dependabot JSON). `importFindings(tool, rawData, engagementId, config)` parses + persists to Finding table linked to engagementId; supports `preview:true` for parse-only. Parsers are defensive (never throw).
- `enrichment-connectors.ts` - 5 threat-intel lookups (VirusTotal v3, AbuseIPDB v2, Shodan, AlienVault OTX, MISP). `enrichIOC(value, type, activeEnrichments)` fans out across active providers and merges (most-pessimistic reputation, max score, union of tags). Always resolves.

### Integration API routes
- `src/app/api/integrations/route.ts` (rewritten) - GET (list OR `?schemas=true` for connector catalog OR `?log=true` for forward log), POST (create OR `?test=true` for test OR `{forward:true,event:...}` for fan-out), PATCH (toggle/config update), DELETE (?id=).
- `src/app/api/imports/route.ts` - GET (import connector catalog) + POST (parse + persist findings, supports `preview:true`).
- `src/app/api/iocs/enrich/route.ts` - GET (?value=&type= OR ?connectors=true) + POST (same via body for large payloads). Persists/upserts IOC with merged reputation as confidence.

## Coding conventions
- `export const dynamic = "force-dynamic"` on every route.
- `export const maxDuration = 60` (or 30 for chat).
- `import { db } from "@/lib/db"` (Supabase REST proxy).
- `import { requireAuth, requireAdmin } from "@/lib/auth"`.
- `new URL(req.url).origin` for base URL (never hardcoded localhost).
- Internal admin JWT via `createToken({userId:"ai-ops-agent", role:"admin", approved:true})`.
- JSON config fields: `JSON.parse(config || "{}")` on read, `JSON.stringify` on write.
- Defensive try/catch + `AbortSignal.timeout(8_000)` on every external fetch.
- No em dashes anywhere.
- `any` casts allowed (eslint rule disabled in `eslint.config.mjs`).

## Coordination with previous agents
- Read `/home/z/my-project/agent-ctx/2-dfir-api.md` and `/3-dfir-panel.md` for context on the existing GuardianX coding patterns (force-dynamic, requireAuth/requireAdmin, JSON.parse/stringify for DB config fields, date hydration conventions).
- Read `src/lib/db.ts` to understand the Prisma-compatible Proxy over Supabase REST API (returns `Record<string, unknown>` records, requires `as` casts for field access).
- Read `src/lib/auth.ts` to learn the JWT helpers (`createToken`, `verifyToken`, `requireAuth`, `requireAdmin`).
- Read `src/app/api/clients/route.ts` and `src/app/api/iocs/route.ts` for the canonical route style.
- Read `src/app/api/guardian-chat/route.ts` for the ZAI SDK singleton pattern (`let zaiPromise = ...; async function sdk() { ... }`).
- Read `src/lib/sentinel/engine-proxy.ts` for the `ENGINE_URL` export (used by health-checker to probe the sentinel engine).
- Read existing `src/app/api/integrations/route.ts` (the simple 3-handler version) and rewrote it with the new engine-backed functionality.

## Quality gates
- `bun run lint`: 0 errors, 3 pre-existing warnings in `service-launcher.tsx` (unrelated, noted in 3-dfir-panel.md).
- `npx tsc --noEmit`: 0 errors in any new file. Pre-existing errors in `mini-services/sentinel-engine/src/lib/db.ts` and other unrelated files remain.
- Verified: no em dashes (grep -P '\xE2\x80\x94' returns nothing).
- All directories pre-created with `mkdir -p` before writing files.
