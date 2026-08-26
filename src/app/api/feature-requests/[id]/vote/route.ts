// POST /api/feature-requests/[id]/vote — upvote a feature request.
//
// Backs the upvote button on /feature-requests. Each IP gets exactly one
// vote per request — the dedupe ledger is the `voterIPs` JSON array on the
// FeatureRequest row. Repeated votes from the same IP return 200 with
// `already_voted: true` (idempotent — the upvote count does not change).
//
// Auth: required (same as the rest of the feature-request flow). The IP
// dedupe is the primary anti-abuse layer; the auth gate is the secondary
// layer (a logged-out visitor cannot vote at all).
//
// Caveat: on serverless each instance has its own state for the rate-limit
// store, but the `voterIPs` array on the row IS the durable source of truth
// — it survives across instances because it's in the DB. So duplicate votes
// from the same IP ARE correctly deduped across instances; only the
// rate-limiter's `submit` throttle is per-instance.
//
// Response shape:
//   { id, upvotes, voted: true, already_voted: false }
// or on a duplicate vote:
//   { id, upvotes, voted: true, already_voted: true }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getClientIP } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function parseVoterIPs(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// POST /api/feature-requests/[id]/vote
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const existing = (await db.featureRequest.findUnique({
      where: { id },
    })) as Record<string, unknown> | null;

    if (!existing) {
      return NextResponse.json(
        { error: "Feature request not found" },
        { status: 404 }
      );
    }

    const ip = getClientIP(req);
    // Fall back to a user-scoped key when the IP is unknown (e.g. local dev
    // without proxy headers) so the dedupe still works per-user.
    const voterKey = ip === "unknown" ? `user:${auth.user.userId}` : ip;
    const voters = parseVoterIPs(existing.voterIPs);

    if (voters.includes(voterKey)) {
      // Idempotent: same IP/user has already voted. Return the current
      // count without incrementing.
      return NextResponse.json({
        id: existing.id,
        upvotes: existing.upvotes,
        voted: true,
        already_voted: true,
      });
    }

    // Append the voter to the ledger + bump the denormalized count.
    const newVoters = JSON.stringify([...voters, voterKey]);
    const updated = (await db.featureRequest.update({
      where: { id },
      data: {
        upvotes: (existing.upvotes as number) + 1,
        voterIPs: newVoters,
      },
    })) as Record<string, unknown>;

    return NextResponse.json({
      id: updated.id,
      upvotes: updated.upvotes,
      voted: true,
      already_voted: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to vote" },
      { status: 500 }
    );
  }
}
