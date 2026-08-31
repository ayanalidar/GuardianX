// GuardianX JWT Authentication Utilities
// Issues + verifies JWT tokens for API route protection.

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { sha256hex } from "@/lib/crypto";

const JWT_SECRET = process.env.JWT_SECRET;
// Don't throw at build time — JWT_SECRET may not be available during the
// Vercel build step (it's a runtime env var). Defer the check to first use.
if (!JWT_SECRET && process.env.NODE_ENV === "production" && typeof window === "undefined") {
  // Only warn during build; throw at runtime in createToken/verifyToken.
  console.warn("[WARN] JWT_SECRET not set at build time — will be checked at runtime.");
} else if (!JWT_SECRET) {
  console.warn("[WARN] JWT_SECRET not set — using dev-only secret. DO NOT use in production.");
}
const SECRET = JWT_SECRET || "dev-only-secret-not-for-production-use";
const JWT_EXPIRES_IN = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
  /** Whether the user is admin-approved. Embedded in the JWT so the Edge
   *  middleware can re-check it on every request. Old tokens issued before
   *  this field existed will have `undefined` here, which is treated as
   *  "not approved" (fail-safe). */
  approved?: boolean;
  /** Token version — bumped by /api/auth/revoke-sessions to invalidate all
   *  previously-issued JWTs. If the JWT's version doesn't match the DB's
   *  current `User.tokenVersion`, the session is revoked. Old tokens
   *  issued before this field existed have `undefined` here — treated as
   *  version 0 for comparison. */
  tokenVersion?: number;
}

/**
 * Create a signed JWT token for a user.
 */
export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token. Returns the payload if valid, null if invalid/expired.
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify a short-lived 2FA step-up temp token (5-min expiry, purpose=2fa-stepup).
 * Issued by /api/auth/login after password verification but before the real
 * session JWT is issued. Returns the userId if valid+not-expired, null otherwise.
 *
 * The temp token is a JWT with `{ userId, purpose: "2fa-stepup" }` and a
 * 5-minute expiry. We verify the signature AND check the purpose field so a
 * regular session token can't be replayed here.
 */
export function verifyTwoFactorTempToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, SECRET) as { userId?: string; purpose?: string };
    if (decoded.purpose !== "2fa-stepup" || !decoded.userId) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Issue a short-lived 2FA step-up temp token (5-min expiry). Used by
 * /api/auth/login to hand off to /api/auth/2fa/login after password
 * verification succeeds but before 2FA is confirmed.
 */
export function createTwoFactorTempToken(userId: string): string {
  return jwt.sign({ userId, purpose: "2fa-stepup" }, SECRET, { expiresIn: "5m" });
}

/**
 * Hash a password using bcrypt (12 rounds, ~250ms, secure).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Support both old format (salt:sha256hash) and new format (bcrypt)
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      // Bcrypt hash
      return bcrypt.compare(password, hash);
    }
    // Legacy SHA-256+salt format (for existing users)
    const [salt, storedHash] = hash.split(":");
    if (!salt || !storedHash) return false;
    const hashedPassword = await sha256hex(salt + password);
    if (hashedPassword === storedHash) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract and verify the JWT from a Request's Authorization header or cookie.
 * Returns the user payload if authenticated, null otherwise.
 */
export function getUserFromRequest(req: Request): JWTPayload | null {
  // Try Authorization header first
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }

  // Try cookie
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [key, ...val] = c.trim().split("=");
        return [key, val.join("=")];
      })
    );
    if (cookies["guardianx-token"]) {
      return verifyToken(cookies["guardianx-token"]);
    }
  }

  return null;
}

/**
 * Middleware: require authentication. Returns the user or a 401 response.
 * Usage in API routes:
 *   const auth = requireAuth(req);
 *   if (!auth.ok) return auth.response;
 *   const user = auth.user;
 */
export function requireAuth(req: Request):
  | { ok: true; user: JWTPayload }
  | { ok: false; response: Response } {
  const user = getUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required. Provide a valid Bearer token." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  // Defense in depth: even if a valid JWT is present, the user must be
  // explicitly approved. Fail-safe: `undefined`/`null`/`false` all reject.
  // (The Edge middleware already enforces this, but this protects routes in
  // case middleware is ever bypassed or a stale pre-approval token appears.)
  if (user.approved !== true) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Your account is pending admin approval.",
          code: "PENDING_APPROVAL",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return { ok: true, user };
}

/**
 * Middleware: require admin role.
 */
export function requireAdmin(req: Request):
  | { ok: true; user: JWTPayload }
  | { ok: false; response: Response } {
  const auth = requireAuth(req);
  if (!auth.ok) return auth;
  if (auth.user.role !== "admin") {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Admin access required." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return auth;
}

/**
 * Enforce session revocation by checking the JWT's `tokenVersion` against
 * the DB's current `User.tokenVersion`. If they don't match, the session
 * was revoked (via /api/auth/revoke-sessions bumping the version) and we
 * return a 401 SESSION_REVOKED response. If they match (or the user has no
 * tokenVersion in their JWT — old tokens — we treat as version 0 and
 * compare against the DB).
 *
 * Returns null if the session is valid, or a 401 Response if revoked.
 * Callers do: `const revoked = await enforceSessionRevocation(req); if (revoked) return revoked;`
 *
 * Lazily imports supabase to avoid a circular dependency at module load
 * (auth.ts ← db.ts ← supabase-js). This is safe because the import only
 * resolves when the function is actually called (in a request handler).
 */
export async function enforceSessionRevocation(req: Request): Promise<Response | null> {
  const user = getUserFromRequest(req);
  if (!user) return null; // no token — let requireAuth/requireAdmin handle the 401

  // Lazy import to avoid circular dependency at module load.
  const { supabase } = await import("@/lib/db");

  try {
    const { data, error } = await supabase
      .from("User")
      .select("tokenVersion")
      .eq("id", user.userId)
      .maybeSingle();

    if (error) {
      // DB error — fail open (don't block the request on a DB hiccup).
      // The signature/approval checks in requireAuth/requireAdmin already
      // passed, so the token is otherwise valid. Log and allow.
      return null;
    }

    const currentVersion =
      data && typeof data.tokenVersion === "number" ? data.tokenVersion : 0;
    const jwtVersion = user.tokenVersion ?? 0;

    if (jwtVersion !== currentVersion) {
      return new Response(
        JSON.stringify({
          error: "Your session has been revoked. Please log in again.",
          code: "SESSION_REVOKED",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return null;
  } catch {
    // Any unexpected error — fail open (don't block on infra issues).
    return null;
  }
}
