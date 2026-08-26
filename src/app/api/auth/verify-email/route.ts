import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/verify-email
// Body: { token: string }
//
// Validates the email-verification token (exists in EmailVerification table,
// not used, not expired — 24h expiry). On success: sets emailVerified=true on
// the User and marks the token as used (single-use). Returns ok:true so the
// /verify-email page can show the success state.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = (body.token as string)?.trim();

  if (!token || typeof token !== "string" || token.length < 60) {
    return NextResponse.json(
      { error: "Invalid or missing verification token.", code: "INVALID_TOKEN" },
      { status: 400 }
    );
  }

  try {
    // Look up the token.
    const { data: verifyRow, error: verifyErr } = await supabase
      .from("EmailVerification")
      .select("id, userId, token, expiresAt, usedAt")
      .eq("token", token)
      .maybeSingle();

    if (verifyErr) {
      console.error("[verify-email] token lookup failed:", verifyErr.message);
      return NextResponse.json(
        { error: "Unable to validate verification token. Please request a new one.", code: "TOKEN_LOOKUP_FAILED" },
        { status: 500 }
      );
    }

    const v = (verifyRow || {}) as Record<string, unknown>;
    const verifyId = v.id as string | undefined;
    const userId = v.userId as string | undefined;
    const expiresAt = v.expiresAt as string | undefined;
    const usedAt = v.usedAt as string | null | undefined;

    // Validate the token.
    if (!verifyId || !userId) {
      return NextResponse.json(
        { error: "This verification link is invalid. Please request a new one.", code: "TOKEN_NOT_FOUND" },
        { status: 400 }
      );
    }
    if (usedAt) {
      return NextResponse.json(
        { error: "This verification link has already been used. You can now sign in.", code: "TOKEN_USED" },
        { status: 400 }
      );
    }
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This verification link has expired. Please request a new one.", code: "TOKEN_EXPIRED" },
        { status: 400 }
      );
    }

    // Mark the user's email as verified.
    const { error: updateErr } = await supabase
      .from("User")
      .update({ emailVerified: true, updatedAt: new Date().toISOString() })
      .eq("id", userId);

    if (updateErr) {
      console.error("[verify-email] user update failed:", updateErr.message);
      return NextResponse.json(
        { error: "Failed to verify email. Please try again." },
        { status: 500 }
      );
    }

    // Mark the token as used so it can't be replayed.
    await supabase
      .from("EmailVerification")
      .update({ usedAt: new Date().toISOString() })
      .eq("id", verifyId);

    // Best-effort audit log so the verification is visible in the trail.
    try {
      const { data: user } = await supabase
        .from("User")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      const u = (user || {}) as Record<string, unknown>;
      const userEmail = (u.email as string) || "unknown";
      await supabase.from("AuditLog").insert({
        id: randomUUID(),
        action: "user.email_verified",
        entity: "user",
        actor: userEmail,
        details: JSON.stringify({ userId, email: userEmail }),
      });
    } catch (auditErr) {
      console.error("[verify-email] audit log failed:", auditErr instanceof Error ? auditErr.message : auditErr);
    }

    return NextResponse.json({
      ok: true,
      message: "Email verified. You can now log in.",
    });
  } catch (err) {
    console.error("[verify-email] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
