// POST /api/billing/webhook
// Stripe webhook receiver. PUBLIC (no JWT auth) — added to
// PUBLIC_ROUTES in middleware.ts. The route verifies the request
// body against STRIPE_WEBHOOK_SECRET before trusting it.
//
// CRITICAL: Stripe sends the raw body as the request payload, and the
// signature is computed over that EXACT byte sequence. We MUST read
// `req.text()` (not `req.json()`) and pass the raw string to
// `verifyWebhookSignature`. If Next.js ever re-encodes the body (e.g.
// by parsing + re-stringifying JSON), signature verification will
// silently break.
//
// Handled events (see handleWebhookEvent in src/lib/stripe.ts):
//   - checkout.session.completed       → create Subscription row
//   - customer.subscription.updated    → sync plan/status/periodEnd
//   - customer.subscription.deleted    → mark Subscription canceled
//
// Idempotency: Stripe retries events that don't return a 2xx within a
// few seconds, and may also redeliver events on its own. Our
// `upsertSubscriptionFromStripe` matches on userId / customerId /
// subscriptionId so replays are safe (idempotent).

import { NextResponse } from "next/server";
import { verifyWebhookSignature, handleWebhookEvent } from "@/lib/stripe";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stripe webhooks can be large (a single subscription event with
// expanded customer + latest_invoice can be 50KB+). Next.js 16's
// default body size limit is 4MB which is fine, but we set an
// explicit cap so a misbehaving Stripe (or attacker bypassing the
// signature check) can't OOM us.
export const maxDuration = 30;

export async function POST(req: Request) {
  // Read the RAW body — signature is computed over the exact bytes
  // Stripe sent. Using `req.text()` preserves them (Next.js does not
  // re-encode text bodies).
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  const verification = await verifyWebhookSignature(rawBody, signature);

  if (!verification.ok) {
    // Distinguish "webhook not configured" (return 200 so Stripe stops
    // retrying — we'll never accept these events anyway) from genuine
    // verification failures (return 400 so Stripe retries later).
    if (verification.reason === "webhook_not_configured") {
      logger.info("stripe webhook received but STRIPE_WEBHOOK_SECRET is not set; returning 200 to stop retries");
      return NextResponse.json(
        { received: true, action: "webhook_not_configured" },
        { status: 200 }
      );
    }

    logger.warn("stripe webhook signature verification failed", {
      meta: { reason: verification.reason },
    });
    return NextResponse.json(
      { error: "Webhook signature verification failed.", reason: verification.reason },
      { status: 400 }
    );
  }

  const event = verification.event!;
  logger.info("stripe webhook received", {
    meta: { type: event.type, id: event.id },
  });

  try {
    const result = await handleWebhookEvent(event);
    return NextResponse.json(
      { received: true, action: result.action, handled: result.handled },
      { status: 200 }
    );
  } catch (err) {
    // Returning a non-2xx makes Stripe retry. We do this on handler
    // errors (DB outages, etc.) so the event gets redelivered once
    // the underlying issue clears.
    logger.error("stripe webhook handler threw", {
      meta: {
        type: event.type,
        id: event.id,
        err: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
