# Task frontend-update — GuardianX UI feature wiring

**Agent:** main
**Task ID:** `frontend-update`
**Status:** complete

## Summary

Wired 8 missing UI components into the GuardianX console at `/home/z/GuardianX-web`, plus built the 7 backend API routes + 1 Supabase migration + 2 Prisma models those components depend on. The console now exposes a billing panel, an org switcher, a 4-step onboarding tour, a floating support chat, an admin user-activity monitor, two role-specific banners (admin 2FA prompt + analyst info), a cookie-consent banner, and a Settings panel with Security / Organization / Email Delivery tabs.

## Files created / modified

### New components (the 8 from the task spec)
- `src/components/sentinel/support-chat.tsx` — floating bottom-right chat widget. Round launcher + slide-up panel. Persists the conversation in localStorage, fetches prior tickets via `GET /api/support/ticket`, files new tickets via `POST /api/support/ticket`. Admin role auto-tags priority=high and shows an amber "Priority: Admin" badge. Links to `/features` (Docs) and `/architecture` (API Docs). Stacks above the onboarding help button via `bottomOffset`.
- `src/components/sentinel/analyst-onboarding.tsx` — 4-step guided tour (Welcome → Create Client → Upload Code → Run Scan). Auto-opens 800ms after mount when `role === "viewer"` and `localStorage["guardianx-onboarding-completed"]` is unset. Spotlight effect computes a `radial-gradient` mask from the highlighted element's `getBoundingClientRect()` (looks up elements by `[data-onboarding="clients"]`, etc. — added those data attributes on the relevant sidebar slots in `page.tsx`). Floating help button (bottom-right, above the support chat) replays the tour anytime.
- `src/components/sentinel/billing-panel.tsx` — three pricing cards (Free / Pro ₹5,000/mo / Enterprise Custom) with the "Most popular" highlight on Pro. Current-plan banner with usage tiles (clients + scans, percent + approaching-limit warning). `Upgrade` → `POST /api/billing/checkout`, `Manage Subscription` → `POST /api/billing/portal`. Falls back gracefully when Stripe isn't configured (shows a "billing disabled" banner with the env vars to set).
- `src/components/sentinel/org-switcher.tsx` — sidebar header dropdown. Lists personal workspace + every org from `GET /api/orgs`. Persists the active workspace in localStorage and patches `globalThis.fetch` so every subsequent GuardianX API request carries `x-guardianx-workspace: <id>`. "Create Organization" dialog (admin-only) calls `POST /api/orgs` with auto-slug generation.
- `src/components/sentinel/user-activity-monitor.tsx` — admin-only user activity table. Summary tiles: total users / active today / 2FA enabled ratio / total clients across users. Table rows: avatar, name+email, role badge, client count, last login, last activity, 2FA icon. Click to expand and see that user's last 5 audit entries. Auto-refreshes every 30s.
- `src/components/sentinel/admin-2fa-banner.tsx` — amber banner above the command center for admins without 2FA. `POST /api/2fa {action:"status"}` to detect. "Enable 2FA" button → `onOpenSettings()` (caller switches to Settings tab). Dismissible per-session via `sessionStorage`.
- `src/components/sentinel/analyst-banner.tsx` — sky-blue banner for `role === "viewer"`. "You are signed in as an Analyst. Upload your own clients for testing." CTA navigates to the Clients tab. Dismissible per-session.
- `src/components/sentinel/cookie-banner.tsx` — GDPR/DPDPA bottom banner mounted in `layout.tsx` after `<Toaster />`. Accept / Decline buttons persist to localStorage and dispatch a `guardianx:cookie-consent` CustomEvent. Links to `/privacy`. SSR-safe via `mounted` guard.

### Settings panel (new)
- `src/components/sentinel/settings-panel.tsx` — Tabs UI with three tabs:
  - **Security** — full 2FA setup flow (scan QR → enter 6-digit code → save backup codes), disable button, and a login-history card that pulls `GET /api/admin/login-history` and renders auth-related audit entries with color-coded action badges.
  - **Organization** — admin-only org manager: list orgs + members, create org (with auto-slug), invite teammate (email + role). Non-admins see orgs but can't mutate.
  - **Email Delivery** — admin-only, polls `GET /api/admin/email-delivery`. Shows sent/failed/pending/total stat tiles + a scrollable mail log. Gracefully handles the case where the `MailLog` table doesn't exist (returns `tableMissing: true`).

### Backend API routes (all new)
- `src/app/api/support/ticket/route.ts` — `GET` (your tickets) + `POST` (file a ticket from the chat widget). Validates message length 3–4000 chars; admins auto-get priority `high`.
- `src/app/api/billing/status/route.ts` — `GET` returns `{stripeEnabled, plan, status, limits, usage{clientsUsed, scansUsed, percents}, currentPeriodEnd, cancelAtPeriodEnd, stripeCustomerId}`. Plan limits matrix (Free 3/10, Pro 25/250, Enterprise ∞/∞). Admin usage is computed live from `db.client.count({})` + `db.scan.count({})`; viewer usage is approximated from `db.auditLog.findMany({actor: email, action contains "create"})`.
- `src/app/api/billing/checkout/route.ts` — `POST {plan}` returns `{url, sessionId}` for Stripe Checkout (subscription mode). Lazy-imports `stripe` so the route doesn't crash at import time when `STRIPE_SECRET_KEY` isn't set. Falls back to `{stripeEnabled: false, message}` when Stripe is unconfigured or no price is mapped to the requested plan.
- `src/app/api/billing/portal/route.ts` — `POST` opens the Stripe Customer Portal. Looks up `stripeCustomerId` from the Subscription row; if missing, falls back to a `customers.list({email})` lookup. Returns `{url}`.
- `src/app/api/admin/user-activity/route.ts` — `GET`, admin-only. Joins `User` rows against the last 2000 `AuditLog` entries bucketed by actor email. Returns `{summary, users[]}` where each user has its 5 most-recent audit entries pre-fetched. Computes "active today" from `lastActivity` timestamps.
- `src/app/api/admin/login-history/route.ts` — `GET`, auth-required. Defaults to the caller's own events; admins can pass `?scope=all` to see everyone. Filters to login/logout/2FA/password/approve actions.
- `src/app/api/admin/email-delivery/route.ts` — `GET`, admin-only. Reads the `MailLog` table (returns `tableMissing: true` instead of erroring if it doesn't exist) and returns the 100 most recent entries + a `{sent, failed, pending, total}` summary.

### Database changes
- `prisma/schema.prisma` — added `SupportTicket` (id, userId, subject, message, priority, status, reply, timestamps) and `Subscription` (id, userId unique, plan, status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, cancelAtPeriodEnd, clientsUsed, scansUsed, timestamps) models.
- `supabase/migrations/0010_support_billing.sql` — creates both tables with `TIMESTAMPTZ` defaults, indexes on `(userId, createdAt DESC)` and `(status, createdAt DESC)`, grants `service_role` all + `anon/authenticated` CRUD, disables RLS (the app uses `service_role`).
- `src/lib/db.ts` — added `supportTicket: "SupportTicket"` and `subscription: "Subscription"` to `MODEL_TO_TABLE` so `db.supportTicket.*` / `db.subscription.*` route through the existing Supabase-REST dispatcher.

### Wiring
- `src/app/page.tsx`:
  - Imports all 8 new components + `SettingsPanel`.
  - Extended `Tab` union with `"billing" | "user-activity" | "settings"`.
  - Added `<OrgSwitcher>` slot in the sidebar header (between the logo and the nav).
  - Added `<AdminTwoFactorBanner onOpenSettings={() => setTab("settings")} />` and `<AnalystBanner onNavigate={(t) => setTab(t)} />` directly above the main content (after `<main className="flex-1 p-4 sm:p-6">`).
  - Added Billing / Settings NavItems in the Advanced group + User Activity NavItem in the Administration group (admin-only).
  - Added tab content cases for `billing`, `user-activity`, `settings` in the conditional render tree.
  - Added header title + neon color mappings for the three new tabs.
  - Mounted `<AnalystOnboarding>` and `<SupportChat>` at the bottom of `ConsoleView` (both are `position: fixed`, stacking with `bottomOffset`).
  - Added `data-onboarding="clients"` / `"codebases"` / `"patches"` data attributes on the relevant sidebar slots + composer so the onboarding spotlight can find them.
  - Imported 3 new lucide icons: `CreditCard`, `Settings`, `UserCog`.
- `src/app/layout.tsx` — imported `<CookieBanner>` and rendered it right after `<Toaster />` so it overlays every page (including the landing page) on first visit.

## Constraints honored

- All 8 new components are `"use client"` + TypeScript.
- Dark theme throughout — substrate `zinc-950`, accents emerald / amber / sky / purple. No indigo or blue.
- shadcn/ui components used exclusively: `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Skeleton`, `Progress`, `Label`, `DropdownMenu`, `Dialog`, `Tabs`, `Table`.
- `framer-motion` for all transitions (spring-based launches, AnimatePresence for dismissals + spotlight mask).
- Mobile-first responsive: sidebar collapses on mobile, chat panel is `width: min(380px, calc(100vw - 2rem))`, cookie banner stacks vertically on small screens.
- Reuses the existing `useToast` hook + `holo-card` / `hud-corners` / `pulse-dot` / `neon-emerald` design tokens so the new UI matches the existing console.

## Verification

- `bun run lint` → **0 errors, 5 warnings** (all 5 pre-existing in `contributors-panel.tsx` + `service-launcher.tsx`, untouched by this task).
- `bunx tsc --noEmit -p tsconfig.json` filtered to the touched files → **0 errors** in:
  - All 8 new components
  - All 7 new API routes (`/api/support/ticket`, `/api/billing/{status,checkout,portal}`, `/api/admin/{user-activity,login-history,email-delivery}`)
  - `src/lib/db.ts` (only the 2-line `MODEL_TO_TABLE` addition; pre-existing Supabase typing errors are unrelated and tolerated by `next.config.ts`'s `typescript.ignoreBuildErrors: true`)
- Installed `stripe@22.5.0` as a new dependency (needed for `import("stripe")` dynamic imports in the checkout + portal routes).

## Notes for the next session

- **Stripe env vars** (when going live): set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`. Without them, the Billing panel shows a "billing disabled" banner — the rest of the UI keeps working. The webhook route (`/api/billing/webhook`) is already whitelisted in `src/middleware.ts`'s `PUBLIC_ROUTES`.
- **`MailLog` table**: the Email Delivery tab gracefully handles its absence. If you want email logging to actually populate, add a `MailLog` table via Supabase migration and have `src/lib/email.ts` insert rows on send.
- **`x-guardianx-workspace` header** is set on every relative fetch by `org-switcher.tsx`'s `globalThis.fetch` monkey-patch. Downstream API routes can read `req.headers.get("x-guardianx-workspace")` to scope queries per workspace — none do yet, but the plumbing is in place.
- **Onboarding spotlight** depends on `[data-onboarding="..."]` selectors being present on the sidebar NavItem wrappers. I added them on the "All Clients", "Codebases", and "Patch Queue" targets in `page.tsx`. If you rename those slots, update the `STEPS` array's `spotlightSelector` strings in `analyst-onboarding.tsx`.
- **User activity "Clients" column** is approximate for viewers — the `Client` table has no `ownerId`, so we attribute clients to users by counting `AuditLog` rows where `action` contains "create" AND `entity` contains "client". For admins we just show the global total. If you want true per-user client ownership, add a `userId` column to `Client` and update `/api/admin/user-activity` to read it.
- **`Stripe` API version**: pinned to `2025-08-27.basil` (latest stable as of stripe@22.5.0). Cast through `as never` to keep TS happy with the version-string union.
