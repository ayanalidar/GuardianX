// GET /api/openapi.json
//
// Returns a hand-written OpenAPI 3.0.3 spec describing the most important
// GuardianX REST API routes (~45 endpoints across 12 tags). The spec is
// served as a static object so the Swagger UI page at /api-doc can render
// it without any runtime introspection of the route files.
//
// This route is listed in PUBLIC_ROUTES (middleware.ts) so unauthenticated
// visitors can browse the API documentation. The spec itself only describes
// shape/security — it never leaks credentials, secrets, or user data.
//
// To extend: append a new path object to `paths`, optionally add a new
// entry to `tags`, and re-use the shared `securitySchemes.BearerAuth` for
// any route that requires a logged-in user. Response schemas are intentionally
// pragmatic — they document the keys a caller can rely on, not a strict
// JSON-Schema validator.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Shared schema fragments ────────────────────────────────────────────────
// Re-used across multiple operations via $ref. Kept inline (not split into a
// separate file) so the whole spec is one self-contained response.
const ERROR_RESPONSES = {
  "400": {
    description: "Bad request — missing or invalid input.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "401": {
    description: "Authentication required or token invalid/expired.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "403": {
    description: "Forbidden — account pending approval or insufficient role.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "404": {
    description: "Resource not found.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "429": {
    description: "Rate limit exceeded. See Retry-After header.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/RateLimitError" },
      },
    },
  },
  "500": {
    description: "Internal server error.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
};

const BEARER_SECURITY = [{ BearerAuth: [] }];

/**
 * Build a responses object from ERROR_RESPONSES with per-route overrides.
 *
 * Spreading ERROR_RESPONSES directly into a responses block that also has
 * explicit 4xx entries produces duplicate keys (TS2783). This helper
 * applies the spread INSIDE a function so the call-site object literal
 * only ever contains the explicit (overriding) keys — runtime behaviour
 * is identical (later keys win) but TypeScript is happy.
 */
function buildResponses(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...ERROR_RESPONSES, ...overrides };
}

// ── The spec ───────────────────────────────────────────────────────────────
const spec = {
  openapi: "3.0.3",
  info: {
    title: "GuardianX API",
    version: "1.0.0",
    description:
      "Autonomous security operations platform REST API. " +
      "Authenticate with `POST /api/auth/login` to obtain a JWT bearer token, " +
      "then send it as `Authorization: Bearer <token>` on every subsequent call. " +
      "Tokens are valid for 7 days. All authenticated routes are subject to " +
      "per-IP rate limiting; auth routes have stricter per-endpoint limits.",
    contact: {
      name: "GuardianX",
      url: "https://www.guardianx.in",
      email: "hello@guardianx.in",
    },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "/", description: "Relative to current host" },
    { url: "https://www.guardianx.in", description: "Production" },
  ],
  tags: [
    { name: "Auth", description: "Authentication, signup, 2FA, password reset, email verification." },
    { name: "Clients", description: "Client (engagement) management. Viewers see only clients they own; admins see all." },
    { name: "Codebases", description: "Source code snapshots attached to a client that scans run against." },
    { name: "Scans", description: "Trigger and inspect AI security scans against a codebase." },
    { name: "Patches", description: "AI-generated patches awaiting review, approval, or rejection." },
    { name: "Incidents", description: "Security incident case management with timeline events and evidence." },
    { name: "IOCs", description: "Indicators of Compromise (IP, hash, domain, url, email, user_agent)." },
    { name: "Settings", description: "Platform-wide notification configuration (admin only)." },
    { name: "Users", description: "User account management (admin only)." },
    { name: "Admin", description: "Admin-only operational telemetry endpoints." },
    { name: "Monitoring", description: "Health, email delivery logs, login history." },
    { name: "Webhooks", description: "Configure outbound security-event webhooks." },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "JWT issued by `POST /api/auth/login` (or `POST /api/auth/2fa/login` for 2FA accounts). " +
          "Send as `Authorization: Bearer <token>`. Also stored in the `guardianx-token` HTTP-only cookie.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", description: "Human-readable error message." },
          code: { type: "string", description: "Optional machine-readable error code (e.g. PENDING_APPROVAL, EMAIL_NOT_VERIFIED, DB_NOT_INITIALIZED)." },
        },
      },
      RateLimitError: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          retry_after: { type: "integer", description: "Seconds until the rate-limit window resets." },
          limit: { type: "string", description: "Which limit was hit (login, signup, api, …)." },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "analyst", "viewer"] },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          token: { type: "string", description: "JWT bearer token (7-day expiry). Null when 2FA/email-verification is required first." },
          message: { type: "string" },
          requiresTwoFactor: { type: "boolean", description: "Present and true when 2FA step-up is required." },
          twoFactorToken: { type: "string", description: "5-minute step-up token; pass to POST /api/auth/2fa/login with a TOTP code." },
        },
      },
      Client: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          contact_name: { type: "string", nullable: true },
          contact_email: { type: "string", nullable: true },
          contact_phone: { type: "string", nullable: true },
          target_url: { type: "string", nullable: true },
          repo_url: { type: "string", nullable: true },
          scope: { type: "string", nullable: true },
          authorized: { type: "boolean" },
          frameworks: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["onboarding", "active", "paused", "archived"] },
          created_at: { type: "string", format: "date-time" },
          stats: {
            type: "object",
            properties: {
              codebases: { type: "integer" },
              targets: { type: "integer" },
              patches: { type: "integer" },
              pending_patches: { type: "integer" },
              approved_patches: { type: "integer" },
              critical_patches: { type: "integer" },
              findings: { type: "integer" },
              critical_findings: { type: "integer" },
            },
          },
        },
      },
      Codebase: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          language: { type: "string" },
          description: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          patch_count: { type: "integer" },
        },
      },
      Scan: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["queued", "analyzing", "patching", "sandboxing", "completed", "failed"] },
          stage_label: { type: "string" },
          started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time", nullable: true },
          codebase: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
          patch_count: { type: "integer" },
        },
      },
      Patch: {
        type: "object",
        properties: {
          patch_id: { type: "string", description: "Public-facing patch identifier." },
          internal_id: { type: "string", format: "uuid" },
          codebase_name: { type: "string" },
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          cve: { type: "string", nullable: true },
          affected_file: { type: "string", nullable: true },
          ai_explanation: { type: "string", nullable: true },
          confidence: { type: "number", nullable: true },
          sandbox_passed: { type: "boolean", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Incident: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          status: { type: "string", enum: ["open", "investigating", "contained", "eradicated", "closed"] },
          category: { type: "string" },
          source: { type: "string" },
          assignee: { type: "string", nullable: true },
          detectedAt: { type: "string", format: "date-time" },
          containedAt: { type: "string", format: "date-time", nullable: true },
          eradicatedAt: { type: "string", format: "date-time", nullable: true },
          closedAt: { type: "string", format: "date-time", nullable: true },
          eventCount: { type: "integer" },
          evidenceCount: { type: "integer" },
        },
      },
      IOC: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          iocType: { type: "string", enum: ["ip", "hash", "domain", "url", "email", "user_agent"] },
          value: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          source: { type: "string", enum: ["honeypot", "canary", "api_log", "threat_intel", "manual"] },
          tags: { type: "array", items: { type: "string" } },
          firstSeen: { type: "string", format: "date-time" },
          lastSeen: { type: "string", format: "date-time" },
          hitCount: { type: "integer" },
          isActive: { type: "boolean" },
          notes: { type: "string", nullable: true },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          url: { type: "string", format: "uri" },
          events: { type: "array", items: { type: "string" }, description: "Event types or [\"*\"] for all." },
          isActive: { type: "boolean" },
          hasSecret: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: BEARER_SECURITY,
  paths: {
    // ── Auth ─────────────────────────────────────────────────────────────
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        description:
          "Creates a user. The first user becomes the auto-approved admin; subsequent users require admin approval. " +
          "Always sends an email-verification link; the user must verify before they can log in. " +
          "Rate limit: 5 requests / 60 min per IP.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["email", "name", "password"],
            properties: {
              email: { type: "string", format: "email" },
              name: { type: "string", maxLength: 100 },
              password: { type: "string", minLength: 8, maxLength: 128, format: "password" },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "Account created (pending email verification).", content: { "application/json": { schema: { type: "object", properties: {
            user: { $ref: "#/components/schemas/User" },
            token: { type: "string", nullable: true },
            message: { type: "string" },
            needsApproval: { type: "boolean" },
            needsEmailVerification: { type: "boolean" },
          } } } } },
          "409": { description: "Email already registered.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in (issue session JWT)",
        description:
          "Verifies email + password and returns a 7-day JWT. If the user has 2FA enabled, returns a 5-minute " +
          "`twoFactorToken` instead — call `POST /api/auth/2fa/login` with that token + a TOTP code to get the real session. " +
          "Email-verification and admin-approval are enforced fail-safe. Rate limit: 10 requests / 15 min per IP.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string", format: "password" },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Login successful (or 2FA step-up required).", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
          "401": { description: "Invalid email or password.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Email not verified OR account pending approval.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/2fa/login": {
      post: {
        tags: ["Auth"],
        summary: "Complete 2FA login",
        description:
          "Step 2 of the 2FA login flow. Verifies the 6-digit TOTP code against the user's secret and issues the real 7-day session JWT. " +
          "Public route (no Bearer token needed) — authentication is via the 5-minute `twoFactorToken` issued by /api/auth/login.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["twoFactorToken", "token"],
            properties: {
              twoFactorToken: { type: "string", description: "Step-up token from /api/auth/login." },
              token: { type: "string", description: "6-digit TOTP code from the user's authenticator app." },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "2FA verified, session JWT issued.", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
          "400": { description: "Invalid or malformed TOTP code.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Step-up token expired or 2FA not enabled.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out (invalidate session)",
        description:
          "Clears the guardianx-token cookie AND bumps the user's `tokenVersion` in the DB so the just-logged-out JWT is rejected everywhere (closes the stolen-token-replay hole). Idempotent.",
        responses: buildResponses({
          "200": { description: "Logged out.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } } } } },
        }),
      },
    },
    "/api/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Check current session",
        description: "Returns whether the caller's Bearer token is valid and, if so, the user object.",
        security: [],
        responses: buildResponses({
          "200": {
            description: "Session status.",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                authenticated: { type: "boolean" },
                user: { $ref: "#/components/schemas/User", description: "Present only when authenticated." },
              },
            } } },
          },
        }),
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password-reset email",
        description:
          "Always returns 200 (even if the email doesn't exist) to prevent email enumeration. If the email exists and the user is approved, a 1-hour reset token is emailed. Rate limit: 5 requests / 60 min per IP.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["email"],
            properties: { email: { type: "string", format: "email" } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Reset email queued (if the account exists).", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } } } } },
        }),
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with a token",
        description:
          "Validates the reset token (exists, not used, not expired), updates the user's password, marks the token as used. Rate limit: 10 requests / 15 min per IP.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["token", "password"],
            properties: {
              token: { type: "string", description: "72-char reset token from the email link." },
              password: { type: "string", minLength: 8, maxLength: 128, format: "password" },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Password reset successful.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } } } } },
          "400": { description: "Token invalid, used, or expired.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/verify-email": {
      post: {
        tags: ["Auth"],
        summary: "Verify email address",
        description:
          "Validates the email-verification token (24h expiry, single-use) and sets `emailVerified=true` on the User row. Rate limit: 10 requests / 15 min per IP.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["token"],
            properties: { token: { type: "string", description: "72-char verification token from the email link." } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Email verified.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } } } } },
          "400": { description: "Token invalid, used, or expired.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/2fa": {
      get: {
        tags: ["Auth"],
        summary: "Get 2FA status",
        description: "Returns the calling user's current TOTP 2FA status (enabled flag + whether a pending unverified secret exists).",
        responses: buildResponses({
          "200": { description: "2FA status.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              hasPendingSecret: { type: "boolean", description: "True if /setup was called but /verify never completed." },
            },
          } } } },
        }),
      },
    },
    "/api/auth/2fa/setup": {
      post: {
        tags: ["Auth"],
        summary: "Begin TOTP 2FA setup",
        description: "Generates a fresh TOTP secret, persists it on the User row (with twoFactorEnabled still FALSE), and returns the secret + QR code + otpauth URL. Call /api/auth/2fa/verify to finish.",
        responses: buildResponses({
          "200": { description: "Secret + QR generated.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              secret: { type: "string", description: "Base32 TOTP secret (for manual entry)." },
              qrCode: { type: "string", description: "data: URL of a PNG QR code (render via <img src=...>)." },
              otpauthUrl: { type: "string", description: "otpauth://totp/... URL a compliant app can ingest." },
              message: { type: "string" },
            },
          } } } },
        }),
      },
    },
    "/api/auth/2fa/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify TOTP code and enable 2FA",
        description: "Step 2 of TOTP setup. Verifies the supplied 6-digit code against the secret stored by /setup. On success, flips twoFactorEnabled=true.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["token"],
            properties: { token: { type: "string", pattern: "^\\d{6}$", description: "6-digit TOTP code." } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "2FA enabled.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, enabled: { type: "boolean" }, message: { type: "string" } } } } } },
          "400": { description: "Invalid code or no pending secret.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/2fa/disable": {
      post: {
        tags: ["Auth"],
        summary: "Disable 2FA",
        description: "Disables 2FA — requires a valid 6-digit TOTP code (proof of possession of the current secret) so a hijacked session can't silently downgrade account security. Clears both the secret and the enabled flag.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["token"],
            properties: { token: { type: "string", pattern: "^\\d{6}$" } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "2FA disabled.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, enabled: { type: "boolean" }, message: { type: "string" } } } } } },
          "400": { description: "Invalid code or 2FA not enabled.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/auth/revoke-sessions": {
      post: {
        tags: ["Auth"],
        summary: "Revoke all of a user's sessions",
        description:
          "Increments the target user's `tokenVersion` so all their existing JWTs are rejected with 401 SESSION_REVOKED on the next request. Admins can revoke any user; non-admins can only revoke their own sessions.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["userId"],
            properties: { userId: { type: "string", format: "uuid" } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Sessions revoked.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              userId: { type: "string" },
              previousTokenVersion: { type: "integer" },
              newTokenVersion: { type: "integer" },
              message: { type: "string" },
            },
          } } } },
          "403": { description: "Non-admin trying to revoke another user's sessions.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "User not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      get: {
        tags: ["Auth"],
        summary: "Check caller's session-revocation status",
        description: "Returns the caller's current tokenVersion (from the DB) and the version embedded in their JWT, so the UI can detect a revoked session client-side.",
        responses: buildResponses({
          "200": { description: "Token-version status.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              userId: { type: "string" },
              jwtTokenVersion: { type: "integer", nullable: true },
              currentTokenVersion: { type: "integer" },
              sessionRevoked: { type: "boolean" },
            },
          } } } },
        }),
      },
    },
    "/api/auth/login-history": {
      get: {
        tags: ["Auth", "Monitoring"],
        summary: "List caller's recent login attempts",
        description: "Returns the last 20 login attempts (successful and failed) for the calling user only — RLS-enforced, never exposes other users' history.",
        responses: buildResponses({
          "200": { description: "Login history.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              history: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    ipAddress: { type: "string" },
                    userAgent: { type: "string" },
                    browser: { type: "string" },
                    os: { type: "string" },
                    success: { type: "boolean" },
                    failureReason: { type: "string", nullable: true },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
              migrationPending: { type: "boolean", description: "True if the LoginHistory table doesn't exist yet." },
            },
          } } } },
        }),
      },
    },

    // ── Clients ──────────────────────────────────────────────────────────
    "/api/clients": {
      get: {
        tags: ["Clients"],
        summary: "List clients",
        description: "Returns all clients the caller can see (admins see all; viewers see only clients they own) with batched pipeline-summary stats. Cached 30s per user.",
        parameters: [],
        responses: buildResponses({
          "200": { description: "List of clients.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Client" } } } } },
        }),
      },
      post: {
        tags: ["Clients"],
        summary: "Create a client",
        description: "Creates a client owned by the calling user. Admins and viewers can both create clients, but viewers can only see/manage their own.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", maxLength: 200 },
              description: { type: "string", maxLength: 2000 },
              contactName: { type: "string", maxLength: 200 },
              contactEmail: { type: "string", format: "email" },
              contactPhone: { type: "string", maxLength: 50 },
              targetUrl: { type: "string", maxLength: 2048 },
              repoUrl: { type: "string", maxLength: 2048 },
              scope: { type: "string", maxLength: 4000 },
              frameworks: { type: "array", items: { type: "string" } },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "Client created.", content: { "application/json": { schema: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" }, status: { type: "string" }, message: { type: "string" } },
          } } } },
        }),
      },
    },
    "/api/clients/{id}": {
      get: {
        tags: ["Clients"],
        summary: "Get client detail",
        description: "Returns a single client with its codebases and targets. Ownership-gated.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Client detail.", content: { "application/json": { schema: { $ref: "#/components/schemas/Client" } } } },
          "403": { description: "Viewer does not own this client.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Client not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      patch: {
        tags: ["Clients"],
        summary: "Update client",
        description: "Updates mutable fields (name, description, contact_*, status, authorized, frameworks, …). Ownership-gated.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              contactName: { type: "string" },
              contactEmail: { type: "string" },
              contactPhone: { type: "string" },
              targetUrl: { type: "string" },
              repoUrl: { type: "string" },
              scope: { type: "string" },
              authorized: { type: "boolean" },
              status: { type: "string", enum: ["onboarding", "active", "paused", "archived"] },
              frameworks: { type: "array", items: { type: "string" } },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Client updated.", content: { "application/json": { schema: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" }, status: { type: "string" }, authorized: { type: "boolean" }, message: { type: "string" } },
          } } } },
        }),
      },
      delete: {
        tags: ["Clients"],
        summary: "Delete client",
        description: "Cascades to codebases, targets, scans, etc. Ownership-gated. Audit-logged.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Deleted.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "404": { description: "Client not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Codebases ────────────────────────────────────────────────────────
    "/api/codebases": {
      get: {
        tags: ["Codebases"],
        summary: "List codebases",
        description: "Returns codebases the caller can see (admins see all; viewers see only codebases whose parent client they own). Includes per-codebase patch count.",
        responses: buildResponses({
          "200": { description: "List of codebases.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Codebase" } } } } },
        }),
      },
      post: {
        tags: ["Codebases"],
        summary: "Upload a codebase",
        description: "Stores a source-code snapshot attached to a client. Viewers must supply a clientId they own; admins may omit it. Used as input for /api/scans.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["name", "sourceCode"],
            properties: {
              name: { type: "string" },
              sourceCode: { type: "string", description: "Full source-code text." },
              language: { type: "string", default: "javascript" },
              description: { type: "string" },
              clientId: { type: "string", format: "uuid", description: "Required for non-admin callers." },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "Codebase created.", content: { "application/json": { schema: { $ref: "#/components/schemas/Codebase" } } } },
          "403": { description: "Viewer cannot access the supplied clientId.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/codebases/{id}": {
      get: {
        tags: ["Codebases"],
        summary: "Get codebase detail",
        description: "Returns full codebase incl. source code + recent scans + patches.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Codebase detail.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              language: { type: "string" },
              description: { type: "string", nullable: true },
              source_code: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              scans: { type: "array", items: { $ref: "#/components/schemas/Scan" } },
              patches: { type: "array", items: { $ref: "#/components/schemas/Patch" } },
            },
          } } } },
          "404": { description: "Not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      delete: {
        tags: ["Codebases"],
        summary: "Delete codebase",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Deleted.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
        }),
      },
    },

    // ── Scans ────────────────────────────────────────────────────────────
    "/api/scans": {
      get: {
        tags: ["Scans"],
        summary: "List scans (paginated)",
        description: "Returns recent scans scoped to the caller's ownership. Admins see all; viewers see only scans on codebases whose parent client they own.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
        ],
        responses: buildResponses({
          "200": { description: "Paginated scans.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              scans: { type: "array", items: { $ref: "#/components/schemas/Scan" } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          } } } },
        }),
      },
      post: {
        tags: ["Scans"],
        summary: "Kick off a security scan",
        description:
          "Creates a Scan record (status=queued) and fires-and-forgets to the Railway-hosted Sentinel engine, which runs the pipeline and streams events via socket.io. " +
          "Returns 202 immediately with the scanId. Prevents concurrent scans on the same codebase (409). Ownership-gated on the parent client.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["codebaseId"],
            properties: { codebaseId: { type: "string", format: "uuid" } },
          } } },
        },
        responses: buildResponses({
          "202": { description: "Scan queued.", content: { "application/json": { schema: {
            type: "object",
            properties: { scanId: { type: "string" }, status: { type: "string" } },
          } } } },
          "404": { description: "Codebase not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "A scan is already running for this codebase.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              error: { type: "string" },
              scanId: { type: "string" },
              status: { type: "string" },
            },
          } } } },
        }),
      },
    },
    "/api/scans/{id}": {
      delete: {
        tags: ["Scans"],
        summary: "Delete a scan record",
        description: "Cascades to patches + events. Audit-logged.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Deleted.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "404": { description: "Scan not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Patches ──────────────────────────────────────────────────────────
    "/api/patches/pending": {
      get: {
        tags: ["Patches"],
        summary: "List pending patches",
        description: "Returns pending patches (sorted by severity then createdAt) with memory-safe pagination. The full `total` is returned alongside the page so the UI can render 'showing 1–200 of N' without a second round-trip.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 200, minimum: 1, maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
        ],
        responses: buildResponses({
          "200": { description: "Paginated pending patches.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              patches: { type: "array", items: { $ref: "#/components/schemas/Patch" } },
              total: { type: "integer" },
              limit: { type: "integer" },
              offset: { type: "integer" },
            },
          } } } },
        }),
      },
    },
    "/api/patches/{id}": {
      get: {
        tags: ["Patches"],
        summary: "Get patch detail",
        description: "Returns full patch incl. original/patched code, sandbox logs, exploit playground state, adversarial arena transcript, and chat history.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", description: "Patch ID or patch_id (public identifier)." } }],
        responses: buildResponses({
          "200": { description: "Patch detail.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              patch_id: { type: "string" },
              internal_id: { type: "string" },
              codebase: { type: "object" },
              title: { type: "string" },
              severity: { type: "string" },
              cve: { type: "string", nullable: true },
              affected_file: { type: "string", nullable: true },
              ai_explanation: { type: "string", nullable: true },
              confidence: { type: "number", nullable: true },
              original_code: { type: "string", nullable: true },
              patched_code: { type: "string", nullable: true },
              diff_payload: { type: "string", nullable: true },
              test_code: { type: "string", nullable: true },
              sandbox_logs: { type: "string", nullable: true },
              sandbox_passed: { type: "boolean", nullable: true },
              exploit_code: { type: "string", nullable: true },
              adversarial_rounds: { type: "integer", nullable: true },
              adversarial_won: { type: "boolean", nullable: true },
              status: { type: "string", enum: ["pending", "approved", "rejected", "rolled_back"] },
              created_at: { type: "string", format: "date-time" },
              approved_at: { type: "string", format: "date-time", nullable: true },
              chat: { type: "array", items: { type: "object", properties: {
                id: { type: "string" }, role: { type: "string" }, content: { type: "string" }, created_at: { type: "string", format: "date-time" },
              } } },
            },
          } } } },
          "404": { description: "Patch not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/patches/{id}/approve": {
      post: {
        tags: ["Patches"],
        summary: "Approve a patch",
        description:
          "Marks the patch approved, applies the patched code to the codebase's source snapshot, and creates a cryptographic attestation (hash-chained ledger entry: prevHash + sha256(patchedCode) + approvedAt). Audit-logged.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: buildResponses({
          "200": { description: "Patch approved + attested.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              patch_id: { type: "string" },
              status: { type: "string" },
              approved_at: { type: "string", format: "date-time" },
              attestation: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  hash: { type: "string" },
                  prev_hash: { type: "string" },
                  patched_code_hash: { type: "string" },
                },
              },
              message: { type: "string" },
            },
          } } } },
          "404": { description: "Patch not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Patch already approved/rejected.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/patches/{id}/reject": {
      post: {
        tags: ["Patches"],
        summary: "Reject a patch",
        description: "Marks the patch rejected. Audit-logged.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: buildResponses({
          "200": { description: "Patch rejected.", content: { "application/json": { schema: {
            type: "object",
            properties: { patch_id: { type: "string" }, status: { type: "string" }, message: { type: "string" } },
          } } } },
          "404": { description: "Patch not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Patch already approved/rejected.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Incidents ────────────────────────────────────────────────────────
    "/api/incidents": {
      get: {
        tags: ["Incidents"],
        summary: "List incidents",
        description: "Returns incidents the caller can see (admins see all; viewers see incidents on their owned clients plus standalone incidents they created). Supports optional ?status= and ?severity= filters.",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["open", "investigating", "contained", "eradicated", "closed"] } },
          { name: "severity", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "critical"] } },
        ],
        responses: buildResponses({
          "200": { description: "List of incidents.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Incident" } } } } },
        }),
      },
      post: {
        tags: ["Incidents"],
        summary: "Create an incident",
        description: "Creates an incident case. Auto-creates a 'case opened' timeline event and dispatches an `incident_created` webhook (fire-and-forget).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", maxLength: 500 },
              description: { type: "string", maxLength: 8000 },
              severity: { type: "string", enum: ["low", "medium", "high", "critical"], default: "medium" },
              category: { type: "string", default: "other" },
              source: { type: "string", default: "manual" },
              sourceId: { type: "string" },
              clientId: { type: "string", format: "uuid", description: "Optional — caller must own this client if supplied." },
              targetId: { type: "string", format: "uuid" },
              assignee: { type: "string" },
              rootCause: { type: "string" },
              lessonsLearned: { type: "string" },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "Incident created.", content: { "application/json": { schema: {
            type: "object",
            properties: { id: { type: "string" }, title: { type: "string" }, status: { type: "string" }, message: { type: "string" } },
          } } } },
        }),
      },
    },
    "/api/incidents/{id}": {
      get: {
        tags: ["Incidents"],
        summary: "Get incident detail",
        description: "Returns an incident with its timeline events (sorted oldest-first) and evidence items.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Incident detail.", content: { "application/json": { schema: { $ref: "#/components/schemas/Incident" } } } },
          "404": { description: "Not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      patch: {
        tags: ["Incidents"],
        summary: "Update incident",
        description: "Updates severity, status, assignee, rootCause, lessonsLearned, etc. Status transitions to contained/eradicated/closed auto-stamp the corresponding *At timestamp and append an audit timeline event.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
              status: { type: "string", enum: ["open", "investigating", "contained", "eradicated", "closed"] },
              category: { type: "string" },
              assignee: { type: "string", nullable: true },
              rootCause: { type: "string" },
              lessonsLearned: { type: "string" },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Incident updated.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              severity: { type: "string" },
              status: { type: "string" },
              assignee: { type: "string", nullable: true },
              containedAt: { type: "string", format: "date-time", nullable: true },
              eradicatedAt: { type: "string", format: "date-time", nullable: true },
              closedAt: { type: "string", format: "date-time", nullable: true },
              message: { type: "string" },
            },
          } } } },
          "400": { description: "No valid fields to update.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── IOCs ─────────────────────────────────────────────────────────────
    "/api/iocs": {
      get: {
        tags: ["IOCs"],
        summary: "List IOCs",
        description: "Returns IOCs (any authenticated user sees all — IOCs are shared threat intel). Optional ?type=, ?source=, ?active=, ?take= filters.",
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["ip", "hash", "domain", "url", "email", "user_agent"] } },
          { name: "source", in: "query", schema: { type: "string", enum: ["honeypot", "canary", "api_log", "threat_intel", "manual"] } },
          { name: "active", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "take", in: "query", schema: { type: "integer", minimum: 1 } },
        ],
        responses: buildResponses({
          "200": { description: "IOC list with summary.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              iocs: { type: "array", items: { $ref: "#/components/schemas/IOC" } },
              count: { type: "integer" },
              active: { type: "integer" },
              byType: { type: "array", items: { type: "object", properties: { type: { type: "string" }, count: { type: "integer" } } } },
            },
          } } } },
        }),
      },
      post: {
        tags: ["IOCs"],
        summary: "Add an IOC",
        description: "Adds an IOC. If the value already exists (case-insensitive), increments hitCount + refreshes lastSeen + optionally upgrades confidence instead of creating a duplicate.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["iocType", "value"],
            properties: {
              iocType: { type: "string", enum: ["ip", "hash", "domain", "url", "email", "user_agent"] },
              value: { type: "string", maxLength: 2048 },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              source: { type: "string", enum: ["honeypot", "canary", "api_log", "threat_intel", "manual"] },
              tags: { type: "array", items: { type: "string" } },
              notes: { type: "string", maxLength: 8000 },
              isActive: { type: "boolean" },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "New IOC created.", content: { "application/json": { schema: { type: "object" } } } },
          "200": { description: "Existing IOC re-confirmed (hitCount incremented).", content: { "application/json": { schema: { type: "object" } } } },
        }),
      },
      patch: {
        tags: ["IOCs"],
        summary: "Toggle IOC active state",
        description: "Body: { id, isActive }. Flips the IOC's isActive flag.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["id", "isActive"],
            properties: {
              id: { type: "string", format: "uuid" },
              isActive: { type: "boolean" },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "IOC toggled.", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, isActive: { type: "boolean" }, message: { type: "string" } } } } } },
          "404": { description: "IOC not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Settings ─────────────────────────────────────────────────────────
    "/api/settings": {
      get: {
        tags: ["Settings"],
        summary: "List platform settings",
        description: "Admin only. Returns all platform_settings groups (email_smtp, whatsapp, telegram, sms, general, notifications) with config + isActive. Secrets are returned as-stored — admin-only.",
        parameters: [
          { name: "key", in: "query", schema: { type: "string", enum: ["email_smtp", "whatsapp", "telegram", "sms", "general", "notifications"] } },
        ],
        responses: buildResponses({
          "200": { description: "Platform settings.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              settings: { type: "object", additionalProperties: { type: "object" } },
              keys: { type: "array", items: { type: "string" } },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      post: {
        tags: ["Settings"],
        summary: "Save a settings group",
        description: "Admin only. Creates or updates a single settings group (keyed by `_key` inside the JSON config). Invalidates the SMTP cache when `key=email_smtp` so the next send picks up new credentials immediately.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["key", "config"],
            properties: {
              key: { type: "string", enum: ["email_smtp", "whatsapp", "telegram", "sms", "general", "notifications"] },
              config: { type: "object", description: "Channel-specific config object (host/port/user/password for SMTP, botToken/chatId for Telegram, etc.)." },
              isActive: { type: "boolean" },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Saved.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, key: { type: "string" }, message: { type: "string" } } } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      patch: {
        tags: ["Settings"],
        summary: "Test a notification channel",
        description: "Admin only. Body: { action: \"test\", channel, config, testTarget }. Verifies SMTP connection + sends a test email, OR sends a test WhatsApp / Telegram / SMS message. Audit-logs SMTP tests with host/port/success (never the password).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["action", "channel", "config"],
            properties: {
              action: { type: "string", enum: ["test"] },
              channel: { type: "string", enum: ["email", "whatsapp", "telegram", "sms"] },
              config: { type: "object" },
              testTarget: { type: "string", description: "Recipient (email, phone, chat_id) for the test message." },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Test result.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              detail: { type: "string", description: "Optional — connection-check detail on failure." },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Users ────────────────────────────────────────────────────────────
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description: "Admin only. Returns all users (id, email, name, role, approved, createdAt).",
        responses: buildResponses({
          "200": { description: "User list.", content: { "application/json": { schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" }, email: { type: "string" }, name: { type: "string" },
                role: { type: "string", enum: ["admin", "analyst", "viewer"] },
                approved: { type: "boolean" }, created_at: { type: "string", format: "date-time" },
              },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      post: {
        tags: ["Users"],
        summary: "Admin creates a user",
        description: "Admin only. Creates a user with bcrypt-hashed password. Defaults approved=false (pass `approve: true` to provision an immediately-active account).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["email", "name", "password"],
            properties: {
              email: { type: "string", format: "email" },
              name: { type: "string", maxLength: 100 },
              password: { type: "string", minLength: 8, maxLength: 128, format: "password" },
              role: { type: "string", enum: ["admin", "analyst", "viewer"], default: "viewer" },
              approve: { type: "boolean", default: false },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "User created.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, email: { type: "string" }, name: { type: "string" },
              role: { type: "string" }, approved: { type: "boolean" }, message: { type: "string" },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      patch: {
        tags: ["Users"],
        summary: "Update a user's role",
        description: "Admin only. ?id=xxx — changes the user's role (admin/analyst/viewer). Audit-logs oldRole → newRole.",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["role"],
            properties: { role: { type: "string", enum: ["admin", "analyst", "viewer"] } },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Role updated.", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, role: { type: "string" }, message: { type: "string" } } } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      delete: {
        tags: ["Users"],
        summary: "Delete a user",
        description: "Admin only. ?id=xxx. Prevents self-deletion (avoid lockout).",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "User deleted.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } } } } },
          "400": { description: "Cannot delete own account.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },
    "/api/users/{id}/approve": {
      post: {
        tags: ["Users"],
        summary: "Approve or reject a pending user",
        description: "Admin only. Body: { action: \"approve\" | \"reject\", reason? }. On approve → sets approved=true + emails the user. On reject → deletes the account + emails a rejection notice. Both fire-and-forget the email, both audit-logged.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["action"],
            properties: {
              action: { type: "string", enum: ["approve", "reject"] },
              reason: { type: "string", description: "Optional rejection reason shown in the email." },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Action completed.", content: { "application/json": { schema: {
            type: "object",
            properties: { ok: { type: "boolean" }, user: { $ref: "#/components/schemas/User" }, message: { type: "string" } },
          } } } },
          "400": { description: "Unknown action.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
      get: {
        tags: ["Users"],
        summary: "Check a user's approval status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Approval status.", content: { "application/json": { schema: { type: "object", properties: { approved: { type: "boolean" } } } } } },
        }),
      },
    },

    // ── Admin ────────────────────────────────────────────────────────────
    "/api/admin/user-activity": {
      get: {
        tags: ["Admin"],
        summary: "Per-user activity summary",
        description:
          "Admin only. Returns per-user identity + last-login + activity stats (clients owned, scans run, patches, findings, audit-log entries) + the last 5 audit entries per user. Batched into ~10 wide queries so an N-user tenant stays at one round-trip.",
        responses: buildResponses({
          "200": { description: "User activity summary.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              users: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    email: { type: "string" },
                    name: { type: "string", nullable: true },
                    role: { type: "string" },
                    approved: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time", nullable: true },
                    lastLoginAt: { type: "string", format: "date-time", nullable: true },
                    lastLoginIp: { type: "string", nullable: true },
                    stats: {
                      type: "object",
                      properties: {
                        clients: { type: "integer" }, scans: { type: "integer" },
                        patches: { type: "integer" }, findings: { type: "integer" },
                        auditEntries: { type: "integer" },
                      },
                    },
                    recentActivity: { type: "array", items: { type: "object", properties: {
                      action: { type: "string", nullable: true },
                      entity: { type: "string", nullable: true },
                      timestamp: { type: "string", format: "date-time" },
                    } } },
                  },
                },
              },
              totals: {
                type: "object",
                properties: {
                  users: { type: "integer" },
                  activeToday: { type: "integer" },
                  clients: { type: "integer" },
                },
              },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Monitoring ───────────────────────────────────────────────────────
    "/api": {
      get: {
        tags: ["Monitoring"],
        summary: "API root / health-check",
        description: "Lightweight liveness probe. Returns `{ message: \"Hello, world!\" }`. Public — no auth required.",
        security: [],
        responses: buildResponses({
          "200": { description: "API is up.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } } },
        }),
      },
    },
    "/api/email-logs": {
      get: {
        tags: ["Monitoring"],
        summary: "List email delivery logs",
        description: "Admin only. Returns recent EmailLog rows (sorted desc) plus a 50-row rolling summary (sent / failed / successRate). Optional ?status=sent|failed filter and ?limit (max 200).",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["sent", "failed"] } },
        ],
        responses: buildResponses({
          "200": { description: "Email logs + summary.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    to: { type: "string" },
                    subject: { type: "string" },
                    status: { type: "string", enum: ["sent", "failed"] },
                    messageId: { type: "string", nullable: true },
                    error: { type: "string", nullable: true },
                    template: { type: "string", nullable: true },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
              summary: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  sent: { type: "integer" },
                  failed: { type: "integer" },
                  successRate: { type: "number", nullable: true, description: "0–100 (one decimal), or null if no logs." },
                },
              },
            },
          } } } },
          "403": { description: "Admin role required.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        }),
      },
    },

    // ── Webhooks ─────────────────────────────────────────────────────────
    "/api/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List webhook configs",
        description: "Returns all webhook configs. The `secret` column is NEVER returned (write-only) — only `hasSecret`.",
        responses: buildResponses({
          "200": { description: "Webhook list.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Webhook" } } } } },
        }),
      },
      post: {
        tags: ["Webhooks"],
        summary: "Create / test a webhook",
        description:
          "Two modes: (a) `{ name, url, events, secret?, isActive? }` creates a WebhookConfig (auto-generates a 32-byte hex secret if omitted, returned ONCE in the response). " +
          "(b) `{ test: true, id }` dispatches a synthetic test event to one webhook (bypasses the events-filter).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string", format: "uri" },
              events: { type: "array", items: { type: "string" }, description: "Event types or [\"*\"] for all." },
              secret: { type: "string", description: "Optional — auto-generated if omitted." },
              isActive: { type: "boolean" },
              test: { type: "boolean", description: "Test mode — dispatch a synthetic event." },
              id: { type: "string", description: "Required when test=true." },
            },
          } } },
        },
        responses: buildResponses({
          "201": { description: "Webhook created.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, name: { type: "string" }, url: { type: "string" },
              events: { type: "array", items: { type: "string" } },
              isActive: { type: "boolean" },
              secret: { type: "string", description: "Returned ONCE on creation — save it; never readable again." },
              message: { type: "string" },
            },
          } } } },
          "200": { description: "Test event result.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" }, matched: { type: "integer" },
              succeeded: { type: "integer" }, failed: { type: "integer" }, message: { type: "string" },
            },
          } } } },
        }),
      },
      patch: {
        tags: ["Webhooks"],
        summary: "Update a webhook",
        description: "Updates fields. Empty `secret: \"\"` rotates the secret (new value returned). Omit `secret` to preserve the existing one.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string", format: "uuid" },
              isActive: { type: "boolean" },
              name: { type: "string" },
              url: { type: "string", format: "uri" },
              events: { type: "array", items: { type: "string" } },
              secret: { type: "string", description: "Empty string rotates; omitted preserves." },
            },
          } } },
        },
        responses: buildResponses({
          "200": { description: "Webhook updated.", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, name: { type: "string" }, url: { type: "string" },
              events: { type: "array", items: { type: "string" } },
              isActive: { type: "boolean" },
              secret: { type: "string", nullable: true, description: "Returned only when secret was rotated." },
            },
          } } } },
        }),
      },
      delete: {
        tags: ["Webhooks"],
        summary: "Delete a webhook",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
        responses: buildResponses({
          "200": { description: "Deleted.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
        }),
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
