# Task 2 - DFIR API Build

**Agent:** main
**Task ID:** 2
**Scope:** Build the complete DFIR (Digital Forensics & Incident Response) API for GuardianX - 11 API routes.

## Files Delivered (all under `src/app/api/`)

| # | Route | Methods | Purpose |
|---|-------|---------|---------|
| 1 | `incidents/route.ts` | GET, POST | List incidents (filters: status/severity/category/clientId/take) + create with auto `incident_created` event |
| 2 | `incidents/[id]/route.ts` | GET, PATCH | Full incident detail (events + evidence included) + status/severity/assignee updates with auto status-change event + timestamp stamping (containedAt/eradicatedAt/closedAt) |
| 3 | `incidents/[id]/timeline/route.ts` | GET | Unified forensic timeline merging IncidentEvent + AuditLog + ApiAccessLog + HoneypotHit + Canary + Finding + Patch within the incident's detectedAt -> closedAt window, sorted chronologically |
| 4 | `incidents/[id]/contain/route.ts` | POST | Auto-containment: sets status=contained, containedAt=now, revokes target authorization (db.target.update authorized=false), records containment IncidentEvent. Body: `{action: isolate\|block_ip\|rotate_credentials}` |
| 5 | `incidents/[id]/evidence/route.ts` | GET, POST | List evidence + collect new evidence with SHA-256 hash (node:crypto), immutable chain-of-custody entry, auto timeline note |
| 6 | `incidents/[id]/events/route.ts` | POST | Add manual note/event. eventType=note, source=manual, actor from x-user-name header |
| 7 | `incidents/auto-create/route.ts` | POST | Cron hook: fetches /api/anomaly-detection, dedupes by SHA-1(anomalyTitle) sourceId, auto-creates incidents for critical/warning anomalies with source=anomaly |
| 8 | `iocs/route.ts` | GET, POST | List IOCs (filters: type/active/source) + add IOC with upsert semantics (increment hitCount + refresh lastSeen if value exists) |
| 9 | `iocs/check/route.ts` | POST | Check if value is known IOC. Bumps hitCount + lastSeen on hit. Returns `{found, ioc}` |
| 10 | `playbooks/route.ts` | GET, POST | List active playbooks + create new playbook (admin only) |
| 11 | `playbooks/[id]/execute/route.ts` | POST | Execute playbook against incident: creates IncidentEvent per step, automated steps = "executed", manual steps = "pending" |

## Coding Patterns Used (match existing GuardianX conventions)

- `export const dynamic = "force-dynamic";`
- `import { NextResponse } from "next/server";`
- `import { db } from "@/lib/db";` (Supabase REST proxy, Prisma-like API)
- `import { requireAuth, requireAdmin } from "@/lib/auth";`
- `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params;`
- Dates: `(record.detectedAt as Date).toISOString()` on read, `new Date()` on write
- JSON fields: `JSON.parse(record.metadata || "{}")` on read, `JSON.stringify(data)` on write
- IDs: `const { randomUUID } = await import("node:crypto");`
- Hashes: `const { createHash } = await import("node:crypto");`
- Error handling: `try { ... } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 }); }`
- Server-to-server fetch: `http://localhost:3000/api/...` (same pattern as `full-vapt/route.ts`)

## Quality Gates

- `npx tsc --noEmit`: **0 errors** in all 11 new files (after fixing 9 initial strict-mode type errors caused by `unknown` -> `string` coercions on DB proxy results)
- `bun run lint`: **0 errors** (3 pre-existing warnings in `service-launcher.tsx`, unrelated)
- Dev server (`dev.log`): clean, no compile errors during edits

## Defensive Coding Highlights

- Enum whitelists for all status/severity/category/source/iocType/evidenceType/action fields
- 404 checks before every mutation
- Idempotent containment (no-op if already contained/eradicated/closed)
- Each timeline source wrapped in try/catch so a missing/empty table doesn't break the whole feed
- Concurrent-update tolerance on IOC hit bumps (try/catch around the update, falls back to original record)
- Status transition backfill: closing an incident auto-stamps containedAt + eradicatedAt if they were skipped
- Evidence immutability flag set on creation; SHA-256 recorded in chain-of-custody
- Anomaly auto-create dedupes via stable sourceId hash so cron re-runs don't file duplicate incidents
