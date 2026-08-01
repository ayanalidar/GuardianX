// GuardianX 2FA (TOTP) Utilities — otplib v13 functional API.
//
// otplib v13 was a complete rewrite: the old v12 `authenticator` pre-configured
// instance (with `.generateSecret()`, `.keyuri()`, `.verify()`) no longer
// exists. v13 exposes pure functions instead:
//   - generateSecret()           → base32 secret string
//   - generateURI({issuer,label,secret}) → otpauth:// URI (replaces keyuri)
//   - verifySync({secret,token}) → { valid: boolean, ... }
//
// Defaults are Google-Authenticator-compatible: SHA-1, 6 digits, 30s period.
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const ISSUER = "GuardianX";

/**
 * Generate a TOTP secret + QR code for a user.
 * Returns a base32 secret, a data-URL QR code, and the otpauth:// URI.
 */
export async function setup2FA(email: string): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });
  const qrCode = await QRCode.toDataURL(otpauthUrl, { width: 256, margin: 1 });
  return { secret, qrCode, otpauthUrl };
}

/**
 * Verify a TOTP token against a secret.
 * Allows ±30s (one time step) of clock drift for Google Authenticator compat.
 */
export function verify2FA(token: string, secret: string): boolean {
  try {
    const result = verifySync({ secret, token, epochTolerance: 30 });
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * Generate backup codes (10 codes, 8 chars each).
 * Stored hashed; shown once to the user at 2FA setup time.
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}
