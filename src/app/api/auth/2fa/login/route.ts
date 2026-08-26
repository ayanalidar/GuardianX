// POST /api/auth/2fa/login
//
// Step 2 of the 2FA login flow. This endpoint is PUBLIC (listed in
// middleware's PUBLIC_ROUTES) because the caller does not yet have a real
// session JWT — they only have the short-lived 2FA step-up temp token issued
// by /api/auth/login.
//
// Body: `{ twoFactorToken, token }`
//   - twoFactorToken: the 5-minute JWT from /api/auth/login (proves the user
//     just authenticated with their password)
//   - token:          the 6-digit TOTP code from the user's authenticator
//
// On success, issues the real 7-day session JWT (same shape as the normal
// /api/auth/login response) + sets the guardianx-token cookie.
//
// On any failure (bad temp token, user not found, 2FA not enabled, bad TOTP
// code) we return a generic 401/400 so an attacker can't enumerate which
// step failed.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createToken, verifyTwoFactorTempToken } from "@/lib/auth";
import { verify2FA } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { twoFactorToken, token } = body as {
    twoFactorToken?: string;
    token?: string;
  };

  if (!twoFactorToken || typeof twoFactorToken !== "string") {
    return NextResponse.json(
      { error: "twoFactorToken is required." },
      { status: 400 }
    );
  }
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "token is required (the 6-digit code from your authenticator)." },
      { status: 400 }
    );
  }

  const trimmed = token.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return NextResponse.json(
      { error: "Token must be exactly 6 digits." },
      { status: 400 }
    );
  }

  // Verify the step-up temp token (5-min expiry, purpose=2fa-stepup).
  const userId = verifyTwoFactorTempToken(twoFactorToken);
  if (!userId) {
    return NextResponse.json(
      {
        error: "Your 2FA session has expired. Please log in again.",
        code: "TWO_FACTOR_SESSION_EXPIRED",
      },
      { status: 401 }
    );
  }

  try {
    const { data: user, error } = await supabase
      .from("User")
      .select("id, email, name, role, approved, emailVerified, twoFactorEnabled, twoFactorSecret")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      // The temp token was valid but the user no longer has 2FA enabled
      // (maybe they disabled it in another session). Fail closed.
      return NextResponse.json(
        { error: "2FA is not enabled on this account. Please log in again." },
        { status: 401 }
      );
    }

    // Defense in depth: re-check approval + email-verification, in case the
    // user's state changed between when the temp token was issued and now.
    if (user.emailVerified !== true || user.approved !== true) {
      return NextResponse.json(
        { error: "Account is not eligible for login.", code: "ACCOUNT_NOT_ELIGIBLE" },
        { status: 403 }
      );
    }

    const valid = verify2FA(trimmed, user.twoFactorSecret as string);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid 2FA code. Try again." },
        { status: 400 }
      );
    }

    // ── Issue the real session JWT ───────────────────────────────────────
    const sessionToken = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      approved: true,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token: sessionToken,
      message: "Login successful",
    });

    response.cookies.set("guardianx-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days, matches /api/auth/login
      path: "/",
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}
