import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getUserFromRequest, requireAuth } from "@/lib/auth";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/revoke-sessions
//
// Invalidates ALL of a user's existing JWTs by incrementing their
// `tokenVersion` column in the DB. Every JWT issued before this bump embeds
// the old `tokenVersion`, so any Node.js API route that calls
// `enforceSessionRevocation(req)` will reject those tokens with 401
// SESSION_REVOKED (see src/lib/auth.ts).
//
// Authorization:
//   - Admins can revoke ANY user's sessions.
//   - Non-admins can revoke ONLY their own sessions (userId must match the
//     authenticated user's userId).
//
// Body: { userId: string }
//
// NOTE: this endpoint does NOT itself call `enforceSessionRevocation`. The
// calling user's own session must be valid (signature + approval) to reach
// this route, but we intentionally do NOT fail if their tokenVersion is
// stale — otherwise an admin whose sessions were just revoked could not
// revoke anyone else's. (If the admin is mid-attack and their own session
// is being revoked, the next request they make to any other sensitive
// route will fail with 401 SESSION_REVOKED, which is the correct behavior.)
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const caller = auth.user;

  const body = await req.json().catch(() => ({}));
  const { userId } = body;

  if (typeof userId !== "string" || !userId.trim()) {
    return NextResponse.json(
      { error: "userId is required in the request body." },
      { status: 400 }
    );
  }

  // Authorization: non-admins can only revoke their OWN sessions.
  if (caller.role !== "admin" && caller.userId !== userId) {
    return NextResponse.json(
      {
        error: "You can only revoke your own sessions. Admin access required to revoke other users' sessions.",
      },
      { status: 403 }
    );
  }

  try {
    // Fetch the user first so we can:
    //   1. Verify they exist (otherwise 404).
    //   2. Read their current tokenVersion (for the audit log + response).
    const { data: target, error: fetchErr } = await supabase
      .from("User")
      .select("id, email, name, role, tokenVersion")
      .eq("id", userId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!target) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const currentVersion =
      typeof (target as Record<string, unknown>).tokenVersion === "number"
        ? (target as Record<string, unknown>).tokenVersion as number
        : 0;
    const nextVersion = currentVersion + 1;

    // Atomically increment tokenVersion. We use the absolute value
    // (nextVersion) rather than a relative increment (`tokenVersion + 1`)
    // because Supabase's PostgREST does not support column-arithmetic in
    // PATCH bodies — only literal values. Computing nextVersion client-side
    // from the just-fetched currentVersion is safe because:
    //   - The fetch and update happen in the same request (low race window).
    //   - Even if two admins race, both will write nextVersion = current+1
    //     or current+2; either way, all pre-existing tokens are invalidated.
    const { error: updateErr } = await supabase
      .from("User")
      .update({ tokenVersion: nextVersion, updatedAt: new Date().toISOString() })
      .eq("id", userId);

    if (updateErr) throw new Error(updateErr.message);

    // Audit log entry. Fire-and-forget so a Supabase hiccup here doesn't
    // fail the revocation itself. Wrapped in an async IIFE because
    // Supabase's query builder returns PromiseLike (no .catch), so we
    // need a real Promise — Promise.resolve(...) would also work, but
    // the IIFE is more idiomatic for "fire-and-forget with error log".
    void (async () => {
      try {
        const { error } = await supabase.from("AuditLog").insert({
          id: randomUUID(),
          action: "user.sessions_revoked",
          entity: "user",
          actor: caller.email || caller.userId,
          details: JSON.stringify({
            targetUserId: userId,
            targetEmail: (target as Record<string, unknown>).email,
            previousTokenVersion: currentVersion,
            newTokenVersion: nextVersion,
            revokedBy: caller.userId,
            revokedByRole: caller.role,
            revokedAt: new Date().toISOString(),
          }),
        });
        if (error) {
          console.error("[revoke-sessions] audit log insert failed:", error.message);
        }
      } catch (err) {
        console.error("[revoke-sessions] audit log threw:", err instanceof Error ? err.message : err);
      }
    })();

    return NextResponse.json({
      ok: true,
      message:
        "All sessions revoked. The user will need to log in again.",
      userId,
      previousTokenVersion: currentVersion,
      newTokenVersion: nextVersion,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke sessions." },
      { status: 500 }
    );
  }
}

// GET /api/auth/revoke-sessions — returns the caller's current tokenVersion
// so the UI can show "your sessions will be revoked" without exposing other
// users' data. Useful for a "security events" panel.
export async function GET(req: Request) {
  // Use requireAuth for the signature/approval check, but do NOT call
  // enforceSessionRevocation here — a user whose session was just revoked
  // should still be able to query their own tokenVersion (the response will
  // differ from the one in their JWT, which is exactly the signal we want
  // to surface).
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const caller = auth.user;

  try {
    const { data, error } = await supabase
      .from("User")
      .select("tokenVersion")
      .eq("id", caller.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const currentVersion =
      data && typeof data.tokenVersion === "number" ? data.tokenVersion : 0;

    return NextResponse.json({
      userId: caller.userId,
      jwtTokenVersion: caller.tokenVersion ?? null,
      currentTokenVersion: currentVersion,
      sessionRevoked:
        caller.tokenVersion !== undefined &&
        caller.tokenVersion !== currentVersion,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed." },
      { status: 500 }
    );
  }
}
