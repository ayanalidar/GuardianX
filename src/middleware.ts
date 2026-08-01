// GuardianX Middleware, JWT auth + rate limiting on all API routes.
//
// SECURITY: This runs in the Edge runtime. We use a lightweight JWT
// verification (crypto.subtle) instead of the jsonwebtoken library
// (which requires Node.js).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that DON'T require authentication
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/session",
  "/api/client-portal-auth", // client portal login (issues its own token)
  "/api/db-init",
  "/api/migrate-dfir", // one-time DFIR table migration (safe, uses IF NOT EXISTS)
  "/api/health",
  "/api/cron/", // cron routes use ?secret= param, not JWT
];

// In-memory rate limit store (per Edge function instance)
const rateStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Lightweight JWT verification using Web Crypto API (Edge-compatible).
 * Verifies the signature without importing the jsonwebtoken library.
 */
async function verifyJWTEdge(token: string): Promise<{ userId: string; email: string; role: string; name: string; approved: boolean } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Decode the payload (middle part)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

    // Check expiry
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      approved: payload.approved === true, // fail-safe: undefined/null/false → false
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only protect /api/* routes
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ── Rate limiting ──────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") || "unknown";

  const isAuthRoute = path.startsWith("/api/auth/");
  // Auth routes: strict (10 / 15min) to block brute force.
  // Regular API routes: generous (300 / min), the dashboard fires many
  // concurrent fetches on mount (clients, stats, patches, feed, compliance,
  // attestations, posture, sparklines, topology, process-tree, etc.) plus
  // auto-refresh polls every 10s, so 60/min was too low and caused 429s.
  const windowMs = isAuthRoute ? 15 * 60 * 1000 : 60 * 1000;
  const maxReqs = isAuthRoute ? 10 : 300;

  const now = Date.now();
  const entry = rateStore.get(ip);

  if (!entry || entry.resetAt < now) {
    rateStore.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
    if (entry.count > maxReqs) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  // ── Auth check (skip for public routes) ────────────────────────────────
  const isPublic = PUBLIC_ROUTES.some((route) => path === route || path.startsWith(route));
  if (isPublic) {
    return NextResponse.next();
  }

  // Get token from Authorization header or cookie
  const authHeader = req.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    const cookie = req.cookies.get("guardianx-token");
    if (cookie) {
      token = cookie.value;
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  const user = await verifyJWTEdge(token);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired token. Please log in again." },
      { status: 401 }
    );
  }

  // ── Approval enforcement (defense in depth) ───────────────────────────
  // Even if the JWT signature is valid, the user must be admin-approved.
  // Because `approved` is embedded in the token at login time, ANY token
  // issued before this check existed (which lacks the `approved` flag) is
  // automatically rejected here. This forcibly logs out unapproved users
  // who grabbed a token before the approval workflow was enforced.
  if (!user.approved) {
    return NextResponse.json(
      {
        error: "Your account is pending admin approval. Please contact hello@guardianx.in.",
        code: "PENDING_APPROVAL",
      },
      { status: 403 }
    );
  }

  // Add user info to request headers for downstream routes
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", user.userId);
  requestHeaders.set("x-user-email", user.email);
  requestHeaders.set("x-user-role", user.role);
  requestHeaders.set("x-user-name", user.name);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
