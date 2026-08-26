// GET /api/billing/subscription
// Returns the current user's subscription status + plan limits + live
// usage counts (clients used / max, scans this month / max).
//
// Auth required. The response shape is consumed by the billing panel
// UI to render the "current plan" card and the usage bars.
//
// When Stripe is not configured, returns `configured: false` plus the
// enterprise plan limits so the UI can show "billing disabled —
// unlimited mode" instead of an error.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { withErrorHandler } from "@/lib/api-handler";
import { getPlanLimits, isStripeConfigured } from "@/lib/stripe";
import { getUserPlan } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 30-day rolling window for "scans this month" — matches the
// plan-limits middleware's counting logic exactly so the UI and the
// gate always agree.
const SCAN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function countClients(userId: string, isAdmin: boolean): Promise<number> {
  try {
    const where = isAdmin ? {} : { ownerId: userId };
    return await db.client.count({ where });
  } catch {
    return 0;
  }
}

async function countScansThisMonth(
  userId: string,
  isAdmin: boolean
): Promise<number> {
  try {
    const since = new Date(Date.now() - SCAN_WINDOW_MS);
    if (isAdmin) {
      return await db.scan.count({ where: { startedAt: { gte: since } } });
    }

    // Viewer: scope to their clients' codebases.
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
        startedAt: { gte: since },
      },
    });
  } catch {
    return 0;
  }
}

export const GET = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const isAdmin = user.role === "admin";

  // When Stripe isn't configured, return enterprise limits so the UI
  // shows "unlimited" rather than an error.
  if (!isStripeConfigured()) {
    const limits = getPlanLimits("enterprise");
    const [clientsUsed, scansUsed] = await Promise.all([
      countClients(user.userId, isAdmin),
      countScansThisMonth(user.userId, isAdmin),
    ]);
    return NextResponse.json({
      configured: false,
      plan: "enterprise",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      limits,
      usage: {
        clients: { used: clientsUsed, max: limits.maxClients },
        scans: { used: scansUsed, max: limits.maxScansPerMonth },
      },
    });
  }

  // Stripe IS configured — look up the user's subscription row.
  const sub = await db.subscription.findUnique({
    where: { userId: user.userId },
  });
  const s = (sub as Record<string, unknown> | null) || null;

  const { plan, status } = await getUserPlan(user.userId);
  // If the subscription is canceled, downgrade to free limits in the
  // UI (matches the plan-limits gate's behavior).
  const effectivePlan = status === "canceled" ? "free" : plan;
  const limits = getPlanLimits(effectivePlan);

  const [clientsUsed, scansUsed] = await Promise.all([
    countClients(user.userId, isAdmin),
    countScansThisMonth(user.userId, isAdmin),
  ]);

  return NextResponse.json({
    configured: true,
    plan: effectivePlan,
    status,
    stripeCustomerId: (s?.stripeCustomerId as string) || null,
    stripeSubscriptionId: (s?.stripeSubscriptionId as string) || null,
    currentPeriodEnd: s?.currentPeriodEnd
      ? (s.currentPeriodEnd as Date).toISOString()
      : null,
    limits,
    usage: {
      clients: { used: clientsUsed, max: limits.maxClients },
      scans: { used: scansUsed, max: limits.maxScansPerMonth },
    },
  });
});
