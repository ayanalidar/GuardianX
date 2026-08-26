---
Task ID: vapt-ssti-auth-authz
Agent: full-stack-developer
Scope: GuardianX Next.js web app at /home/z/my-project
Task: SSTI Testing + Authentication Testing + Authorization Testing
Started: in-progress

## Goal

Add 3 new VAPT modules to GuardianX:
1. **SSTI Testing** — Server-Side Template Injection (Jinja2/Twig/FreeMarker/Velocity/Smarty/ERB/Thymeleaf)
2. **Authentication Testing** — default creds, brute force, credential stuffing, password policy, account lockout, remember-me bypass, username enumeration
3. **Authorization Testing** — vertical priv esc, horizontal priv esc, forced browsing, function-level access control, IDOR, missing authz header

## Files to create

- `src/app/api/vapt/ssti/route.ts` — POST, auth-required, maxDuration=30, force-dynamic
- `src/app/api/vapt/authentication/route.ts` — same
- `src/app/api/vapt/authorization/route.ts` — same
- `src/components/sentinel/ssti-testing.tsx` — `"use client"` full-screen tab
- `src/components/sentinel/authentication-testing.tsx` — same
- `src/components/sentinel/authorization-testing.tsx` — same

## Pattern reference

I read these existing files before starting:
- `src/app/api/vapt/ssrf-deep/route.ts` — SSRF guard pattern, timedFetch, db.engagement.create + db.finding.create pattern, returns engagementId + testedCount + vulnerableCount + findings
- `src/app/api/vapt/business-logic/route.ts` — alternative engagement pattern with target auto-create
- `src/components/sentinel/ssrf-deep-testing.tsx` — hud-corners + dark theme + mobile-first card layout
- `src/components/sentinel/business-logic-testing.tsx` — framer-motion + recharts usage
- `src/components/sentinel/jwt-auth-testing.tsx` — Attack type badges
- `src/lib/auth.ts` — `requireAuth` returns `{ok:true,user}` or `{ok:false,response}`
- `src/lib/db.ts` — Prisma-compatible proxy over Supabase
- `prisma/schema.prisma` — Finding/Engagement/Target models

## Constraints

- TypeScript strict, `"use client"` on components
- shadcn/ui + lucide + framer-motion + recharts
- NO indigo/blue colors
- Dark theme, mobile-first
- Use `requireAuth`, `db.engagement.create`, `db.finding.create`
- Use `AbortController` with 5s timeout per request
- maxDuration=30 per route
- Must NOT touch page.tsx, src/lib/*, prisma/*, war-room/*, existing API routes
