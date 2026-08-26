// POST /api/auth/2fa/setup
//
// Step 1 of TOTP setup. Requires an authenticated session. Generates a fresh
// base32 TOTP secret via otplib, persists it on the User row (with
// `twoFactorEnabled` still FALSE — the user must prove they can produce a
// valid code via /api/auth/2fa/verify before 2FA is actually enabled), and
// returns:
//   - secret:        the base32 secret (shown as text for manual entry)
//   - otpauthUrl:    otpauth://totp/... URL (a compliant authenticator app
//                    can ingest this directly)
//   - qrCode:        data: URL of a PNG QR code encoding otpauthUrl, for
//                    rendering inline in the browser via <img src=...>
//
// Re-running setup overwrites any previously-stored secret (whether or not
// verification ever succeeded), which is the desired behaviour for a user
// retrying setup or rotating their secret.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { setup2FA } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    // Generate new secret + QR (uses otplib v13 `generateSecret` /
    // `generateURI` under the hood, plus `qrcode` for the PNG data URL).
    const { secret, qrCode, otpauthUrl } = await setup2FA(user.email);

    // Persist the secret on the user row but DO NOT flip twoFactorEnabled
    // yet — that only happens after /verify proves the user has the secret
    // in their authenticator app.
    const { error } = await supabase
      .from("User")
      .update({ twoFactorSecret: secret })
      .eq("id", user.userId);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      secret,
      qrCode,
      otpauthUrl,
      message:
        "Scan the QR code with Google Authenticator / Authy / 1Password, then enter the 6-digit code to verify.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set up 2FA" },
      { status: 500 }
    );
  }
}
