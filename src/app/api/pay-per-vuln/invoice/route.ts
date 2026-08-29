import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/pay-per-vuln/invoice — generates a Stripe Checkout session for
// all "owed" FindingsLedger entries owned by the calling user, then marks
// those entries as "invoiced" so they can't be double-billed.
//
// The Stripe session is a one-time `payment` (NOT a subscription) whose
// amount is the sum of the owed entries in paise. The `client_reference_id`
// carries the userId so the webhook (when it lands) can flip the invoiced
// rows to `paid`.
//
// Auth: required.
//
// Body: (none — operates on the JWT's userId)
// Returns:
//   { stripeEnabled: true, url, sessionId, invoicedCount, totalPaise }
//   { stripeEnabled: false, message }  — when Stripe isn't configured
//   { owedCount: 0, message: "Nothing to invoice" } — when no owed rows
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({
      stripeEnabled: false,
      message:
        "Stripe is not configured on this GuardianX instance. Set STRIPE_SECRET_KEY to enable pay-per-vulnerability invoicing.",
    });
  }

  try {
    const owed = await db.findingsLedger.findMany({
      where: { userId: auth.user.userId, status: "owed" },
      orderBy: { createdAt: "asc" },
    });

    if (owed.length === 0) {
      return NextResponse.json({
        stripeEnabled: true,
        owedCount: 0,
        message: "Nothing to invoice — no owed findings.",
      });
    }

    const totalPaise = owed.reduce((sum, e) => sum + e.amount, 0);
    // Stripe minimum charge is ₹50 (≈ 5000 paise). Below that, return a
    // friendly message instead of erroring out on Stripe's end.
    if (totalPaise < 5000) {
      return NextResponse.json({
        stripeEnabled: true,
        owedCount: owed.length,
        totalPaise,
        message:
          `Total owed is ₹${(totalPaise / 100).toFixed(2)} — below Stripe's ₹50 minimum charge. ` +
          `Keep scanning; we'll invoice once you cross the threshold.`,
      });
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil" as never,
      appInfo: { name: "GuardianX", version: "1.0" },
    });

    const origin = req.headers.get("origin") || "https://guardianx.cloud";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: auth.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "inr",
            unit_amount: totalPaise,
            product_data: {
              name: "GuardianX — Pay-Per-Vulnerability Findings",
              description: `${owed.length} finding${owed.length === 1 ? "" : "s"} across ${new Set(owed.map((e) => e.severity)).size} severity levels.`,
            },
          },
        },
      ],
      client_reference_id: auth.user.userId,
      metadata: {
        userId: auth.user.userId,
        kind: "pay_per_vuln",
        owedIds: owed.map((e) => e.id).join(","),
        count: String(owed.length),
      },
      success_url: `${origin}/?billing=ppv-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=ppv-canceled`,
    });

    // Mark the rows as invoiced so they can't be folded into a second
    // checkout session. The webhook later flips them to `paid`.
    await db.findingsLedger.updateMany({
      where: {
        id: { in: owed.map((e) => e.id) },
      },
      data: {
        status: "invoiced",
        invoicedAt: new Date(),
      },
    });

    return NextResponse.json({
      stripeEnabled: true,
      url: session.url,
      sessionId: session.id,
      invoicedCount: owed.length,
      totalPaise,
    });
  } catch (err) {
    console.error("[pay-per-vuln/invoice] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
