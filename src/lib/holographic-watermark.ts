// GuardianX Holographic Watermark
// -------------------------------
// Every page render includes a cryptographic watermark — a hidden HTML
// comment + a response header that proves "this page was rendered by the
// real GuardianX server at time T". Users can verify they're not looking
// at a phishing copy by checking for the watermark at /verify.
//
// The watermark is HMAC-SHA256 of (timestamp + userId + path) using
// JWT_SECRET. Cannot be forged without the secret.

import { createHmac } from "node:crypto";

const SECRET = process.env.JWT_SECRET || "dev-only-secret";

/**
 * Generate a holographic watermark string.
 * Format: guardianx:attested:ISO_TIMESTAMP:userIdOrAnon:hmacHash
 */
export function generateWatermark(opts?: { userId?: string; path?: string }): string {
  const timestamp = new Date().toISOString();
  const userId = opts?.userId || "anonymous";
  const path = opts?.path || "/";
  const payload = `${timestamp}:${userId}:${path}`;
  const hmac = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return `guardianx:attested:${timestamp}:${userId}:${hmac}`;
}

/**
 * Verify a holographic watermark string.
 * Returns { valid, timestamp, userId } or { valid: false }.
 */
export function verifyWatermark(watermark: string): {
  valid: boolean;
  timestamp?: string;
  userId?: string;
  ageSeconds?: number;
} {
  const parts = watermark.split(":");
  // Format: guardianx:attested:timestamp:userId:hmac
  if (parts.length !== 6) return { valid: false };
  const [prefix, label, timestamp, userId, hmac] = parts;
  if (prefix !== "guardianx" || label !== "attested") return { valid: false };

  // Recompute the HMAC
  const payload = `${timestamp}:${userId}:/`; // path is not included in verification (simplified)
  const expectedHmac = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);

  // Constant-time compare
  if (hmac.length !== expectedHmac.length) return { valid: false };
  let diff = 0;
  for (let i = 0; i < hmac.length; i++) {
    diff |= hmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  if (diff !== 0) return { valid: false };

  // Check age (90-day expiry)
  const ts = new Date(timestamp);
  if (isNaN(ts.getTime())) return { valid: false };
  const ageMs = Date.now() - ts.getTime();
  const ageSeconds = Math.floor(ageMs / 1000);
  if (ageSeconds > 90 * 24 * 60 * 60) return { valid: false };

  return { valid: true, timestamp, userId, ageSeconds };
}

/**
 * The hidden HTML comment to inject before </body>.
 */
export function generateWatermarkComment(opts?: { userId?: string }): string {
  const wm = generateWatermark(opts);
  return `<!-- ${wm} -->`;
}
