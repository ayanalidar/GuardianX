// GuardianX Rate Limiter, IP-based throttle to prevent brute force + abuse.
//
// Uses in-memory sliding window (no Redis needed, works on Vercel serverless
// with caveats: each function instance has its own counter. For true distributed
// rate limiting, use Upstash Redis. This is sufficient for MVP.)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

interface RateLimitOptions {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (usually IP address).
 * Returns ok=true if within limit, ok=false if exceeded.
 */
export function rateLimit(key: string, opts: RateLimitOptions = { windowMs: 60_000, maxRequests: 60 }): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.maxRequests - 1, resetAt: now + opts.windowMs };
  }

  // Existing window, increment count
  entry.count++;
  store.set(key, entry);

  if (entry.count > opts.maxRequests) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { ok: true, remaining: opts.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client IP from a Request (handles Vercel proxy headers).
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

/**
 * Apply rate limiting to an API route.
 * Returns null if within limit, or a 429 Response if exceeded.
 *
 * Usage:
 *   const limited = applyRateLimit(req);
 *   if (limited) return limited;
 */
export function applyRateLimit(req: Request, opts?: RateLimitOptions): Response | null {
  const ip = getClientIP(req);
  const result = rateLimit(ip, opts);

  if (!result.ok) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Please slow down.",
        retry_after: retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts?.maxRequests || 60),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      }
    );
  }

  return null;
}

/**
 * Stricter rate limit for auth endpoints (prevents brute force).
 */
export function applyAuthRateLimit(req: Request): Response | null {
  return applyRateLimit(req, { windowMs: 15 * 60 * 1000, maxRequests: 10 }); // 10 requests per 15 min
}
