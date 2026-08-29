import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { randomUUID, timingSafeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/auth/breakglass-reset
//
// Emergency admin password reset using the BREAK_GLASS_KEY env var.
// This endpoint is ONLY for recovering access when the admin password
// is lost or the hash is corrupted after a DB migration.
//
// Body: { breakglassKey, email, newPassword }
//
// Security:
//   - Requires BREAK_GLASS_KEY env var to be set.
//   - Constant-time comparison of the supplied key.
//   - Only works for users with role=admin.
//   - Bumps tokenVersion to revoke all existing sessions.
//   - Writes an AuditLog row.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { breakglassKey, email, newPassword } = body as {
    breakglassKey?: string;
    email?: string;
    newPassword?: string;
  };

  if (!breakglassKey || !email || !newPassword) {
    return NextResponse.json(
      { error: "breakglassKey, email, and newPassword are required" },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const envKey = process.env.BREAK_GLASS_KEY;
  if (!envKey) {
    return NextResponse.json(
      { error: "Break-glass recovery is not configured on this server." },
      { status: 503 }
    );
  }

  // Constant-time comparison
  const keyBuf = new TextEncoder().encode(String(breakglassKey));
  const envBuf = new TextEncoder().encode(envKey);
  if (keyBuf.length !== envBuf.length) {
    return NextResponse.json({ error: "Invalid break-glass key." }, { status: 403 });
  }
  const ok = await timingSafeEqual(keyBuf, envBuf);
  if (!ok) {
    return NextResponse.json({ error: "Invalid break-glass key." }, { status: 403 });
  }

  try {
    // Find the user by email
    const user = await db.user.findFirst({
      where: { email: String(email).toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email." },
        { status: 404 }
      );
    }

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Break-glass reset is only available for admin accounts." },
        { status: 403 }
      );
    }

    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Update the user + bump tokenVersion
    const nextTokenVersion = (user.tokenVersion ?? 0) + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: nextTokenVersion,
        approved: true,
      },
    });

    // Write an audit log entry
    try {
      await db.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: "breakglass-script",
          action: "BREAKGLASS_PASSWORD_RESET",
          targetId: user.id,
          targetType: "User",
          details: `Password reset via break-glass key. tokenVersion bumped to ${nextTokenVersion}.`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // AuditLog table might not exist — non-critical
    }

    return NextResponse.json({
      ok: true,
      message: `Password reset for ${user.email}. All previous sessions have been revoked. You can now log in with the new password.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
