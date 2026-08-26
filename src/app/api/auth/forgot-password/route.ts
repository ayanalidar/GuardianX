import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { passwordResetHtml, ONBOARDING_SUBJECTS } from "@/lib/email-templates/welcome";

export const dynamic = "force-dynamic";

// POST /api/auth/forgot-password
// Body: { email: string }
//
// Always returns 200 (even if the email doesn't exist) to prevent email
// enumeration attacks. If the email exists and the user is approved, a
// reset token is generated, stored in the PasswordReset table, and emailed
// to the user. The token expires after 1 hour.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email as string)?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  try {
    // Look up the user. We deliberately do NOT reveal whether the email exists.
    const { data: user } = await supabase
      .from("User")
      .select("id, email, name, approved")
      .eq("email", email)
      .maybeSingle();

    const u = (user || {}) as Record<string, unknown>;
    const userId = u.id as string | undefined;
    const userName = (u.name as string) || "there";
    const userEmail = (u.email as string) || email;
    const approved = u.approved as boolean | undefined;

    // Only send a reset email if the user exists AND is approved. Pending
    // users cannot reset because they have no usable session anyway; they
    // should contact an admin to be approved first.
    if (userId && approved) {
      const token = randomUUID() + randomUUID(); // 72-char URL-safe token
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      // Invalidate any previous unused tokens for this user (one active reset at a time).
      try {
        await supabase
          .from("PasswordReset")
          .update({ usedAt: new Date().toISOString() })
          .eq("userId", userId)
          .is("usedAt", "null");
      } catch {
        // Table may not exist yet on first run; the insert below will surface a clearer error.
      }

      // Insert the new token.
      const { error: insertErr } = await supabase
        .from("PasswordReset")
        .insert({
          id: randomUUID(),
          userId,
          token,
          expiresAt,
          createdAt: new Date().toISOString(),
        });

      if (insertErr) {
        console.error("[forgot-password] PasswordReset insert failed:", insertErr.message);
      } else {
        // Build the reset link and fire the email (fire-and-forget).
        const origin = new URL(req.url).origin;
        const resetLink = `${origin}/reset-password?token=${token}`;
        void sendEmail(
          userEmail,
          ONBOARDING_SUBJECTS.passwordReset,
          passwordResetHtml({ name: userName, email: userEmail, resetLink }),
          "passwordReset"
        ).then((ok) => {
          console.log(`[forgot-password] reset email to ${userEmail}: ${ok ? "sent" : "failed"}`);
        }).catch((err) => {
          console.error("[forgot-password] reset email threw:", err instanceof Error ? err.message : err);
        });
      }
    }

    // Always return the same response to prevent email enumeration.
    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, a password reset link has been sent. The link expires in 1 hour.",
    });
  } catch (err) {
    console.error("[forgot-password] error:", err);
    // Still return 200 to avoid leaking info.
    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, a password reset link has been sent. The link expires in 1 hour.",
    });
  }
}
