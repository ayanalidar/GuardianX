// POST /api/billing/checkout
// Creates a Stripe Checkout Session for upgrading to a paid plan.
// Auth required. Returns { url } the client should redirect to.
//
// Body: { plan: "pro" | "enterprise" }
//
// When Stripe is not configured, returns a friendly 503 with a clear
// message — the UI shows the same hint so users know billing is
// disabled in this deployment.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/ownership";
import { withErrorHandler } from "@/lib/api-handler";
import {
  createCheckoutSession,
  isStripeConfigured,
  priceIdForPlan,
  type Plan,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured on this GuardianX instance. Set STRIPE_SECRET_KEY + STRIPE_PRICE_ID_PRO to enable subscriptions.",
        code: "BILLING_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan || "") as Plan;

  if (plan !== "pro" && plan !== "enterprise") {
    return NextResponse.json(
      { error: 'plan must be "pro" or "enterprise".' },
      { status: 400 }
    );
  }

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `No Stripe price ID configured for plan "${plan}". Set STRIPE_PRICE_ID_${plan.toUpperCase()} in your environment.`,
        code: "PRICE_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const session = await createCheckoutSession(user.userId, user.email, priceId);
  if (!session || !session.url) {
    return NextResponse.json(
      { error: "Failed to create Stripe Checkout session." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: session.url, id: session.id });
});
