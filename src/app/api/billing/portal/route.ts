// POST /api/billing/portal
// Creates a Stripe Billing Portal session so the user can manage their
// subscription (update card, cancel, switch plans, download invoices).
// Auth required. Returns { url } the client should redirect to.
//
// When Stripe is not configured OR the user has no Stripe customer ID
// yet, returns a friendly error. The latter happens when a user tries
// to "manage subscription" before ever completing a checkout — point
// them at the upgrade flow instead.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { withErrorHandler } from "@/lib/api-handler";
import {
  createBillingPortalSession,
  isStripeConfigured,
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
          "Billing is not configured on this GuardianX instance.",
        code: "BILLING_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  // Look up the user's Stripe customer ID.
  const sub = await db.subscription.findUnique({
    where: { userId: user.userId },
  });
  const customerId = (sub as Record<string, unknown> | null)?.stripeCustomerId as
    | string
    | null;

  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "You don't have an active subscription to manage. Choose a plan to subscribe first.",
        code: "NO_SUBSCRIPTION",
      },
      { status: 404 }
    );
  }

  const session = await createBillingPortalSession(customerId);
  if (!session) {
    return NextResponse.json(
      { error: "Failed to create Stripe Billing Portal session." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: session.url, id: session.id });
});
