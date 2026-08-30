# Task: api-docs-and-mobile
**Agent:** full-stack-developer
**Date:** 2026-01-21

## Summary

Fixed API docs page verification + audited and patched mobile responsiveness across the landing, command-center, auth, and war-room surfaces.

## Task 1: API Documentation Page

**Status: WORKING — no fixes required.**

- `/api/openapi.json` returns a valid OpenAPI 3.0.3 spec.
  - 34 paths, 54 operations, 12 tags (Auth, Clients, Codebases, Scans, Patches, Incidents, IOCs, Settings, Users, Admin, Monitoring, Webhooks).
  - Well above the 10-20 endpoint requirement.
  - Hand-written spec at `src/app/api/openapi.json/route.ts` with shared schema fragments (`ERROR_RESPONSES`, `BearerAuth` security scheme, etc.).
  - `curl -sS http://127.0.0.1:3000/api/openapi.json | head -20` confirms valid JSON starting with `{"openapi":"3.0.3",...}`.
- `/api-doc` page returns HTTP 200.
  - Uses `swagger-ui-react` via `next/dynamic` with `ssr:false`.
  - Fetches spec client-side from `/api/openapi.json` with `cache: "no-store"`.
  - Renders inside a dark-themed wrapper (`bg-zinc-950`, emerald accents) with global CSS overrides to hide Swagger UI's topbar and match the GuardianX aesthetic.
  - Dev log shows `GET /api-doc 200 in 5.0s` (first compile) then `GET /api-doc 200 in 47ms` (cached).

## Task 2: Mobile Responsiveness Audit

### Files Audited + Fixes Applied

#### 1. `src/components/sentinel/command-center.tsx` (header)
**Issue:** The header's right-side controls group (`flex items-center gap-3`) contained a threat-level gauge (with 10-segment vertical bar), a live clock, and 6 action buttons (Guardian AI, War Room, Immersive View, Launch Service, Add Client). On a 320px screen this ~480px row would overflow horizontally with no wrapping.

**Fix:**
- Changed container to `flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end` — controls now wrap to multiple rows on narrow screens.
- Hid the threat gauge's 10-segment vertical bar on mobile via `hidden sm:flex` — the textual "GUARDED/ELEVATED/CRITICAL" label still conveys the level; saves ~16px horizontal space.

#### 2. `src/components/sentinel/war-room/war-room-overlay.tsx` (header, bottom panels, hint)
**Issues:**
- Top header (`flex items-center justify-between gap-4 px-6 py-4`) didn't wrap — on mobile the WAR ROOM title + state badge + posture gauge + clock + 4 toggle buttons would clip.
- Live terminal panel (`bottom-4 left-4 w-[420px]`) and Voice control panel (`bottom-4 right-4 w-[420px]`) overlapped ~90% on a 320px screen.
- Bottom keyboard hint (~120 chars at text-[10px]) overflowed horizontally on mobile.

**Fixes:**
- Top header → `flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4`.
- Header left/right sub-groups → `flex flex-wrap` with `justify-end` on the right group.
- Voice control panel → added `max-sm:bottom-[16rem]` so it stacks ABOVE the live terminal on mobile (below sm breakpoint) instead of overlapping.
- Bottom hint → split into desktop (`hidden sm:block`, full text) + mobile (`sm:hidden`, abbreviated "ESC exit · ← → view · V voice · G gesture") variants.
- Main content area → `px-6` → `px-4 sm:px-6` for more mobile breathing room.

#### 3. `src/components/sentinel/landing/hero-section.tsx` (terminal status row)
**Issue:** Terminal panel's bottom status row (`flex items-center justify-between`) had 3 spans (~290px total at text-[10px]) inside a ~272px mobile content area — borderline overflow.

**Fix:** Changed to `flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[9px] sm:text-[10px]` — spans now wrap gracefully and use a smaller font on mobile.

### Files Audited — Already Responsive (No Fixes Needed)

- **`src/components/sentinel/landing/scan-widget.tsx`**: Already uses `flex-col sm:flex-row` for input+CTA and email submit, `max-w-3xl` container, `p-5 sm:p-6` card padding, `flex flex-wrap` for done-state CTAs.
- **`src/components/sentinel/landing/features-section.tsx`**: Already uses `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, `text-xs`/`text-sm` throughout, `max-w-6xl` container.
- **`src/components/sentinel/auth-page.tsx`**: Already uses `max-w-md w-full p-4` wrapper, `p-8` card, `flex-1` mode-toggle buttons, full-width inputs.

### Transient Error Note
Dev log showed a transient compile error (`Badge` imported twice in hero-section.tsx) introduced during the prior onboarding+demo agent's edit. Verified the file now contains only a single `import { Badge } from "@/components/ui/badge";` on line 4 — the error self-resolved.

## Verification

- `bunx tsc --noEmit` → **0 errors** in touched files (command-center, war-room-overlay, hero-section).
  - The only tsc error is in a pre-existing root `index.ts` junk file containing "404: Not Found" — unrelated to this task.
- Dev server recompiles cleanly after all edits (`✓ Compiled in 506ms`).
- `curl http://127.0.0.1:3000/` → 200
- `curl http://127.0.0.1:3000/api-doc` → 200
- `curl http://127.0.0.1:3000/api/openapi.json` → 200

## Files Modified

1. `src/components/sentinel/command-center.tsx` — header controls wrap + threat segment bar hidden on mobile
2. `src/components/sentinel/war-room/war-room-overlay.tsx` — header wrap, voice panel mobile stacking, split desktop/mobile hint, main content padding
3. `src/components/sentinel/landing/hero-section.tsx` — terminal status row wraps with smaller mobile font
