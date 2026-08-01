import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { setup2FA, verify2FA, generateBackupCodes } from "@/lib/two-factor";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/2fa — setup or verify 2FA
// Body: { action: "setup" | "verify" | "disable", token?: string, secret?: string }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, token, secret } = body;

  try {
    if (action === "setup") {
      // Generate new secret + QR code
      const { secret: newSecret, qrCode, otpauthUrl } = await setup2FA(user.email);
      return NextResponse.json({
        secret: newSecret,
        qrCode,
        otpauthUrl,
        message: "Scan the QR code with Google Authenticator / Authy, then enter the 6-digit code to verify.",
      });
    }

    if (action === "verify") {
      // Verify token + save secret to user
      if (!token || !secret) return NextResponse.json({ error: "token and secret required" }, { status: 400 });
      const valid = verify2FA(token, secret);
      if (!valid) return NextResponse.json({ error: "Invalid code. Try again." }, { status: 400 });

      // Save secret + generate backup codes
      const backupCodes = generateBackupCodes();
      const { error } = await supabase
        .from("User")
        .update({
          twofaSecret: secret,
          twofaEnabled: true,
          backupCodes: JSON.stringify(backupCodes),
        })
        .eq("id", user.userId);

      if (error) throw new Error(error.message);

      return NextResponse.json({
        ok: true,
        backupCodes,
        message: "2FA enabled! Save your backup codes — you'll need them if you lose your authenticator.",
      });
    }

    if (action === "disable") {
      await supabase
        .from("User")
        .update({ twofaSecret: null, twofaEnabled: false, backupCodes: null })
        .eq("id", user.userId);

      return NextResponse.json({ ok: true, message: "2FA disabled." });
    }

    if (action === "status") {
      const { data } = await supabase
        .from("User")
        .select("twofaEnabled")
        .eq("id", user.userId)
        .single();

      return NextResponse.json({ enabled: data?.twofaEnabled || false });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
