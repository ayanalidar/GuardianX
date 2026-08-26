// Sentry browser/client config.
//
// This file is auto-imported by `@sentry/nextjs`'s `withSentryConfig`
// wrapper (see `next.config.ts`). It runs in the browser bundle and only
// initializes Sentry if `NEXT_PUBLIC_SENTRY_DSN` is set — this makes the
// integration a graceful no-op in dev and on deployments that haven't opted
// into Sentry yet, while still allowing production deployments to flip it
// on by setting a single env var.
//
// We prefer `NEXT_PUBLIC_SENTRY_DSN` on the client (Next.js only exposes
// NEXT_PUBLIC_* vars to the browser) and fall back to the server-side
// `SENTRY_DSN` so a deployment that only sets the latter still gets the
// server-side capture path (the client init simply skips).

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Set tracesSampleRate to 0.0 by default — Sentry's free tier is 5K
    // errors/month, and traces (performance) have a separate, much smaller
    // budget. Flip to 1.0 (or 0.1) in production only if you actually need
    // transaction profiling, otherwise you'll burn through the quota fast.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),

    // Replay captures the user's DOM at the moment of an error. Useful but
    // privacy-sensitive — keep it off by default and opt in per environment
    // via NEXT_PUBLIC_SENTRY_REPLAY=1.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1" ? 1.0 : 0,

    // Don't send Sentry events while running tests / in dev — saves quota.
    environment: process.env.NODE_ENV || "development",
    enabled: process.env.NODE_ENV === "production",

    // Strip common PII / secret values before the event leaves the browser.
    // Sentry has built-in scrubbing but these keys are GuardianX-specific.
    beforeSend(event) {
      if (event.request) {
        // Never leak cookies (auth JWT is in there) or query strings (may
        // contain tokens for password-reset / email-verification flows).
        event.request.cookies = undefined;
        event.request.query_string = undefined;
      }
      return event;
    },

    integrations: [
      // Replay integration is only added when explicitly opted in.
      ...(process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1"
        ? [Sentry.replayIntegration()]
        : []),
    ],
  });
}
