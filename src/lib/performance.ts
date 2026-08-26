/**
 * Performance monitoring utilities for GuardianX.
 *
 * This file is SERVER-SAFE (no "use client" directive). The `measureApiTime`
 * function can be imported from API routes. Client-side hooks are in a
 * separate file (`src/lib/performance-client.ts`) to avoid pulling React
 * into server bundles.
 */

// ── Server-safe: API route timing ─────────────────────────────────────────

const SLOW_API_THRESHOLD_MS = 500;
const API_TIMING_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_PERF_TIMING === "1";

/**
 * Wrap a Next.js API route handler with timing instrumentation.
 * Logs to console only when the handler took longer than
 * `SLOW_API_THRESHOLD_MS`. Safe to apply to GET/POST/PATCH/DELETE handlers.
 *
 * @example
 *   export const GET = measureApiTime("/api/stats", async (req) => { ... });
 */
export function measureApiTime<TArgs extends unknown[], TResult>(
  label: string,
  handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    if (!API_TIMING_ENABLED) return handler(...args);
    const start = Date.now();
    try {
      const result = await handler(...args);
      const elapsed = Date.now() - start;
      if (elapsed > SLOW_API_THRESHOLD_MS) {
        console.warn(`[perf] slow API: ${label} took ${elapsed}ms`);
      }
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.warn(
        `[perf] slow API (errored): ${label} took ${elapsed}ms — ${err instanceof Error ? err.message : "unknown"}`,
      );
      throw err;
    }
  };
}

// ── Client-side hooks are in src/lib/performance-client.ts ────────────────
// (kept separate to avoid "use client" directive contaminating API routes)
