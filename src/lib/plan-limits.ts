// GuardianX plan-limit enforcement (Task #7-billing).
//
// This is the gate that turns "the user is on the free plan" into
// "the user can't create their 2nd client". Every mutating endpoint
// that consumes a scarce resource (clients, scans) should call
// `checkPlanLimit(userId, action)` BEFORE doing the work and bail
// with a 402 Payment Required + a friendly upgrade hint if the gate
// returns `{ ok: false }`.
//
// DESIGN NOTES
// ────────────
//   • When Stripe is NOT configured (self-host / no billing),
//     `getPlanLimits` returns enterprise (unlimited), so this gate is
//     a no-op and the app behaves as before. No code path is blocked.
//
//   • We count usage against the user's CURRENT plan limit. If the
//     user downgrades from pro to free and already has 8 clients, we
//     DON'T retroactively delete clients — but they can't create new
//     ones until they're under the free limit (1).
//
//   • Scan counting is per-month (rolling 30 days), to match the
//     "maxScansPerMonth" limit. We count scans whose `startedAt` is
//     within the last 30 days. This is a slight approximation (a true
//     calendar-month count would reset on the 1st) but it's simpler,
//     matches how Stripe's "per month" pricing works, and is what
//     most users intuitively expect.
//
//   • Admins are NOT exempt — they're subject to the same plan limits
//     as everyone else. This is intentional: the admin is usually the
//     one paying for the subscription, and exempting them would make
//     the gate trivially bypassable. If you need unlimited for a
//     specific admin, give them the enterprise plan.
//
//   • "Past due" subscriptions still get their plan's limits for a
//     grace period (Stripe's own dunning cycle, typically 4-7 days).
//     We check `status === "canceled"` to decide if the user has
//     lost their plan; "past_due" still counts as "has the plan".

import { db } from "@/lib/db";
import { getPlanLimits, isStripeConfigured } from "@/lib/stripe";

export type PlanLimitAction = "create_client" | "run_scan";

export interface PlanLimitResult {
  ok: boolean;
  reason?: string;
  /** Current usage (only present when ok === false, for the UI). */
  usage?: {
    used: number;
    max: number;
    plan: string;
  };
}

// ── Subscription lookup ──────────────────────────────────────────────────

/**
 * Get the user's current plan. Returns "enterprise" (unlimited) when:
 *   - Stripe isn't configured, OR
 *   - The user has no Subscription row yet (treated as free, but with
 *     enterprise limits so self-host works), OR
 *   - The subscription is canceled (downgrade to free → enterprise
 *     limits because in no-billing mode there's no point gating).
 *
 * Wait, that last one's wrong. Let me re-think: if Stripe IS
 * configured and the user has a canceled subscription, they should
 * fall back to FREE limits, not enterprise. Only when Stripe isn't
 * configured at all do we default to enterprise.
 */
export async function getUserPlan(userId: string): Promise<{
  plan: string;
  status: string;
}> {
  // When Stripe isn't configured, everyone is enterprise.
  if (!isStripeConfigured()) {
    return { plan: "enterprise", status: "active" };
  }

  // Otherwise, look up the Subscription row.
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    if (!sub) {
      // Stripe IS configured but this user has never subscribed.
      // Default to free.
      return { plan: "free", status: "active" };
    }
    const s = sub as Record<string, unknown>;
    return {
      plan: (s.plan as string) || "free",
      status: (s.status as string) || "active",
    };
  } catch {
    // DB error — fail open (enterprise/unlimited) so a transient DB
    // outage doesn't lock users out of their own data.
    return { plan: "enterprise", status: "active" };
  }
}

// ── Usage counters ──────────────────────────────────────────────────────

/**
 * Count how many clients the user currently owns. Admins have no
 * `ownerId` filter so this returns the total count across the
 * platform (but admins are still subject to their own plan limit —
 * see DESIGN NOTES above).
 */
async function countUserClients(userId: string, userRole: string): Promise<number> {
  try {
    const where = userRole === "admin" ? {} : { ownerId: userId };
    return await db.client.count({ where });
  } catch {
    return 0; // fail open
  }
}

/**
 * Count how many scans the user has started in the last 30 days.
 * For admins this counts all scans (no ownership filter); for
 * viewers it counts only scans on codebases whose parent client
 * they own.
 *
 * Implementation note: we do this in two steps (clients → codebases →
 * scans) because the db proxy doesn't support joins. For users with
 * many clients this could be slow, but in practice the free plan
 * caps at 1 client and pro at 10, so the inner query is tiny.
 */
async function countUserScansThisMonth(
  userId: string,
  userRole: string
): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (userRole === "admin") {
      // Admins see all scans; filter by date only.
      return await db.scan.count({
        where: { startedAt: { gte: thirtyDaysAgo } },
      });
    }

    // Viewers: find their clients' codebases, then count scans on
    // those codebases from the last 30 days.
    const clients = await db.client.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const clientIds = clients.map(
      (c: Record<string, unknown>) => c.id as string
    );
    if (clientIds.length === 0) return 0;

    const codebases = await db.codebase.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    });
    const codebaseIds = codebases.map(
      (c: Record<string, unknown>) => c.id as string
    );
    if (codebaseIds.length === 0) return 0;

    return await db.scan.count({
      where: {
        codebaseId: { in: codebaseIds },
        startedAt: { gte: thirtyDaysAgo },
      },
    });
  } catch {
    return 0; // fail open
  }
}

// ── Public gate ─────────────────────────────────────────────────────────

/**
 * Check whether the user is allowed to perform a plan-limited action.
 * Returns `{ ok: true }` if the action is allowed, or
 * `{ ok: false, reason, usage }` with a friendly upgrade hint if the
 * user has hit their plan's limit.
 *
 * Callers should return a 402 Payment Required with the `reason`
 * field as the response body when this returns `{ ok: false }`.
 *
 * Usage:
 *   const limit = await checkPlanLimit(user.userId, "create_client");
 *   if (!limit.ok) {
 *     return NextResponse.json({ error: limit.reason }, { status: 402 });
 *   }
 */
export async function checkPlanLimit(
  userId: string,
  action: PlanLimitAction,
  userRole: string = "viewer"
): Promise<PlanLimitResult> {
  // When Stripe isn't configured, everything is allowed (no-op gate).
  // This is the critical "graceful no-op" requirement from the spec.
  if (!isStripeConfigured()) {
    return { ok: true };
  }

  const { plan, status } = await getUserPlan(userId);
  const limits = getPlanLimits(plan);

  // A canceled subscription downgrades the user to free limits.
  // (Past_due / trialing / active all keep their plan's limits.)
  const effectivePlan = status === "canceled" ? "free" : plan;
  const effectiveLimits = getPlanLimits(effectivePlan);

  switch (action) {
    case "create_client": {
      const used = await countUserClients(userId, userRole);
      const max = effectiveLimits.maxClients;
      if (used >= max) {
        return {
          ok: false,
          reason:
            effectivePlan === "free"
              ? "Plan limit reached. Upgrade to Pro for 10 clients."
              : `Plan limit reached (${used}/${max} clients used). Upgrade your plan for more clients.`,
          usage: { used, max, plan: effectivePlan },
        };
      }
      return { ok: true };
    }

    case "run_scan": {
      const used = await countUserScansThisMonth(userId, userRole);
      const max = effectiveLimits.maxScansPerMonth;
      if (used >= max) {
        return {
          ok: false,
          reason:
            effectivePlan === "free"
              ? "Plan limit reached. Upgrade to Pro for 100 scans/month."
              : `Plan limit reached (${used}/${max} scans this month). Upgrade your plan for more scans.`,
          usage: { used, max, plan: effectivePlan },
        };
      }
      return { ok: true };
    }

    default:
      // Unknown action — fail open (allow) to avoid breaking new
      // features that haven't been wired into the plan system yet.
      return { ok: true };
  }
}
