// POST /api/auth/2fa/disable
//
// Requires an authenticated session. Body: `{ token }`. Disabling 2FA is a
// privileged, irreversible action — we require the user to prove possession
// of the current TOTP secret by supplying a valid 6-digit code (the same
// proof-of-knowledge that login uses). This stops a hijacked session from
// silently downgrading account security.
//
// On success we CLEAR both `twoFactorSecret` and `twoFactorEnabled`, so a
// re-enable starts from a fresh secret (no stale secrets lingering on the
// row).

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
      { error: "token is required (the current 6-digit code from your authenticator)" },
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

    if (!row.twoFactorEnabled || !row.twoFactorSecret) {
      return NextResponse.json(
        { error: "2FA is not currently enabled on this account." },
        { status: 400 }
      );
    }

    const valid = verify2FA(trimmed, row.twoFactorSecret as string);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. 2FA was NOT disabled — try again." },
        { status: 400 }
      );
    }

    // Clear both the secret and the enabled flag. Re-enabling will mint a
    // brand-new secret via /setup.
    const { error: updErr } = await supabase
      .from("User")
      .update({ twoFactorSecret: null, twoFactorEnabled: false })
      .eq("id", user.userId);

    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({
      ok: true,
      enabled: false,
      message: "2FA disabled. We recommend re-enabling it as soon as possible.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disable 2FA" },
      { status: 500 }
    );
  }
}
