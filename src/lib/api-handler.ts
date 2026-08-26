// GuardianX API route error wrapper.
//
// Usage:
//
//   import { withErrorHandler } from "@/lib/api-handler";
//
//   export const POST = withErrorHandler(async (req) => {
//     const body = await req.json();
//     ...
//     return NextResponse.json({ ok: true });
//   });
//
// What it does:
//   1. Generates a per-request correlation id (`requestId`) — either
//      honoring an incoming `X-Request-ID` header (if it matches a safe
//      character set) or minting a fresh UUID.
//   2. Stamps that id onto the response as `X-Request-ID` so the client /
//      operator can grep logs for "what happened with request XYZ?".
//   3. Wraps the handler in a try/catch: any thrown error is logged via
//      the structured logger AND captured in Sentry (if configured), then
//      converted into a clean JSON 500 response. The original stack is
//      NEVER leaked to the client.
//   4. Attaches a `requestId` + (best-effort) `userId` to every log entry
//      produced inside the handler via a child logger that's attached to
//      the request object as `req.log`.
//
// The wrapper is runtime-agnostic — it works in both Node.js and Edge
// runtimes (uses only Web APIs + `next/server`).

import { NextResponse } from "next/server";
import { logger, getOrNewRequestId } from "@/lib/logger";
import { captureError } from "@/lib/sentry";
import { getUserFromRequest } from "@/lib/auth";

// Augment the Request type with the optional `log` / `requestId` fields the
// wrapper attaches. Declared globally so handlers don't need a local cast.
declare global {
  interface Request {
    /** Per-request correlation id, minted by `withErrorHandler`. */
    requestId?: string;
    /** Child logger bound to `requestId` + `userId`. Use this inside
     *  handlers instead of importing the bare `logger` so every line is
     *  automatically correlated. */
    log?: ReturnType<typeof logger.child>;
  }
}

/**
 * The shape of a Next.js App-Router route handler. Accepts the standard
 * `Request` (and optionally a context for dynamic routes) and returns a
 * `Response` (or `NextResponse`). The wrapper is generic over the context
 * type so dynamic-route handlers (`/api/foo/[id]`) keep their typing.
 */
export type RouteHandler<C = unknown> = (
  req: Request,
  ctx: C
) => Promise<Response> | Response;

/**
 * Wrap an API route handler with structured logging, Sentry capture, and a
 * uniform 500 response shape. Returns a function with the same signature
 * as the input, so it can be assigned directly to `export const POST = ...`.
 *
 * The wrapper is intentionally minimal — it does NOT add auth, validation,
 * rate-limiting, or caching. Those concerns stay in the handler body so
 * each route keeps full control over its own response codes.
 */
export function withErrorHandler<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: Request, ctx: C): Promise<Response> => {
    // 1. Mint / accept a request id and stash it on `req` so handlers can
    //    pick it up via `req.requestId` without re-parsing the header.
    const requestId = getOrNewRequestId(req);
    req.requestId = requestId;

    // 2. Best-effort extract the acting user id (no verification — the
    //    handler will do that itself; we just want the id for log
    //    correlation if it happens to be present).
    let userId: string | undefined;
    try {
      const user = getUserFromRequest(req);
      if (user?.userId) userId = user.userId;
    } catch {
      /* ignore — auth errors are the handler's problem, not ours */
    }

    // 3. Bind a child logger so every call inside the handler is correlated.
    req.log = logger.child({ requestId, userId });

    try {
      const response = await handler(req, ctx);

      // 4. Attach the X-Request-ID header to the outgoing response. We
      //    support both plain `Response` and `NextResponse` (the latter
      //    exposes `.headers` directly).
      try {
        response.headers.set("X-Request-ID", requestId);
      } catch {
        // Some Response subclasses (e.g. immutable streaming responses)
        // don't allow header mutation. In that case we still return the
        // original response — the header is best-effort, not critical.
      }

      return response;
    } catch (err) {
      // 5. Log + capture the error. `captureError` itself never throws and
      //    already calls the structured logger internally.
      captureError(err, {
        requestId,
        userId,
        tags: { route: new URL(req.url).pathname },
        extra: {
          method: req.method,
          url: req.url,
        },
      });

      // 6. Return a clean 500 to the client. We deliberately do NOT echo
      //    the original error message back — it can contain stack traces,
      //    SQL fragments, or internal identifiers. The client gets a
      //    generic message + the requestId so support can look it up.
      const errorResponse = NextResponse.json(
        {
          error: "Internal server error",
          code: "INTERNAL_ERROR",
          requestId,
        },
        { status: 500 }
      );
      errorResponse.headers.set("X-Request-ID", requestId);
      return errorResponse;
    }
  };
}

export default withErrorHandler;
