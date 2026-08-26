// POST /api/auth/2fa/verify
//
// Step 2 of TOTP setup. Requires an authenticated session. Body: `{ token }`.
// Verifies the supplied 6-digit TOTP code against the secret stored on the
// user row by /api/auth/2fa/setup. If valid, flips `twoFactorEnabled` to
// true — from this point forward the login flow will require a TOTP code.
//
// If the user calls /verify without first calling /setup (no secret on the
// row), we return 400 with a clear "no pending secret" message.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verify2FA } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const { token } = body as { token?: string };

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "token is required (the 6-digit code from your authenticator)" },
      { status: 400 }
    );
  }

  // TOTP codes are 6 digits. Allow a 1-char typo buffer for whitespace.
  const trimmed = token.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return NextResponse.json(
      { error: "Token must be exactly 6 digits." },
      { status: 400 }
    );
  }

  try {
    const { data: row, error } = await supabase
      .from("User")
      .select("twoFactorSecret, twoFactorEnabled")
      .eq("id", user.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!row) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!row.twoFactorSecret) {
      return NextResponse.json(
        {
          error:
            "No pending 2FA secret. Call /api/auth/2fa/setup first to generate a QR code.",
          code: "NO_PENDING_SECRET",
        },
        { status: 400 }
      );
    }

    // Constant-time-ish verification is handled inside otplib. We add a
    // ±30s (one time step) clock drift tolerance for Google Authenticator
    // compat (see src/lib/two-factor.ts).
    const valid = verify2FA(trimmed, row.twoFactorSecret as string);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. Try again." },
        { status: 400 }
      );
    }

    // Promote: 2FA is now considered enabled for this user.
    const { error: updErr } = await supabase
      .from("User")
      .update({ twoFactorEnabled: true })
      .eq("id", user.userId);

    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({
      ok: true,
      enabled: true,
      message: "2FA enabled. Future logins will require a code from your authenticator.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to verify 2FA" },
      { status: 500 }
    );
  }
}
