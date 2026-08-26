// GET /api/auth/2fa
//
// Returns the calling user's current TOTP 2FA status. Used by the settings
// panel to decide whether to render the "Enable 2FA" button or the
// "2FA is enabled" badge + "Disable 2FA" button.
//
//   { enabled: boolean, hasPendingSecret: boolean }
//
// `enabled` is the user's effective 2FA state (twoFactorEnabled === true).
// `hasPendingSecret` is true when a secret exists on the row but 2FA hasn't
// been verified yet — i.e. the user ran /setup but never finished /verify.
// The frontend uses this to show a "verify pending" hint.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const { data, error } = await supabase
      .from("User")
      .select("twoFactorEnabled, twoFactorSecret")
      .eq("id", user.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      enabled: data.twoFactorEnabled === true,
      hasPendingSecret: !!data.twoFactorSecret && data.twoFactorEnabled !== true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch 2FA status" },
      { status: 500 }
    );
  }
}
