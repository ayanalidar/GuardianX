// GET /api/auth/login-history
//
// Returns the last 20 login attempts for the calling user, sorted
// newest-first. Used by the Settings → Security → Recent Login Activity
// section so users can spot unauthorized access to their own account.
//
// SECURITY:
//   - Requires authentication (requireAuth).
//   - Returns ONLY rows whose `userId` matches the caller's JWT
//     `userId` claim — enforced both at the SQL level (`.eq("userId",
//     user.userId)`) and by the LoginHistory RLS policy. Even if a
//     caller somehow tampered with the query, RLS would still filter
//     to their own rows.
//   - Does NOT expose other users' history, even to admins (admins
//     have a separate /api/users/[id]/login-history endpoint, if
//     needed — out of scope here).
//   - Does NOT log passwords, tokens, or the supplied email beyond
//     what's already on the User row.
//
// Response shape:
//   {
//     history: Array<{
//       id: string,
//       ipAddress: string,
//       userAgent: string,            // raw UA (for debugging)
//       browser: string,              // parsed: "Chrome" | "Firefox" | ...
//       os: string,                   // parsed: "Windows" | "macOS" | ...
//       success: boolean,
//       failureReason: string | null, // null on success
//       timestamp: string             // ISO 8601
//     }>
//   }

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parseUserAgent } from "@/lib/user-agent";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 20;

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    // Fetch the caller's own login history, newest first.
    //
    // We select only the columns we need (no JOINs — the `userId` is
    // already known from the JWT, so we don't need to fetch the User
    // row). The `.eq("userId", user.userId)` filter is the application-
    // level isolation; the RLS policy on LoginHistory is the defense-
    // in-depth isolation.
    const { data, error } = await supabase
      .from("LoginHistory")
      .select("id, ipAddress, userAgent, success, failureReason, timestamp")
      .eq("userId", user.userId)
      .order("timestamp", { ascending: false })
      .limit(MAX_RESULTS);

    if (error) {
      // Common case: the LoginHistory table doesn't exist yet because
      // the user hasn't run the new migration. Return an empty list
      // with a hint instead of a 500, so the UI can render the empty
      // state gracefully.
      const msg = error.message || "";
      if (
        msg.includes("Could not find the table") ||
        msg.includes("does not exist") ||
        (msg.includes("relation") && msg.includes("does not exist"))
      ) {
        return NextResponse.json({
          history: [],
          migrationPending: true,
          message:
            "LoginHistory table not initialized. Run POST /api/db-init (or the latest Supabase migration) to enable login activity tracking.",
        });
      }
      throw new Error(msg);
    }

    const rows = (data || []).map((row) => {
      const { browser, os } = parseUserAgent(row.userAgent);
      return {
        id: row.id,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        browser,
        os,
        success: row.success === true,
        failureReason: row.failureReason ?? null,
        timestamp:
          row.timestamp instanceof Date
            ? row.timestamp.toISOString()
            : String(row.timestamp),
      };
    });

    return NextResponse.json({ history: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch login history" },
      { status: 500 }
    );
  }
}
