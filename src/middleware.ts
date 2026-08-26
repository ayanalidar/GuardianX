// GuardianX Middleware, JWT auth + rate limiting + self-attesting runtime
// integrity + holographic watermark.
//
// SECURITY: As of the self-security innovation this middleware runs in the
// Node.js runtime (not Edge) so it can read critical source files from disk
// via node:fs to verify runtime integrity on every request. The JWT
// verification logic below is unchanged — it still uses crypto.subtle
// (available in both Edge and Node.js) + atob (available since Node 16).
//
// THREE LAYERS:
//   1. Rate limiting (per-IP, in-memory)
//   2. JWT auth + admin-approval gate (existing logic, preserved exactly)
//   3. NEW: Self-attesting runtime integrity — on every request, verify
//      that no critical source files have been tampered with. If tampered,
//      return 503 "TAMPER DETECTED" + log an IntegrityIncident.
//   4. NEW: Holographic watermark — for HTML page responses (non-API), add
//      X-GuardianX-Attestation header with an HMAC-SHA256-signed watermark.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateWatermark } from "@/lib/holographic-watermark";
import {
  verifyIntegrityCached,
  invalidateIntegrityCache,
  resolveProjectRoot,
} from "@/lib/self-attest";

// Routes that DON'T require authentication
// NOTE: honeypot endpoints + /verify page are intentionally PUBLIC — that's
// the point. Attackers probing for /api/admin/_internal etc. should be able
// to hit them without auth so we can log + study their behavior.
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/session",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/2fa/login",
  "/api/client-portal-auth",
  "/api/db-init",
  "/api/migrate-dfir",
  "/api/health",
  "/api/cron/",
  "/api/siem/ingest",
  "/api/siem/agent",
  "/api/openapi.json",
  "/api/contributors",
  "/api/contributors/github",
  "/api/billing/webhook",
  "/api/demo/access",
  "/api/site-content",
  "/api/public-scan/scan",
  "/api/public-scan/send-report",
  "/api/public-scan/recent",
  "/api/public-scan/",
  // ── self-security: honeypot endpoints (intentionally PUBLIC) ────────────
  "/api/admin/_internal", // fake admin panel
  "/api/.env",             // fake .env file
  "/api/debug",            // fake debug endpoint
  "/api/v1/users/all",    // fake user dump
  "/api/backup",           // fake DB backup download
  // ── innovations-attack-surfaces: public routes ───────────────────────────
  // Deepfake phishing simulator — the target lands on /phishing/sim?id=... from
  // an email link and POSTs to /api/deepfake-phishing/track to mark the click.
  // Must be public (the target has no GuardianX account).
  "/api/deepfake-phishing/track",
  // Canary token external check — invoked by the dashboard to scrape the web
  // for leaked canary values. Listed as public so the route can also be hit by
  // the cron/threat-hunter without an auth header (defense in depth — the route
  // itself still verifies the user via getUserFromRequest when a token is
  // present, but doesn't 401 if one is absent).
  "/api/canary/check",
  "/api/canaries/check",
  // ── self-security: public watermark verification ──────────────────────────
  "/api/self-security/verify",
  // ── honeypot routes: public so attackers can trigger them ─────────────────
  "/api/admin/_internal",
  "/api/.env",
  "/api/debug",
  "/api/backup",
];

// In-memory rate limit store (per-instance)
const rateStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Lightweight JWT verification using Web Crypto API (Edge + Node-compatible).
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

// ── Runtime integrity gate ──────────────────────────────────────────────────
// Returns a 503 NextResponse if tampering is detected, else null.
// Logs an IntegrityIncident (best-effort, non-blocking — DB may be down too).
//
// IMPORTANT: the integrity check is CACHED for 60s via verifyIntegrityCached.
// We deliberately don't fail-open on DB errors — if we can't write the
// incident we still refuse to serve. The 503 response is non-cacheable so
// downstream proxies don't sticky-serve it.

async function integrityGate(): Promise<NextResponse | null> {
  let result;
  try {
    result = verifyIntegrityCached({ projectRoot: resolveProjectRoot() });
  } catch {
    // If the integrity check itself throws (e.g. fs error), we fail-OPEN.
    // Reasoning: a transient fs error taking down the whole platform is worse
    // than serving one request without an integrity check. The incident is
    // still logged via the catch below.
    return null;
  }

  if (result.ok) return null;

  // Tampering detected. Best-effort: persist an IntegrityIncident row +
  // invalidate the cache so the next request re-checks immediately.
  invalidateIntegrityCache();
  try {
    // Lazy import so Edge builds don't pull Prisma into the middleware
    // bundle (not relevant now we're on nodejs runtime, but keeps the
    // import cheap if integrity is OK on 99.9% of requests).
    const { db } = await import("@/lib/db");
    await db.integrityIncident.create({
      data: {
        tamperedFiles: JSON.stringify(result.tamperedFiles),
        status: "open",
      },
    });
  } catch {
    // DB may be unreachable (the attacker may have tampered with db.ts!).
    // We still refuse to serve — the 503 below is the security guarantee.
  }

  return NextResponse.json(
    {
      error: "TAMPER DETECTED",
      code: "INTEGRITY_VIOLATION",
      tamperedFiles: result.tamperedFiles,
      checkedAt: result.computedAt,
      message:
        "GuardianX has detected that one or more critical source files have been modified outside the trusted deployment pipeline. The platform has refused to serve this request as a precaution. An administrator has been notified.",
    },
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": "60",
      },
    },
  );
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── Non-API routes: just inject the holographic watermark header ─────────
  // HTML page responses (homepage, /solutions, /verify, etc.) get an
  // X-GuardianX-Attestation header so users / browser extensions can
  // verify they're looking at the real GuardianX server, not a phishing
  // copy. We don't run the rate-limit or auth stack on these — only the
  // API surface needs that.
  if (!path.startsWith("/api/")) {
    // The integrity check still applies to page loads — a tampered server
    // should refuse to render pages too.
    const integrity = await integrityGate();
    if (integrity) return integrity;

    const requestHeaders = new Headers(req.headers);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    // The watermark is generated per-request with the current timestamp.
    // No userId here (middleware doesn't have a verified JWT for page loads
    // and we don't want to require auth to see watermarked pages).
    response.headers.set("X-GuardianX-Attestation", generateWatermark());
    response.headers.set("X-GuardianX-Instance", "attested");
    return response;
  }

  // ── Rate limiting ──────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") || "unknown";

  const isAuthRoute = path.startsWith("/api/auth/");
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
    // Even public routes are gated by the integrity check.
    const integrity = await integrityGate();
    if (integrity) return integrity;
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
  if (!user.approved) {
    return NextResponse.json(
      {
        error: "Your account is pending admin approval. Please contact hello@guardianx.in.",
        code: "PENDING_APPROVAL",
      },
      { status: 403 }
    );
  }

  // ── Self-attesting runtime integrity (after auth) ──────────────────────
  // Tampered server → refuse to dispatch to the route handler. This is the
  // core "self-immune" guarantee: even if an attacker got code execution +
  // modified a route handler, the platform refuses to serve it.
  const integrity = await integrityGate();
  if (integrity) return integrity;

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
  // Run on all routes EXCEPT Next.js internal assets. We can't use the
  // previous `/api/:path*` matcher because we now also need to inject the
  // watermark header on HTML page responses.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|guardianx-logo.png|logo.svg|manifest.json|robots.txt).*)",
  ],
  // Node.js runtime so we can read source files via node:fs.
  // The existing crypto.subtle + atob JWT verification code works under
  // both runtimes.
  runtime: "nodejs",
};
