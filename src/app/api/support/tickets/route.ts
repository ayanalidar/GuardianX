// GET /api/support/tickets — list the caller's support tickets.
//
// Backs the SupportChat widget's history view. Returns tickets where
// `userId` matches the caller, newest first. Admins see ALL tickets (their
// triage queue), not just their own.
//
// Auth: required. Uses `requireAuth` (which also enforces the `approved`
// flag), so pending-approval accounts cannot read the ticket history.
//
// Response shape:
//   [
//     {
//       id, subject, message, status, priority, isAdmin,
//       created_at, updated_at
//     },
//     ...
//   ]
//
// Note: the `message` body is included so the chat panel can render the
// user's own past messages — but ONLY for tickets the caller owns (or all
// tickets, if the caller is an admin). Other users' tickets are never
// returned.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/support/tickets
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const isAdmin = auth.user.role === "admin";
    const where = isAdmin ? {} : { userId: auth.user.userId };

    const tickets = (await db.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100, // safety cap — the chat panel only renders the latest ~50
    })) as unknown as Record<string, unknown>[];

    return NextResponse.json(
      (tickets || []).map((t) => ({
        id: t.id,
        subject: t.subject,
        message: t.message,
        status: t.status,
        priority: t.priority,
        is_admin: t.isAdmin,
        created_at: (t.createdAt as Date).toISOString(),
        updated_at: (t.updatedAt as Date).toISOString(),
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tickets" },
      { status: 500 }
    );
  }
}
