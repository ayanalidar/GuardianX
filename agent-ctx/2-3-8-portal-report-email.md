# Task 2-3-8 - Client Portal UI + Report Generation Fix + Email Notifications

**Agent:** main
**Task ID:** 2-3-8
**Date:** 2026
**Status:** complete

## Scope
Three improvements delivered in one session:
1. **Task 2** - Polished client-facing dashboard at `/portal` (login + dashboard with PostureScore gauge, findings by severity, patch status, recent incidents, compliance, download report button).
2. **Task 3** - Fixed PDF report generation by adding an HTML fallback route (`/api/engagements/[id]/report-html`) and a "Download Report (HTML)" button in `client-detail.tsx`. The existing PDF route now 307-redirects to the HTML route when the Railway engine is unreachable.
3. **Task 8** - Real email sending via `nodemailer` (`src/lib/email.ts`). Updated `/api/email-digest` to actually send emails. Added `/api/notifications/send` for manual notifications with `AuditLog` support.

## Files created
- `src/lib/email.ts` - `sendEmail(to, subject, html)` with SMTP env config + dev-log fallback.
- `src/app/api/notifications/send/route.ts` - manual notification endpoint with AuditLog.
- `src/app/api/engagements/[id]/report-html/route.ts` - print-ready HTML VAPT report.
- `src/components/sentinel/client-portal.tsx` - login + dashboard component (~750 lines).
- `src/app/portal/page.tsx` - renders ClientPortal.

## Files modified
- `src/app/api/client-portal/route.ts` - added findings_by_severity, patches_by_status, recent_incidents, compliance, engagement_ids fields (backward compatible).
- `src/app/api/email-digest/route.ts` - now actually calls sendEmail per client; builds HTML email.
- `src/app/api/engagements/[id]/report/route.ts` - falls back to HTML route via 307 redirect on engine failure.
- `src/components/sentinel/client-detail.tsx` - added "Download Report (HTML)" button + authenticated blob fetching for both report buttons; added amber/sky/violet to ActionButton colorMap.

## Dependencies installed
- `nodemailer@9.0.3`
- `@types/nodemailer@8.0.1`

## API contracts

### GET /api/client-portal?clientId=xxx
Extended response (additions only, existing fields unchanged):
```json
{
  "client": { "name", "description", "status", "frameworks": [], "target_url" },
  "stats": { ..., "rejected_patches": N },
  "findings_by_severity": { "critical": N, "high": N, "medium": N, "low": N, "info": N },
  "patches_by_status": { "pending": N, "approved": N, "rejected": N },
  "risk": { "score": N, "level": "LOW|MODERATE|ELEVATED|CRITICAL", "posture_score": N },
  "compliance": [{ "name": "DPDPA", "score": N, "status": "compliant|at-risk|non-compliant", "mapped_findings": N }],
  "recent_findings": [{ "title", "severity", "endpoint", "category", "createdAt" }],
  "recent_patches": [{ "title", "severity", "status", "patchId", "createdAt" }],
  "recent_incidents": [{ "id", "title", "severity", "status", "category", "detectedAt" }],
  "engagement_ids": ["engagementId1", ...],
  "generated_at": "ISO timestamp"
}
```
Requires `Authorization: Bearer <portal-token>` (issued by `/api/client-portal-auth`).

### GET /api/engagements/[id]/report-html
Returns `text/html`. Path param accepts either an engagement id OR a target id (resolves to the latest engagement for that target). Renders a full printable VAPT report with cover, executive summary, findings table, patches table, compliance mapping, and cleanup certificate. Includes a "Print / Save as PDF" button that calls `window.print()`.

### GET /api/engagements/[id]/report
Unchanged contract for the success case (streams `application/pdf`). On engine failure, now 307-redirects to `/api/engagements/[id]/report-html` instead of returning a JSON error.

### GET /api/email-digest?clientId=xxx&period=daily|weekly&dryRun=true
Now actually sends emails. Response additions:
```json
{
  "digests": [{ ..., "html": "...", "sent": true|false, "error"?: "..." }],
  "smtp_configured": true|false,
  "delivery_mode": "smtp" | "dev-log" | "dry-run"
}
```

### POST /api/notifications/send
Body: `{ "to": string, "subject": string, "message": string, "clientId"?: string }`
Requires `Authorization: Bearer <guardianx-token>` (any role). Response:
```json
{ "ok": true, "sent": true, "to": "...", "subject": "...", "smtp_configured": true|false, "delivery_mode": "smtp"|"dev-log", "audit_logged": true|false, "timestamp": "ISO" }
```
On failure returns 502 with `{ "ok": false, "sent": false, "error": "...", "smtp_configured": ... }`.

## SMTP env vars
- `SMTP_HOST` (required for SMTP mode, e.g. `smtp.gmail.com`)
- `SMTP_PORT` (default 587)
- `SMTP_USER` (required for SMTP mode)
- `SMTP_PASS` (required for SMTP mode)
- `SMTP_FROM` (optional, defaults to SMTP_USER; e.g. `GuardianX <alerts@guardianx.in>`)
- `SMTP_SECURE` (optional `"true"` forces TLS; auto-detected from port 465)

If any of HOST/USER/PASS is unset, `sendEmail` logs the email to stdout and returns true (dev mode).

## Quality gates
- `bun run lint`: 0 errors in any new/modified file. 3 pre-existing warnings in `service-launcher.tsx` remain.
- `npx tsc --noEmit`: 0 errors in any new/modified file. Project-wide pre-existing errors reduced from 330 to 303 (rewrites of `client-portal/route.ts` and `email-digest/route.ts` eliminated their pre-existing errors).
- All Prisma field accesses use the `Record<string, unknown>` cast pattern from the existing `/api/compliance/route.ts`.

## Style notes
- Portal uses dark `zinc-950` background but cleaner/enterprise (no scanlines/cyber-grid/neon glows on data tiles) per the task's "less hacker" requirement.
- All report downloads use authenticated blob fetching: `fetch(url, { headers: { Authorization: 'Bearer ...' } }) -> res.blob() -> URL.createObjectURL() -> window.open()`. This is necessary because `window.open(url)` in a new tab does not carry the JWT from localStorage, and the middleware would block the request with 401.
- NO em dashes in any new file (used hyphens, commas, periods, "to", "and" instead).
- Mobile-first responsive throughout.

## Coordination with future agents
- The `/portal` route is a public client-facing route. The component handles its own auth flow via `/api/client-portal-auth` (already in `PUBLIC_ROUTES` of `src/middleware.ts`). No middleware changes were needed.
- The `report-html` route is auth-gated by middleware (requires Bearer token). The `client-detail.tsx` and `client-portal.tsx` buttons fetch the HTML via authenticated `fetch()` and open a blob URL, so this works correctly.
- The `notifications/send` route uses `getUserFromRequest(req)` from `src/lib/auth.ts` (not the Edge middleware) for auth, because it needs the full user object including `email` and `name` for the audit log.
