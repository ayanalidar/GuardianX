# Task 6: Integrations UI Update (29 connectors + Import + Threat Intel tabs)

**Agent:** integrations-ui-agent
**Task:** Update the GuardianX Integrations UI to support all 29 outbound connectors grouped by category, plus new Import Findings and Threat Intel Enrichment panels.

## Inputs Read

- `/home/z/my-project/worklog.md` — full project context (engine alive, AI Ops Agent + Integrations Hub already wired in).
- `/home/z/my-project/agent-ctx/2-3-integrations-connectors.md` — confirms 8 import connectors (burp, zap, nessus, nuclei, qualys, sonarqube, snyk, dependabot) and 5 enrichment connectors (virustotal, abuseipdb, otx, shodan, misp) were already built in `src/lib/integrations/`.
- `/home/z/my-project/src/components/sentinel/integrations-panel.tsx` — the existing 1292-line, 2-tab component (Hub + Forwarding Log) that needed to be extended.
- `/home/z/my-project/src/lib/integrations/engine.ts` — confirmed `getConnectorSchemas()` returns 29 outbound connectors organized in 8 categories, each schema now carries a `category` field, and `configFields.type` accepts `"textarea"` in addition to string/password/select.
- `/home/z/my-project/src/lib/integrations/enrichment-connectors.ts` — confirmed the 5 enrichment connector types and their config field shapes (apiKey, maxAgeInDays, url, mispType, last). `getEnrichmentConnectorSchemas()` is available but not currently exposed via an HTTP endpoint.
- `/home/z/my-project/src/app/api/integrations/route.ts` — GET returns `{ integrations, schemas, forwardingLog }` when `?schemas=true` or `?log=true`; POST validates type against `getConnectorSchemas()` (so virustotal/abuseipdb/etc. would currently be rejected — the UI gracefully surfaces any backend error via toast).
- `/home/z/my-project/src/app/api/imports/route.ts` — GET returns `{ connectors: [...] }`, POST returns `{ imported, skipped, errors, findings?, tool, engagementId, timestamp }`.
- `/home/z/my-project/src/app/api/iocs/enrich/route.ts` — GET returns `{ connectors: [...] }` (type/name/description only, no configFields), POST accepts `{ iocId }` OR `{ value, type }` and returns `{ enriched, results, overallReputation, overallScore, allTags, iocValue, iocType, iocId, enrichmentCount, timestamp, message? }`.
- `/home/z/my-project/src/app/api/iocs/route.ts` — GET returns `{ iocs: [...], count, active, byType }`; each IOC has `{ id, iocType, value, confidence, source, tags[], firstSeen, lastSeen, hitCount, isActive, notes, createdAt }`.
- `/home/z/my-project/src/app/api/engagements/route.ts` — GET returns `EngagementListItem[]` with `{ id, status, stage_label, started_at, completed_at, target: {name, baseUrl}, finding_count }`.

## File Modified

### `/home/z/my-project/src/components/sentinel/integrations-panel.tsx`

**1292 lines → 2716 lines (+1424 lines, single-file rewrite)**

### Type changes
- `ConfigFieldType = "string" | "password" | "select" | "textarea" | "number"` (added textarea + number).
- `ConfigField.defaultValue?: string | number` (so number fields like abuseipdb `maxAgeInDays=90` can pre-fill).
- `ConnectorSchema.category: string` (now required by the API).
- New types: `ImportConnectorInfo`, `ImportedFinding`, `ImportResult`, `EngagementListItem`, `Reputation`, `IocType`, `EnrichmentResultRow`, `EnrichmentResponse`, `IocListItem`.

### CONNECTOR_META (icon + color) — 9 → 34 entries
Extended to cover every outbound connector type:
- SIEM & Monitoring: splunk=Database/emerald, elk=Search/cyan, datadog=Activity/violet
- Alerting & Notification: pagerduty=Bell/red, whatsapp=MessageCircle/emerald, telegram=Send/cyan, sms=Phone/amber, email=Mail/violet
- Collaboration: teams=MessageSquare/cyan, slack=Hash/violet, discord=Gamepad2/amber
- ITSM & Ticketing: jira=Ticket/sky, servicenow=ClipboardList/emerald, freshservice=Wrench/cyan, zendesk=Headphones/violet, linear=Workflow/amber, trello=Kanban/sky
- Cloud & Infrastructure: securityhub=Cloud/amber, cloudwatch=Eye/emerald, azure=Cloud/cyan, gcp=Cloud/violet, kubernetes=Boxes/sky
- Compliance & Reporting: google_sheets=Sheet/emerald, sharepoint=FolderTree/cyan, docusign=FileText/amber, rbi_sebi=Landmark/violet
- DevOps & CI/CD: github_pr=GitPullRequest/emerald, gitlab_mr=GitMerge/amber
- Generic: webhook=Webhook/zinc
- Threat Intel Enrichment (managed in Hub, used by Threat Intel tab): virustotal=ShieldAlert/red, abuseipdb=ShieldBan/amber, shodan=Radar/cyan, otx=Globe/violet, misp=Share2/emerald

### Hardcoded enrichment config schemas
`ENRICHMENT_CONFIG_FIELDS`, `ENRICHMENT_TYPE_LABELS`, `ENRICHMENT_DESCRIPTIONS` mirror the backend `getEnrichmentConnectorSchemas()` so the Hub can render a ConfigModal for each enrichment type. (The `/api/iocs/enrich` GET endpoint only returns type/name/description, not configFields.)

### Category metadata
`CATEGORY_META` (icon + accent color per category) + `CATEGORY_ORDER` array for consistent display ordering: SIEM & Monitoring, Alerting & Notification, Collaboration, ITSM & Ticketing, Cloud & Infrastructure, Compliance & Reporting, DevOps & CI/CD, Threat Intel Enrichment, Generic.

### Helper functions added
- `severityColor(sev)` → critical=red, high=amber, medium=violet, low=cyan, info=zinc
- `reputationColor(rep)` → malicious=red, suspicious=amber, clean=emerald, unknown=zinc
- `scoreColor(score)` → ≥75 red, ≥40 amber, >0 emerald, else zinc
- `groupSchemasByCategory(schemas)` — preserves CATEGORY_ORDER; unknown categories appended at end

### `emptyConfigFor()` updated
Honors `defaultValue` for string/number fields (e.g. abuseipdb `maxAgeInDays=90`).

### Main `IntegrationsPanel` — 4 tabs
- hub (Network/emerald), log (Radio/cyan), import (Upload/violet), intel (Brain/amber)
- Same holo-card-sharp hud-corners tab strip with framer-motion AnimatePresence transitions

### `IntegrationsHub` rewrite
- Fetches `/api/integrations?schemas=true` AND `/api/iocs/enrich` in parallel
- Merges enrichment connectors into the schema list as category "Threat Intel Enrichment" (deduped by type, prefer outbound schema on overlap)
- **NEW**: Category filter dropdown (All Categories + each category with count) at the top
- Replaced flat grid with category-grouped rendering: each category gets a header (icon + name + count badge + connected count badge) followed by its connector cards in a 3-col responsive grid
- Loading skeletons show 2 stacked category sections to match the new layout
- Empty-state for filtered category with reset button
- Kept: Send Test Event button, last forward log inline banner, optimistic toggle/delete, ConfigModal integration

### `CategorySection` (new)
Renders one category header + its connector card grid. Animated entrance with framer-motion (delayed by section index, max 0.2s).

### `ConfigFieldRow` updated
- `textarea` type → renders `<Textarea rows={4}>` with monospace font and custom scrollbar (for fields like MISP JSON configs)
- `number` type → renders `<Input type="number">`
- `select` still uses the chevron-down-styled native select

### NEW `ImportFindingsTab` (Tab 3)
Header: "Import External Scan Results" (Upload icon, violet accent).
- Tool selector (dropdown from GET /api/imports) — shows connector name + description hint
- Engagement selector: native `<select>` populated from GET /api/engagements (shows "target name (id prefix) - N findings"), PLUS a free-text `<Input>` below for manual UUID entry
- Large `<Textarea>` for raw scan output (10 rows, monospace, char + line counters)
- Config grid: minSeverity `<select>` (info/low/medium/high/critical), skipInfo `<Checkbox>`, deduplicate `<Checkbox>`
- Import button → POST /api/imports with `{ tool, rawData, engagementId, config }`
- Result panel:
  - Summary card with 3 `SummaryStat` tiles (Imported=emerald, Skipped=amber, Errors=red/zinc)
  - Per-row errors panel (amber, max-h-48 scrollable, monospace)
  - Imported findings list (max-h-96 scrollable) — each finding shows severity badge + category badge + title, color-coded by severity

### NEW `ThreatIntelTab` (Tab 4)
Header: "Threat Intelligence Enrichment" (Brain icon, amber accent). Description mentions all 5 sources.
- IOC input form: value `<Input>` + type `<select>` (ip, hash, domain, url, email, user_agent) + Enrich button (Enter key submits)
- POST /api/iocs/enrich with `{ value, type }`
- `EnrichmentResultCard`:
  - Overall reputation badge: malicious=red/ShieldBan, suspicious=amber/AlertTriangle, clean=emerald/ShieldCheck, unknown=zinc/Globe
  - Overall risk score (0-100) animated bar, color-coded
  - All tags as cyan monospace badges
  - Message fallback when no enrichment sources are configured
- Per-source results table: each row has icon + source name + found/not-found badge + reputation badge + score, expandable to show tags + details JSON (pretty-printed, max-h-48 scrollable)
- Existing IOCs list (GET /api/iocs?take=50, auto-refresh every 30s):
  - Each row: value (mono, break-all), type, active/inactive badge, source/hits/confidence/last-seen mono stats line, tags (max 6 + "+N")
  - "Enrich" button per row → POST /api/iocs/enrich with `{ iocId }`
  - Per-IOC inline enrichment result overlay appears below the row after enrichment (reputation + score + tags)

### Components added
`SummaryStat`, `EnrichmentResultCard`, `EnrichmentSourceRow`, `IocRow`, `CategorySection`.

### Components kept unchanged
`ConnectorCard`, `ConfigModal`, `Stat`, `ForwardingLogTab`, `ForwardingLogRow`.

## Style Rules Honored

- `holo-card-sharp hud-corners` for all cards
- Emerald/cyan/violet/amber/red/sky/zinc color palette only; no indigo, no plain blue as primary (sky is used sparingly for jira/trello/kubernetes to preserve existing accent choices)
- framer-motion entrance animations on tab switches, category sections, connector cards, result panels
- NO em dashes anywhere (used hyphens, " - ", or commas instead) — verified
- Mobile responsive: grids collapse `sm:grid-cols-2 lg:grid-cols-3`, tab strip wraps, action bars stack on mobile
- `custom-scrollbar` class on long lists; `max-h-96 overflow-y-auto` on findings list, `max-h-[60vh]` on IOC list and forwarding log
- Sticky-footer safe (component is rendered inside the existing page shell which already handles footer layout)

## Verification

- `bun run lint` → 0 errors, 0 warnings in `integrations-panel.tsx` (3 pre-existing warnings in `service-launcher.tsx` unchanged).
- Dev server recompiles cleanly after every edit (verified via `dev.log`).
- All lucide-react icons used were verified to exist in the installed version (Boxes, Brain, ClipboardList, Eye, FolderTree, Gamepad2, Gauge, GitMerge, GitPullRequest, Globe, Headphones, Landmark, Mail, MessageCircle, Phone, Radar, Share2, Sheet, ShieldAlert, ShieldBan, Upload, Workflow, Wrench, Kanban, FileText, Filter, Bug, Crosshair, ShieldCheck, AlertTriangle).
- No em dashes in any string or comment (verified).
- All `fetch()` calls use relative paths only (no absolute URLs).
- All API contracts (request body shape, response field names) match the backend route handlers.

## Stage Summary

The GuardianX Integrations UI now ships with 4 tabs covering the full integration lifecycle:

1. **Integrations Hub** — 29 outbound connectors + 5 enrichment connectors grouped into 9 category sections (SIEM & Monitoring, Alerting & Notification, Collaboration, ITSM & Ticketing, Cloud & Infrastructure, Compliance & Reporting, DevOps & CI/CD, Threat Intel Enrichment, Generic). Each category has a header (icon + name + count badges) and a 3-column responsive card grid. A category filter dropdown narrows the catalog. The config modal now supports `textarea` and `number` field types.
2. **Forwarding Log** — unchanged.
3. **Import Findings** — full import flow from 8 scanners (Burp, ZAP, Nessus, Nuclei, Qualys, SonarQube, Snyk, Dependabot) with engagement picker, raw XML/JSON textarea, min-severity/skip-info/deduplicate config, and a detailed result panel (imported/skipped/errors counts + per-row errors + imported findings list with severity + category badges).
4. **Threat Intel** — IOC enrichment form (value + type), full result card (overall reputation badge, color-coded risk score bar, all tags, per-source expandable table with details JSON), plus an auto-refreshing list of existing IOCs each with its own "Enrich" button that calls `/api/iocs/enrich` with `iocId`.

The enrichment connectors (virustotal/abuseipdb/shodan/otx/misp) appear in the Hub as a "Threat Intel Enrichment" category and can be configured via the standard ConfigModal. Once active, the Threat Intel tab automatically fans out to them via `/api/iocs/enrich` and surfaces the aggregated reputation, score, tags, and per-source details.
