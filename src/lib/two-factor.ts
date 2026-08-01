// GuardianX 2FA (TOTP) Utilities
import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "GuardianX";

/**
 * Generate a TOTP secret + QR code for a user.
 */
export async function setup2FA(email: string): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  const qrCode = await QRCode.toDataURL(otpauthUrl, { width: 256, margin: 1 });
  return { secret, qrCode, otpauthUrl };
}

/**
 * Verify a TOTP token against a secret.
 */
export function verify2FA(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate backup codes (10 codes, 8 chars each).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}
