// GET / POST /api/feature-requests
//
// Backs the public feature-request board at /feature-requests.
//
//   GET  — list all feature requests, newest first OR most-upvoted first
//          (the `?sort=top` query param switches to top). Public: any
//          authenticated user can see all requests (it's a public board,
//          not scoped per-user).
//
//   POST — submit a new feature request. Requires auth. The caller's
//          userId / email / name are stamped on the row so we can later
//          notify the submitter when their request ships. The author's
//          own upvote is auto-applied (everyone starts at 1).
//
// Auth: required for both verbs. The board itself is gated by the standard
// middleware (any logged-in user), so anonymous visitors cannot submit or
// vote. The "Sign up to vote" CTA on the public page redirects here.
//
// Sanitization: title + description are passed through `sanitizeText` to
// strip control chars + cap length (200 / 4000 chars). Output is React-
// escaped so XSS is not a concern here.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/feature-requests
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get("sort") === "top" ? "top" : "new";
    const orderBy: Record<string, "asc" | "desc"> =
      sort === "top" ? { upvotes: "desc" } : { createdAt: "desc" };

    const requests = (await db.featureRequest.findMany({
      orderBy,
      take: 200,
    })) as unknown as Record<string, unknown>[];

    return NextResponse.json(
      (requests || []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        upvotes: r.upvotes,
        author: r.userName,
        created_at: (r.createdAt as Date).toISOString(),
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load requests" },
      { status: 500 }
    );
  }
}

// POST /api/feature-requests
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Per-IP throttle: max 5 submissions per hour. Prevents a single actor
  // from flooding the board with low-quality submissions. Same in-memory
  // caveat as src/lib/rate-limit.ts — on serverless, each instance has its
  // own counter, so the effective cap is `5 × #warm instances` per hour.
  const ip = getClientIP(req);
  const rl = rateLimit(`feature-request-submit:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "Too many submissions. Please wait before posting again.",
        retry_after: Math.ceil((rl.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title = sanitizeText(
      typeof body.title === "string" ? body.title : "",
      200
    );
    const description = sanitizeText(
      typeof body.description === "string" ? body.description : "",
      4000
    );

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    // Stamp the caller's voter IP into `voterIPs` so the author's own
    // auto-upvote is counted towards the dedupe ledger (the same IP cannot
    // upvote the same request twice).
    const authorIp = ip === "unknown" ? `user:${auth.user.userId}` : ip;
    const voterIPs = JSON.stringify([authorIp]);

    const fr = await db.featureRequest.create({
      data: {
        userId: auth.user.userId,
        userEmail: auth.user.email,
        userName: auth.user.name,
        title,
        description,
        status: "open",
        upvotes: 1, // author's own auto-upvote
        voterIPs,
      },
    });

    return NextResponse.json(
      {
        id: fr.id,
        title: fr.title,
        description: fr.description,
        status: fr.status,
        upvotes: fr.upvotes,
        author: fr.userName,
        created_at: (fr.createdAt as Date).toISOString(),
        message: "Feature request submitted. Your upvote was auto-applied.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit" },
      { status: 500 }
    );
  }
}
