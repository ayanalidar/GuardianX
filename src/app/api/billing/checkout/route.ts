import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/billing/checkout — create a Stripe Checkout session for a plan upgrade
// Body: { plan: "pro" | "enterprise" }
// Returns: { url } to redirect the browser to Stripe Checkout, or
//           { stripeEnabled: false, message } when Stripe is not configured.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan || "").toLowerCase();
  if (!["pro", "enterprise"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({
      stripeEnabled: false,
      message:
        "Stripe is not configured on this GuardianX instance. Set STRIPE_SECRET_KEY + STRIPE_PRICE_PRO to enable paid plans.",
    });
  }

  const priceId =
    plan === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_ENTERPRISE;
  if (!priceId) {
    return NextResponse.json({
      stripeEnabled: false,
      message: `No Stripe price configured for plan "${plan}".`,
    });
  }

  // Ensure a Subscription row exists so the webhook has something to update.
  try {
    const existing = await db.subscription.findUnique({
      where: { userId: user.userId },
    });
    if (!existing) {
      await db.subscription.create({
        data: { userId: user.userId, plan: "free", status: "active" },
      });
    }
  } catch {
    /* ignore — webhook can still upsert */
  }

  try {
    // Lazy-load Stripe so the route doesn't crash at import time when
    // the env var isn't set (the dev sandbox usually has no Stripe keys).
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil" as never,
      appInfo: { name: "GuardianX", version: "1.0" },
    });

    const origin = req.headers.get("origin") || "https://guardianx.cloud";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.userId,
      metadata: { userId: user.userId, plan },
      success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=canceled`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Stripe checkout failed",
      },
      { status: 500 }
    );
  }
}
