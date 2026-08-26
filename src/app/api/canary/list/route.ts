import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── Cryptographic Canary Tokens, list all tokens + trigger status ──────────
// GET /api/canary/list
// Auth required.
//
// Returns every canary token in the table (most recent first), with its
// trigger status, source, and metadata. The actual token string is masked
// (first 18 + last 6 chars) — the UI reveals the full value on demand
// via the `revealed` flag. We surface the raw `token` so the UI can offer
// a "copy" action without a second round-trip.

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const tokens = await db.canaryToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      resourceType: true,
      resourceId: true,
      label: true,
      createdAt: true,
      triggeredAt: true,
      triggeredBy: true,
      triggerSource: true,
      isActive: true,
    },
  });

  const now = new Date();
  const items = tokens.map((t) => {
    const triggered = t.triggeredAt !== null;
    let status: "safe" | "triggered" | "inactive";
    if (triggered) status = "triggered";
    else if (!t.isActive) status = "inactive";
    else status = "safe";

    return {
      id: t.id,
      token: t.token,
      // Masked preview — first 18 chars (gx_canary_XXXXXXXX) + last 6
      tokenMasked: `${t.token.slice(0, 18)}…${t.token.slice(-6)}`,
      resourceType: t.resourceType,
      resourceId: t.resourceId,
      label: t.label,
      createdAt: t.createdAt.toISOString(),
      triggeredAt: t.triggeredAt ? t.triggeredAt.toISOString() : null,
      triggeredBy: t.triggeredBy,
      triggerSource: t.triggerSource,
      isActive: t.isActive,
      status,
      ageMs: now.getTime() - t.createdAt.getTime(),
    };
  });

  // Coverage heuristic: a token is "covering" sensitive data if it's
  // active and not triggered. We can't know the absolute denominator of
  // sensitive data without enumerating findings/credentials/client_data
  // — instead we surface the active-count vs total-count so the UI can
  // render a "coverage" tile (active / total).
  const total = items.length;
  const active = items.filter((i) => i.isActive).length;
  const triggered = items.filter((i) => i.status === "triggered").length;
  const safe = items.filter((i) => i.status === "safe").length;
  const coveragePct = total > 0 ? Math.round((active / total) * 100) : 0;

  // Recently-triggered canaries (last 7 days) — shown at the top of the UI
  // as an alert section.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentTriggers = items
    .filter((i) => i.triggeredAt && new Date(i.triggeredAt) >= sevenDaysAgo)
    .sort((a, b) => (a.triggeredAt! < b.triggeredAt! ? 1 : -1));

  return NextResponse.json({
    tokens: items,
    total,
    active,
    triggered,
    safe,
    coveragePct,
    recentTriggers,
  });
}
