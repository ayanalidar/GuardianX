# Task 2-3: Import + Enrichment Connector Frameworks

**Agent:** integrations-connectors-agent
**Task:** Build 2 frameworks: import connectors (ingest findings from external scanners) and enrichment connectors (enhance IOCs with threat intel).

## Inputs Read

- `/home/z/my-project/worklog.md` — full project context (engine alive, AI Ops Agent + Integrations Hub already wired in).
- `/home/z/my-project/src/lib/integrations/engine.ts` — existing connector pattern (Connector interface, registry array, schema export, central forwardEvent()).
- `/home/z/my-project/src/lib/db.ts` — Prisma-compatible Proxy dispatcher over Supabase REST. `db.finding.create()`, `db.ioc.findUnique()`, `db.engagement.findUnique()`, etc. Auto-generates IDs if `id` is omitted but explicit `randomUUID()` is safe.
- `/home/z/my-project/src/app/api/engagements/route.ts` — coding style (NextResponse, dynamic = "force-dynamic", db.findMany with orderBy + take).
- `/home/z/my-project/prisma/schema.prisma` — Finding model fields (engagementId, title, severity, category, owasp, endpoint, method, description, proofRequest, proofResponse, payload, confidence, remediation) + IOC model fields.

## File 1: `/home/z/my-project/src/lib/integrations/import-connectors.ts`

### Types
- `Severity = "critical" | "high" | "medium" | "low" | "info"`
- `ImportConfig` — `{ minSeverity?, defaultCategory?, skipInfo?, deduplicate?, tags?, [key]: unknown }`
- `ParsedFinding` — matches spec exactly (title, severity, category, owasp?, cwe?, endpoint?, method?, description, proofRequest?, proofResponse?, payload?, remediation?, confidence, sourceTool)
- `ImportConnector` — `{ type, name, description, parse(rawData, config) => ParsedFinding[] }`

### Helpers (private)
- `normalizeSeverity()` — accepts High/Medium/Low/Informational, numeric 0-4, BLOCKER/CRITICAL/MAJOR/MINOR/INFO, and maps to our scale.
- `qualysSeverity()` — 1=info, 2=low, 3=medium, 4=high, 5=critical.
- `nessusSeverity()` — 0=info, 1=low, 2=medium, 3=high, 4=critical.
- `extractXmlTag()` / `extractAllXmlTags()` / `decodeXmlEntities()` — dependency-free regex XML extractor for Burp + Qualys.
- `safeJsonParse()`, `asString()`, `asArray()` — defensive coercion helpers.

### 8 connectors built
1. **burp** — XML: extracts `<issue>` blocks (name, severity, host, path, description, remediation). Maps High/Medium/Low/Information.
2. **zap** — JSON: walks `site[]` then `alerts[]` (name, riskdesc, desc, solution, cweid, instances[0].uri + method).
3. **nessus** — JSON or CSV: detects by leading char. JSON path supports both `vulnerabilities[]` and `hosts[].vulnerabilities[]`. CSV path finds columns by name (host, plugin_name, severity, synopsis, solution, cve, port).
4. **nuclei** — JSONL: each line has info.name, info.severity, matched, type, template-id, info.tags. Filters to lines starting with `{`.
5. **qualys** — XML: extracts `<HOST>` then `<VULN>` children (QID, SEVERITY, TITLE, THREAT, SOLUTION, CVE). Numeric severity 1-5.
6. **sonarqube** — JSON `/api/issues/search`: BLOCKER→critical, CRITICAL→high, MAJOR→medium, MINOR→low, INFO→info. Pulls rule, component, message, line.
7. **snyk** — JSON `snyk test --json`: handles both single object and multi-project array. Pulls title, severity, packageName, version, identifiers.CVE[], fixInfo (fixable detection), from chain.
8. **dependabot** — JSON array from GitHub API: each alert has security_advisory.{summary, severity, ghsa_id, cve_id, vulnerabilities[].ranges[].fixed}, dependency.package.{ecosystem, name}.

### `importFindings(connectorType, rawData, engagementId, config?)`
1. Looks up connector by type, returns error if unknown.
2. Verifies engagement exists via `db.engagement.findUnique()` (fail fast).
3. Calls `connector.parse()`, catches parse errors.
4. For each parsed finding:
   - Applies `minSeverity` filter, optional `skipInfo`, optional `deduplicate` (by lowercase `title::endpoint` key).
   - Builds description with `[CWE xxx]` and `[Refs: ...]` prefixes (since Finding table has no cwe column).
   - Calls `db.finding.create()` with explicit `randomUUID()` id and all required Finding fields.
5. Returns `{ imported, skipped, errors }`.

### Registry exports
- `importConnectors: ImportConnector[]` (8 items)
- `getImportConnector(type)` — lookup helper.
- `getImportConnectorSchemas()` — returns `{ type, name, description }[]` for UI.

## File 2: `/home/z/my-project/src/lib/integrations/enrichment-connectors.ts`

### Types
- `Reputation = "malicious" | "suspicious" | "clean" | "unknown"`
- `EnrichmentResult` — `{ source, found, reputation?, score?, tags?, details?, rawResponse?, error? }`
- `EnrichmentConnector` — `{ type, name, description, enrich(iocValue, iocType, config) => Promise<EnrichmentResult> }`

### Helpers (private)
- `safeFetch(url, init)` — wraps `fetch()` with `AbortSignal.timeout(10_000)`, parses JSON body when content-type or leading char looks like JSON, returns `{ ok, status, body, rawText }`. Catches all errors and rethrows as `fetch failed: ...`.
- `reputationFromScore()` — 75+ malicious, 40+ suspicious, >0 clean, else unknown.
- `asRecord()`, `asArray()`, `asString()`, `asNumber()` — defensive coercion.

### 5 connectors built
1. **virustotal** — `GET /api/v3/{ip_addresses|files|domains|urls}/{value}` with `x-apikey`. For URLs, base64url-encodes for the lookup-by-id endpoint. Reads `data.attributes.last_analysis_stats`, computes `score = malicious / total * 100`, reputation is malicious if `malicious > 5`. Tags from `popular_threat_classification.suggested_threat_label` and `tags`.
2. **abuseipdb** — `GET /api/v2/check?ipAddress={ip}&maxAgeInDays={90 default}` with `Key` header. Score = `abuseConfidenceScore`. Reputation: >75 malicious, >=25 suspicious, >0 clean. Tags from usageType, isp, domain, reports count.
3. **otx** — `GET /api/v1/indicators/{ip|file|domain|url|email}/{value}/general` with optional `X-OTX-API-KEY`. Reads `pulse_info.pulses[]`, score = min(100, pulseCount * 5 + 10 if tags). Reputation: >=50 malicious, >=20 suspicious, >0 clean. Tags from pulse.tags, adversary, TLP.
4. **shodan** — `GET /shodan/host/{ip}?key={apiKey}`. IP-only. Score = portScore (5/port, max 40) + vulnScore (15/vuln, max 60). Reputation: vulns > 0 malicious, ports >= 5 suspicious, ports > 0 clean. Tags from service.product, transport, vuln names. Details include openPorts, vulnerabilities, org, asn, hostnames.
5. **misp** — `POST {url}/attributes/restSearch` with body `{ value, type, last }` and `Authorization: {apiKey}` header. Maps iocType to MISP type (ip→ip-dst, hash→md5, domain→domain, email→email-src, else text). Handles both `{ response: { attribute: [] } }` and `{ response: [] }` shapes. Aggregates tags from Event.Tag + attribute.Tag. Score = min(100, count * 10 + eventCount * 5). Returns `found: false` when no attributes matched.

### `enrichIOC(iocValue, iocType, activeEnrichments)`
1. Validates inputs.
2. Fans out to every connector in parallel via `Promise.allSettled()` (one failing source doesn't poison others).
3. For each rejected promise, synthesizes an error EnrichmentResult.
4. Aggregates:
   - `overallReputation` — highest-severity reputation across results (malicious > suspicious > clean > unknown).
   - `overallScore` — max score across results.
   - `allTags` — union of all tags (deduplicated).
   - `enriched` — true if any connector returned `found: true`.

### `enrichAndPersist(iocId, activeEnrichments)` (bonus)
1. Loads IOC by id.
2. Calls `enrichIOC(ioc.value, ioc.iocType, ...)`.
3. Merges new tags with existing IOC tags (handles JSON array or CSV string storage).
4. Writes summary JSON to IOC.notes (truncated to 8000 chars to stay column-safe), updates tags + lastSeen.
5. Returns the aggregate + iocId.

### Registry exports
- `enrichmentConnectors: EnrichmentConnector[]` (5 items)
- `getEnrichmentConnector(type)`
- `getEnrichmentConnectorSchemas()` — returns `{ type, name, description, configFields[] }[]` with config field types (string | password | number), required flags, placeholders, and default values. Ready for a future UI panel to render dynamic forms (mirrors the existing integrations hub pattern).

## Verification

- `bun run lint` — 0 errors. Only 3 pre-existing warnings in `service-launcher.tsx` (unrelated, same as prior tasks).
- No em dashes used in any comment or string (verified).
- All fetch calls use `AbortSignal.timeout(10_000)`.
- All DB access via `import { db } from "@/lib/db"`.
- All IDs via `import { randomUUID } from "node:crypto"`.
- Both files export connector arrays AND helper functions.

## Files Created

| Path | Lines | Purpose |
|---|---|---|
| `/home/z/my-project/src/lib/integrations/import-connectors.ts` | ~640 | 8 import connectors + `importFindings()` |
| `/home/z/my-project/src/lib/integrations/enrichment-connectors.ts` | ~620 | 5 enrichment connectors + `enrichIOC()` + `enrichAndPersist()` |

## Stage Summary

Two new library files that together give GuardianX the ability to:
1. Ingest scan results from 8 popular security tools (Burp, ZAP, Nessus, Nuclei, Qualys, SonarQube, Snyk, Dependabot) and persist them as Finding rows tied to an Engagement, with severity normalization, deduplication, min-severity filtering, and per-row error tracking.
2. Enhance IOC records by fanning out to 5 threat intel APIs (VirusTotal, AbuseIPDB, OTX, Shodan, MISP) in parallel, aggregating reputation/score/tags into a single verdict, with optional persistence back to the IOC table.

Both files follow the existing engine.ts pattern (interface, registry array, schema export, central helper) and are ready to be wired into API routes (e.g. `POST /api/imports` and `POST /api/iocs/[id]/enrich`) and a UI panel.
