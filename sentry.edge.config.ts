// Sentry Edge-runtime config.
//
// Auto-imported by `@sentry/nextjs` into the Edge runtime (middleware,
// Edge API routes, server components running on the Edge). The Edge runtime
// is a subset of Node — only Web APIs are available, no `node:*` modules,
// no `process.env`-reading convenience beyond what Vercel passes in.
//
// Initialization is gated on `SENTRY_DSN` so the integration is a graceful
// no-op when Sentry isn't configured. The `init` call is otherwise identical
// to the server config — Sentry auto-detects the runtime and uses the right
// transport.

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    environment: process.env.NODE_ENV || "development",
    enabled: process.env.NODE_ENV === "production",
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        event.request.cookies = undefined;
        event.request.data = undefined;
        event.request.query_string = undefined;
      }
      return event;
    },
  });
}
