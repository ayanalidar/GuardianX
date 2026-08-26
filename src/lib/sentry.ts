// GuardianX Sentry helper.
//
// Wraps `@sentry/nextjs`'s capture helpers in a single uniform `captureError`
// function that:
//   - Accepts anything throwable (Error, string, unknown from a catch).
//   - Attaches optional structured context (requestId, userId, tags, extra).
//   - Skips Sentry entirely when `SENTRY_DSN` is not set (graceful no-op).
//   - ALWAYS also writes a structured entry to the GuardianX logger so the
//     error is visible in stdout / log aggregation even if Sentry is off.
//
// Usage from an API route (you usually don't call this directly — the
// `withErrorHandler` wrapper in `src/lib/api-handler.ts` calls it for you):
//
//   import { captureError } from "@/lib/sentry";
//   try {
//     await risky();
//   } catch (err) {
//     await captureError(err, { requestId, userId, tags: { feature: "scan" } });
//     return NextResponse.json({ error: "boom" }, { status: 500 });
//   }

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENABLED =
  !!SENTRY_DSN && process.env.NODE_ENV === "production";

export interface CaptureContext {
  /** Correlation id for the current request. */
  requestId?: string;
  /** Acting user's id (sub of the JWT). */
  userId?: string;
  /** Sentry tags — indexed, searchable key/value pairs. */
  tags?: Record<string, string | number | boolean>;
  /** Sentry extra — non-indexed additional context. */
  extra?: Record<string, unknown>;
  /** Sentry fingerprint override — group similar errors together. */
  fingerprint?: string[];
  /** Logical section of the app where the error originated. */
  feature?: string;
}

/**
 * Normalise the various things a `catch` block can produce into an Error.
 * Strings, plain objects, and `{ message }` shapes all become Errors so the
 * downstream logger + Sentry always see a stack where possible.
 */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object") {
    const msg =
      (err as { message?: unknown }).message ?? JSON.stringify(err);
    return new Error(typeof msg === "string" ? msg : String(msg));
  }
  return new Error(String(err));
}

/**
 * Capture an error in Sentry (if configured) AND log it via the structured
 * logger. Returns immediately if Sentry isn't enabled, so callers don't
 * need to gate the call themselves.
 *
 * NEVER throws — even if Sentry's `captureException` itself fails (e.g. the
 * SDK wasn't initialised due to a runtime hiccup), we fall back to logging
 * only and swallow the secondary error.
 */
export function captureError(err: unknown, context: CaptureContext = {}): void {
  const error = toError(err);

  // Always log to stdout so the error is visible in the platform's log
  // pipeline (Vercel logs, Logtail, Datadog) regardless of whether Sentry
  // is configured.
  logger.error(error.message, {
    requestId: context.requestId,
    userId: context.userId,
    meta: {
      name: error.name,
      stack: error.stack,
      feature: context.feature,
      tags: context.tags,
      extra: context.extra,
    },
  });

  if (!SENTRY_ENABLED) {
    // Sentry not configured — graceful no-op. The error has already been
    // logged to stdout above.
    return;
  }

  try {
    Sentry.captureException(error, {
      tags: {
        ...(context.tags || {}),
        ...(context.feature ? { feature: context.feature } : {}),
      },
      extra: {
        ...(context.extra || {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
        ...(context.userId ? { userId: context.userId } : {}),
      },
      ...(context.fingerprint ? { fingerprint: context.fingerprint } : {}),
      // Attach the user when known so Sentry can group by user.
      user:
        context.userId || context.requestId
          ? {
              id: context.userId,
              // `id` is the canonical Sentry user field; we also stash
              // requestId so the Sentry UI can cross-reference with logs.
              ...(context.requestId
                ? { username: context.requestId }
                : {}),
            }
          : undefined,
    });
  } catch {
    // If Sentry itself blew up, swallow — the error has already been logged
    // via the logger above. We must not let observability code take down
    // the request path.
  }
}

/**
 * Explicit Sentry user-identity setter. Call after a successful login so
// that subsequent `captureError` calls (which don't take a userId) are still
// attributed to the right user.
 */
export function setSentryUser(user: { id: string; email?: string } | null): void {
  if (!SENTRY_ENABLED) return;
  try {
    if (user) {
      Sentry.setUser(user);
    } else {
      Sentry.setUser(null);
    }
  } catch {
    /* no-op */
  }
}

/**
 * Is Sentry actually capturing events right now? Use this to gate expensive
 * instrumentation (e.g. building a large breadcrumb) that's only worth
 * doing when Sentry is configured.
 */
export function isSentryEnabled(): boolean {
  return SENTRY_ENABLED;
}

export default captureError;
