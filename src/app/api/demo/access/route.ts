// GET /api/demo/access — rate-limited gate for the public /demo page.
//
// The /demo page lets visitors try the platform without signing up. To
// prevent abuse (scraping, bot traffic, search-engine crawling that would
// inflate our hosting bill) we cap each IP at 5 demo views per day.
//
// This endpoint is PUBLIC (listed in middleware.ts's PUBLIC_ROUTES) so
// unauthenticated visitors can call it. It returns:
//   200 { allowed: true,  views_today: N, limit: 5, remaining: 5 - N }
//   429 { allowed: false, views_today: 5, limit: 5, remaining: 0,
//         message: "Daily demo limit reached. Sign up for unlimited access." }
//
// The /demo page calls this on mount and conditionally renders the demo
// content OR the "limit reached" CTA based on the response.
//
// Rate-limit store: in-memory, per Edge function instance (same caveat as
// src/lib/rate-limit.ts — on serverless each instance has its own counter,
// so the effective cap is `5 × #warm instances` per day). For a strict
// global cap, migrate to Upstash Redis or a DB-backed counter keyed by IP.

import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DEMO_DAILY_LIMIT = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/demo/access
export async function GET(req: Request) {
  const ip = getClientIP(req);
  const key = `demo-view:${ip}`;

  const result = rateLimit(key, {
    windowMs: ONE_DAY_MS,
    maxRequests: DEMO_DAILY_LIMIT,
  });

  if (!result.ok) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        allowed: false,
        views_today: DEMO_DAILY_LIMIT,
        limit: DEMO_DAILY_LIMIT,
        remaining: 0,
        message:
          "You've used all 5 demo views for today. Sign up for full, unlimited access.",
        retry_after_seconds: retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  const viewsToday = DEMO_DAILY_LIMIT - result.remaining;
  return NextResponse.json({
    allowed: true,
    views_today: viewsToday,
    limit: DEMO_DAILY_LIMIT,
    remaining: result.remaining,
    reset_at: result.resetAt,
  });
}
