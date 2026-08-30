# Task `onboarding-and-demo` — full-stack-developer

## Goal
Add (1) a 4-step onboarding wizard for first-time admins and (2) a read-only demo mode for unauthenticated visitors to the GuardianX Next.js app.

## Files touched

### Created
- `src/components/sentinel/demo-mode.tsx` — self-contained read-only Command Center mock with sticky banner, KPI strip, 4 tabs (Overview / Findings / Clients / Codebases), 6 mock findings, 3 mock clients, 4 mock codebases. All interactive elements wrapped in a `DemoButton` (disabled span + Tooltip "Sign up to use this feature").

### Refactored
- `src/components/sentinel/onboarding-wizard.tsx` — replaced internal `open` state + `onComplete` prop with `open: boolean` + `onClose: () => void` props. Reduced to a strict 4-step flow (Welcome → Add Client → Add Codebase → Run Scan). 4-dot progress indicator. Sets `localStorage["guardianx-onboarded"] = "true"` on completion.

### Modified (plumbing)
- `src/components/sentinel/landing-page.tsx` — added `onTryDemo: () => void` prop, threaded to `HeroSection`.
- `src/components/sentinel/landing/hero-section.tsx` — added `onTryDemo` prop, added "Try Demo" `GlowCTA` (Film icon, outline variant) next to "Enter the Lab Console".
- `src/app/page.tsx` — added `"demo"` to view union, imported `OnboardingWizard` + `DemoMode`, added `showOnboarding` state + view-driven `useEffect`, added `tryDemo` handler, renders `DemoMode` for `view === "demo"` and `OnboardingWizard` overlay alongside `ConsoleView` for `view === "console"`.

## Verification
- `bunx tsc --noEmit 2>&1 | grep -E "onboarding|demo-mode|page.tsx"` → 0 matches (no type errors in touched files).
- `bun run lint` → 0 errors / 0 warnings in the touched files (used `// eslint-disable-next-line react-hooks/set-state-in-effect` consistent with existing ConsoleView pattern at line ~127).
- Dev server recompiled cleanly; `/` returns 200 OK.

## Notes for downstream agents
- The `OnboardingWizard` is now **fully controlled** — the parent owns the `open` flag. The component resets internal state (step, created client/codebase, scan progress) on each open via a `useEffect` keyed on `open`.
- The `guardianx-onboarded` localStorage key is the single source of truth for "has this user finished onboarding". The parent checks it on each `view === "console"` transition.
- `DemoMode` does not depend on any of the existing Command Center internals (no `sentinelApi`, no socket, no auth) — it ships its own mock data and is intentionally standalone so it stays read-only.
- All interactive elements in `DemoMode` use the local `DemoButton` component (a disabled `<span role="button">` wrapped in a shadcn `Tooltip`). To unlock one of them for a future "freemium" action, swap the `DemoButton` for a real `Button` with an `onClick` — no other wiring needed.
