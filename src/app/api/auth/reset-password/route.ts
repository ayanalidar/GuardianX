import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { passwordResetSuccessHtml, ONBOARDING_SUBJECTS } from "@/lib/email-templates/welcome";

export const dynamic = "force-dynamic";

// POST /api/auth/reset-password
// Body: { token: string, password: string }
//
// Validates the reset token (exists, not used, not expired), then updates
// the user's password and marks the token as used.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = (body.token as string)?.trim();
  const password = (body.password as string)?.trim();

  if (!token || typeof token !== "string" || token.length < 60) {
    return NextResponse.json(
      { error: "Invalid or missing reset token.", code: "INVALID_TOKEN" },
      { status: 400 }
    );
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (password.length > 128) {
    return NextResponse.json(
      { error: "Password too long (max 128 characters)." },
      { status: 400 }
    );
  }

  try {
    // Look up the token.
    const { data: resetRow, error: resetErr } = await supabase
      .from("PasswordReset")
      .select("id, userId, token, expiresAt, usedAt")
      .eq("token", token)
      .maybeSingle();

    if (resetErr) {
      console.error("[reset-password] token lookup failed:", resetErr.message);
      return NextResponse.json(
        { error: "Unable to validate reset token. Please request a new one.", code: "TOKEN_LOOKUP_FAILED" },
        { status: 500 }
      );
    }

    const r = (resetRow || {}) as Record<string, unknown>;
    const resetId = r.id as string | undefined;
    const userId = r.userId as string | undefined;
    const expiresAt = r.expiresAt as string | undefined;
    const usedAt = r.usedAt as string | null | undefined;

    // Validate the token.
    if (!resetId || !userId) {
      return NextResponse.json(
        { error: "This reset link is invalid. Please request a new one.", code: "TOKEN_NOT_FOUND" },
        { status: 400 }
      );
    }
    if (usedAt) {
      return NextResponse.json(
        { error: "This reset link has already been used. Please request a new one.", code: "TOKEN_USED" },
        { status: 400 }
      );
    }
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one.", code: "TOKEN_EXPIRED" },
        { status: 400 }
      );
    }

    // Hash the new password and update the user.
    const hashedPassword = await hashPassword(password);
    const { error: updateErr } = await supabase
      .from("User")
      .update({ password: hashedPassword, updatedAt: new Date().toISOString() })
      .eq("id", userId);

    if (updateErr) {
      console.error("[reset-password] user update failed:", updateErr.message);
      return NextResponse.json(
        { error: "Failed to update password. Please try again." },
        { status: 500 }
      );
    }

    // Mark the token as used so it can't be replayed.
    await supabase
      .from("PasswordReset")
      .update({ usedAt: new Date().toISOString() })
      .eq("id", resetId);

    // Send a confirmation email (fire-and-forget).
    try {
      const { data: user } = await supabase
        .from("User")
        .select("email, name")
        .eq("id", userId)
        .maybeSingle();
      const u = (user || {}) as Record<string, unknown>;
      const userEmail = (u.email as string) || "";
      const userName = (u.name as string) || "there";
      if (userEmail) {
        void sendEmail(
          userEmail,
          ONBOARDING_SUBJECTS.passwordResetSuccess,
          passwordResetSuccessHtml({ name: userName, email: userEmail }),
          "passwordResetSuccess"
        ).then((ok) => {
          console.log(`[reset-password] confirmation email to ${userEmail}: ${ok ? "sent" : "failed"}`);
        }).catch((err) => {
          console.error("[reset-password] confirmation email threw:", err instanceof Error ? err.message : err);
        });
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      message: "Your password has been reset. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("[reset-password] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
