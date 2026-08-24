import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/billing/portal — open the Stripe Customer Portal so the user can
// manage their card, switch plans, or cancel. Returns { url } or
// { stripeEnabled: false, message } when Stripe is not configured.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({
      stripeEnabled: false,
      message:
        "Stripe is not configured. Set STRIPE_SECRET_KEY to enable subscription management.",
    });
  }

  // Look up the cached Stripe customer ID.
  let customerId: string | null = null;
  try {
    const sub = await db.subscription.findUnique({
      where: { userId: user.userId },
    });
    customerId = (sub?.stripeCustomerId as string) ?? null;
  } catch {
    /* ignore */
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil" as never,
      appInfo: { name: "GuardianX", version: "1.0" },
    });

    if (!customerId) {
      // No customer record yet — fall back to a billing-only portal session
      // keyed by email so Stripe can match them.
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        return NextResponse.json({
          stripeEnabled: true,
          message:
            "You don't have a Stripe customer record yet. Subscribe to a plan first.",
        });
      }
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://guardianx.cloud";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/?billing=portal`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Stripe portal failed",
      },
      { status: 500 }
    );
  }
}
