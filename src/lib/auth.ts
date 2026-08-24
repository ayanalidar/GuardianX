// GuardianX JWT Authentication Utilities
// Issues + verifies JWT tokens for API route protection.

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[FATAL] JWT_SECRET environment variable is required in production.");
  }
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
    const { createHash } = await import("node:crypto");
    const hashedPassword = createHash("sha256").update(salt + password).digest("hex");
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
