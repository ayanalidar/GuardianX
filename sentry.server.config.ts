// Sentry Node.js server config.
//
// Auto-imported by `@sentry/nextjs` into the Node.js runtime (page renders,
// API routes, server actions, `getServerSideProps`). Initialization is
// gated on `SENTRY_DSN` so the entire integration is a graceful no-op in
// dev or on deployments that haven't configured Sentry yet.
//
// All `captureError(...)` calls from `src/lib/sentry.ts` flow through here.

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance tracing is off by default. Set SENTRY_TRACES_SAMPLE_RATE
    // (e.g. "0.1") in production to opt in.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),

    environment: process.env.NODE_ENV || "development",
    enabled: process.env.NODE_ENV === "production",

    // Strip request bodies + cookies before the event leaves the server.
    // GuardianX API bodies frequently contain passwords, SMTP credentials,
    // integration tokens, etc. — none of these should ever reach Sentry.
    // We keep the URL (path only — Next already strips the query on the
    // server, but Sentry re-parses it; the beforeSend hook below nukes any
    // query string just to be safe).
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        event.request.cookies = undefined;
        event.request.data = undefined;
        event.request.query_string = undefined;
        // Truncate headers — keep only the names so we know which were set,
        // but blank the values (Authorization, Cookie, etc. can leak).
        if (event.request.headers) {
          const redacted: Record<string, string> = {};
          for (const k of Object.keys(event.request.headers)) {
            redacted[k] = "[redacted]";
          }
          event.request.headers = redacted;
        }
      }
      return event;
    },
  });
}
