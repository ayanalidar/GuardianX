// GuardianX Stripe billing library (Task #7-billing).
//
// DESIGN GOALS
// ────────────
//   1. OPTIONAL — if `STRIPE_SECRET_KEY` is not set, every export here
//      gracefully degrades. `isStripeConfigured()` returns false, the
//      billing API routes return a friendly "billing not configured"
//      error, and `getPlanLimits()` returns the enterprise plan
//      (unlimited) so the rest of the app keeps working in "no billing"
//      mode. This is critical: the platform must be fully functional
//      for self-hosters who don't want to charge for it.
//
//   2. SINGLE SOURCE OF TRUTH for plan limits — `getPlanLimits(plan)`
//      is the ONLY place where free/pro/enterprise quotas are defined.
//      The plan-limits middleware (`src/lib/plan-limits.ts`) and the
//      billing UI (`billing-panel.tsx`) both import it, so changing a
//      quota here updates both the gate and the displayed usage.
//
//   3. RAW REST, NOT the Stripe SDK — we use `fetch` against
//      https://api.stripe.com/v1/... directly. This keeps the bundle
//      tiny (no extra Node polyfills needed for Edge compatibility)
//      and makes it trivial to mock in tests. The trade-off is that
//      we have to URL-encode params ourselves (Stripe's REST API does
//      NOT accept JSON for the v1 form-encoded endpoints).
//
//   4. WEBHOOK SIGNATURE VERIFICATION — done manually with
//      the Web Crypto API's HMAC-SHA256 against the raw request body.
//      The Stripe-Signature header has the shape `t=TS,v1=HEX`. We
//      re-compute HMAC-SHA256(`${TS}.${rawBody}`) with
//      `STRIPE_WEBHOOK_SECRET` and compare in constant time. A 5-min
//      tolerance window blocks replay attacks.

import { hmacSha256hex, timingSafeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ── Configuration ───────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_ID_PRO = process.env.STRIPE_PRICE_ID_PRO || "";
const STRIPE_PRICE_ID_ENTERPRISE = process.env.STRIPE_PRICE_ID_ENTERPRISE || "";

// Public-facing base URL of the app, used to build success/cancel URLs
// for Checkout. Defaults to localhost for dev. MUST be set to the real
// origin in production via NEXT_PUBLIC_APP_URL or APP_URL.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:3000");

// Stripe API base — use STRIPE_API_BASE to override (e.g. for tests).
const STRIPE_API_BASE = process.env.STRIPE_API_BASE || "https://api.stripe.com";

// 5-minute tolerance for webhook timestamps (Stripe's own recommendation).
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

// ── Public types ────────────────────────────────────────────────────────
export type Plan = "free" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export interface PlanLimits {
  maxClients: number;
  maxScansPerMonth: number;
  features: string[];
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

export interface StripeBillingPortalSession {
  id: string;
  url: string;
}

// ── Configuration check ─────────────────────────────────────────────────
/**
 * Returns true if Stripe billing is configured (i.e. STRIPE_SECRET_KEY
 * is set). When this returns false, all billing API routes should
 * return a friendly error and the rest of the app should default to
 * the enterprise plan (unlimited).
 */
export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

/**
 * Returns true if the webhook signature verification secret is set.
 * Used by the webhook route to distinguish "no webhook configured"
 * (return 200 to stop Stripe retrying) from "webhook configured but
 * signature invalid" (return 400).
 */
export function isStripeWebhookConfigured(): boolean {
  return STRIPE_WEBHOOK_SECRET.length > 0;
}

// ── Plan limits (single source of truth) ────────────────────────────────
const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxClients: 1,
    maxScansPerMonth: 5,
    features: ["SAST", "basic_reports"],
  },
  pro: {
    maxClients: 10,
    maxScansPerMonth: 100,
    features: ["SAST", "DAST", "AI_remediation", "full_reports", "webhooks"],
  },
  enterprise: {
    maxClients: Infinity,
    maxScansPerMonth: Infinity,
    features: ["all"],
  },
};

/**
 * Get the limits for a given plan. Falls back to `enterprise`
 * (unlimited) when:
 *   - Stripe is not configured (so self-hosters have no quota gates), OR
 *   - the plan string is unknown (defensive: treat unknowns as
 *     unlimited rather than locking users out).
 */
export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  // When Stripe isn't configured, the whole billing system is a no-op —
  // every user effectively has the enterprise plan.
  if (!isStripeConfigured()) return PLAN_LIMITS.enterprise;

  if (plan && plan in PLAN_LIMITS) {
    return PLAN_LIMITS[plan as Plan];
  }
  return PLAN_LIMITS.enterprise;
}

/**
 * Map a Stripe price ID to our internal plan name. Used by the webhook
 * handler when a subscription is created/updated to figure out which
 * plan the user just subscribed to. Returns "free" if the price ID
 * doesn't match any known plan (defensive — leaves the user on free
 * rather than guessing).
 */
export function planFromPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "free";
  if (priceId === STRIPE_PRICE_ID_PRO) return "pro";
  if (priceId === STRIPE_PRICE_ID_ENTERPRISE) return "enterprise";
  return "free";
}

/**
 * Map an internal plan name to its configured Stripe price ID. Returns
 * the empty string if the plan has no associated price (free) or the
 * env var isn't set.
 */
export function priceIdForPlan(plan: Plan): string {
  if (plan === "pro") return STRIPE_PRICE_ID_PRO;
  if (plan === "enterprise") return STRIPE_PRICE_ID_ENTERPRISE;
  return ""; // free has no Stripe price
}

// ── Stripe REST helper ──────────────────────────────────────────────────
//
// Stripe's v1 REST endpoints use `application/x-www-form-urlencoded`
// bodies (NOT JSON), even for nested params. Nested values are encoded
// with bracket notation: `line_items[0][price]=price_abc`. We accept a
// flat-or-nested object and produce the correct form-encoded string.

type StripeParams = Record<string, unknown>;

function encodeStripeParam(key: string, value: unknown, parts: string[]) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      encodeStripeParam(`${key}[${i}]`, value[i], parts);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      encodeStripeParam(`${key}[${k}]`, v, parts);
    }
    return;
  }
  // Primitives: booleans → "true"/"false", everything else → String().
  const str = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(str)}`);
}

function buildFormBody(params: StripeParams): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    encodeStripeParam(k, v, parts);
  }
  return parts.join("&");
}

interface StripeRequestOptions {
  method: "GET" | "POST";
  path: string; // e.g. "/v1/checkout/sessions"
  params?: StripeParams; // form-encoded for POST, query-string for GET
}

/**
 * Low-level Stripe REST call. Throws on network errors or non-2xx
 * responses (the caller's try/catch turns these into 500s). Returns
 * the parsed JSON body for successful responses.
 *
 * NOTE: NEVER log the response body — it can contain customer email
 * addresses, subscription IDs, and other PII. We log only the path +
 * status code.
 */
async function stripeRequest<T = unknown>(opts: StripeRequestOptions): Promise<T> {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_SECRET_KEY is not set — billing is disabled.");
  }

  let url = `${STRIPE_API_BASE}${opts.path}`;
  if (opts.method === "GET" && opts.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) {
      if (v === undefined || v === null) continue;
      qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    url += `?${qs.toString()}`;
  }

  const init: RequestInit = {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe wants a User-Agent; we set one so our requests show up
      // cleanly in the dashboard's API logs.
      "User-Agent": "GuardianX-Billing/1.0 (https://guardianx.in)",
    },
  };
  if (opts.method === "POST" && opts.params) {
    init.body = buildFormBody(opts.params);
  }

  const resp = await fetch(url, init);
  const text = await resp.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!resp.ok) {
    const errMsg =
      (body as { error?: { message?: string } })?.error?.message ||
      `Stripe ${opts.method} ${opts.path} failed with ${resp.status}`;
    logger.warn("stripe API error", {
      meta: { path: opts.path, status: resp.status, message: errMsg },
    });
    throw new Error(errMsg);
  }

  return body as T;
}

// ── Checkout Sessions ───────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for upgrading to a paid plan.
 *
 * The session is configured as `subscription` mode (recurring billing).
 * The user's `userId` + `email` are passed as `client_reference_id` and
 * `customer_email` so the webhook can find the right Subscription row
 * when the checkout completes.
 *
 * Returns the session URL the client should redirect to. Returns null
 * (and logs) if Stripe isn't configured — the caller decides how to
 * surface that to the user.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string
): Promise<StripeCheckoutSession | null> {
  if (!isStripeConfigured()) return null;
  if (!priceId) {
    throw new Error(
      "Price ID is required. Set STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_ENTERPRISE in your env."
    );
  }

  const params: StripeParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    customer_email: email,
    // After success, send the user back to the dashboard billing tab.
    // The Billing tab will then re-fetch the subscription and show the
    // upgraded plan.
    success_url: `${APP_URL}/?billing=success`,
    cancel_url: `${APP_URL}/?billing=cancelled`,
    // Ask Stripe to send the full subscription object on the
    // checkout.session.completed event so we can populate the
    // Subscription row without an extra API call.
    subscription_data: { metadata: { userId, email } },
  };

  const session = await stripeRequest<{ id: string; url: string | null }>({
    method: "POST",
    path: "/v1/checkout/sessions",
    params,
  });

  return { id: session.id, url: session.url };
}

// ── Billing Portal Sessions ─────────────────────────────────────────────

/**
 * Create a Stripe Billing Portal session so the user can manage their
 * subscription (update card, cancel, switch plans, download invoices)
 * without us having to build all that UI ourselves.
 *
 * Requires the user's Stripe customer ID (saved on the Subscription
 * row when their first checkout completed).
 */
export async function createBillingPortalSession(
  customerId: string
): Promise<StripeBillingPortalSession | null> {
  if (!isStripeConfigured()) return null;
  if (!customerId) {
    throw new Error("customerId is required to create a billing portal session.");
  }

  const params: StripeParams = {
    customer: customerId,
    return_url: `${APP_URL}/?billing=portal`,
  };

  const session = await stripeRequest<{ id: string; url: string }>({
    method: "POST",
    path: "/v1/billing_portal/sessions",
    params,
  });

  return { id: session.id, url: session.url };
}

// ── Webhook signature verification ──────────────────────────────────────
//
// Stripe signs every webhook with HMAC-SHA256 using the webhook
// signing secret. The Stripe-Signature header has the form:
//
//     t=1700000000,v1=abcdef0123456789...,v0=...
//
// We extract `t` (the timestamp) and `v1` (the current signature),
// re-compute HMAC-SHA256(`${t}.${rawBody}`) with our secret, and
// compare. A 5-minute tolerance window blocks replays.

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

interface WebhookVerifyResult {
  ok: boolean;
  event?: StripeWebhookEvent;
  reason?: string;
}

/**
 * Verify the Stripe-Signature header against the raw request body and
 * return the parsed event. Returns `{ ok: false, reason }` on any
 * verification failure — the webhook route turns that into a 400.
 *
 * When `STRIPE_WEBHOOK_SECRET` is NOT set, we return `{ ok: false,
 * reason: "webhook_not_configured" }`. The route handler treats this
 * as a 200 (to stop Stripe from retrying) because there's no point
 * retrying an endpoint that will never accept the event.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string
): Promise<WebhookVerifyResult> {
  if (!isStripeWebhookConfigured()) {
    return { ok: false, reason: "webhook_not_configured" };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "missing_signature_header" };
  }

  // Parse the header into a map of { t, v1, v0, ... }.
  const parts = signatureHeader.split(",");
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx > 0) kv[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
  }
  const timestamp = kv.t;
  const v1 = kv.v1;
  if (!timestamp || !v1) {
    return { ok: false, reason: "malformed_signature_header" };
  }

  // Reject stale timestamps to prevent replay attacks.
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }

  // Compute the expected signature.
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await hmacSha256hex(STRIPE_WEBHOOK_SECRET, signedPayload);

  // Constant-time comparison to avoid timing-side-channel attacks.
  // Both must be the same length for timingSafeEqual.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  // Signature is valid — parse the event body.
  try {
    const event = JSON.parse(rawBody) as StripeWebhookEvent;
    return { ok: true, event };
  } catch {
    return { ok: false, reason: "invalid_json_body" };
  }
}

// ── Webhook event handling ──────────────────────────────────────────────

/**
 * Pull the user-facing fields we care about out of a Stripe
 * `subscription` object. Stripe's shape is sprawling; we only need a
 * handful of fields to keep our Subscription row in sync.
 */
function extractSubscriptionFields(sub: Record<string, unknown>): {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  plan: Plan;
  currentPeriodEnd: Date | null;
} {
  const stripeSubscriptionId = (sub.id as string) || "";
  const customer = (sub.customer as string) || null;
  const rawStatus = (sub.status as string) || "active";

  // Map Stripe's subscription statuses to our 4-state enum.
  // Stripe has more states (incomplete, incomplete_expired, unpaid,
  // paused) but we collapse them into our schema's 4 buckets.
  let status: SubscriptionStatus;
  switch (rawStatus) {
    case "active":
      status = "active";
      break;
    case "trialing":
      status = "trialing";
      break;
    case "past_due":
    case "unpaid":
    case "incomplete":
      status = "past_due";
      break;
    case "canceled":
    case "incomplete_expired":
      status = "canceled";
      break;
    default:
      status = "active";
  }

  // Determine the plan from the first item's price ID.
  let plan: Plan = "free";
  const items = sub.items as
    | { data?: Array<{ price?: { id?: string } }> }
    | undefined;
  const firstPriceId = items?.data?.[0]?.price?.id;
  if (firstPriceId) {
    plan = planFromPriceId(firstPriceId);
  }

  // current_period_end is a Unix timestamp (seconds).
  const cpe = sub.current_period_end as number | undefined;
  const currentPeriodEnd = cpe ? new Date(cpe * 1000) : null;

  return {
    stripeCustomerId: customer,
    stripeSubscriptionId,
    status,
    plan,
    currentPeriodEnd,
  };
}

/**
 * Upsert a Subscription row from a Stripe subscription object. We
 * match on `userId` (from the subscription's metadata) or fall back to
 * `stripeCustomerId` (if the user already has a customer ID from a
 * previous checkout).
 *
 * The order of preference:
 *   1. metadata.userId (set on checkout by client_reference_id /
 *      subscription_data.metadata.userId)
 *   2. Look up by stripeCustomerId (handles webhook events arriving
 *      before the checkout.session.completed event)
 *   3. Look up by stripeSubscriptionId (idempotency on replays)
 */
async function upsertSubscriptionFromStripe(
  sub: Record<string, unknown>
): Promise<{ userId: string | null; updated: boolean }> {
  const fields = extractSubscriptionFields(sub);

  // 1. Try metadata.userId (set by createCheckoutSession).
  const metadata = (sub.metadata as { userId?: string } | undefined) || {};
  let userId: string | null = metadata.userId || null;

  // 2. If no userId in metadata, try to find by stripeCustomerId.
  if (!userId && fields.stripeCustomerId) {
    const existing = await db.subscription.findFirst({
      where: { stripeCustomerId: fields.stripeCustomerId },
    });
    if (existing) {
      userId = (existing as Record<string, unknown>).userId as string;
    }
  }

  // 3. If still no userId, try by stripeSubscriptionId (replay protection).
  if (!userId && fields.stripeSubscriptionId) {
    const existing = await db.subscription.findFirst({
      where: { stripeSubscriptionId: fields.stripeSubscriptionId },
    });
    if (existing) {
      userId = (existing as Record<string, unknown>).userId as string;
    }
  }

  if (!userId) {
    // We can't link this event to any user — drop it. This happens for
    // subscriptions created directly in the Stripe dashboard without
    // going through our checkout flow. Log so the operator notices.
    logger.warn("stripe webhook: no userId for subscription", {
      meta: {
        subId: fields.stripeSubscriptionId,
        customerId: fields.stripeCustomerId,
      },
    });
    return { userId: null, updated: false };
  }

  // Upsert the Subscription row.
  const data = {
    userId,
    stripeCustomerId: fields.stripeCustomerId,
    stripeSubscriptionId: fields.stripeSubscriptionId,
    plan: fields.plan,
    status: fields.status,
    currentPeriodEnd: fields.currentPeriodEnd,
  };

  // Try to update first (cheap path for the common case where the row
  // already exists). If no row matches, fall back to create.
  const existing = await db.subscription.findUnique({ where: { userId } });
  if (existing) {
    await db.subscription.update({ where: { userId }, data });
  } else {
    await db.subscription.create({ data });
  }

  return { userId, updated: true };
}

/**
 * Handle a verified Stripe webhook event. Routes by `event.type` and
 * updates the Subscription table accordingly. Returns a short label
 * describing what was done (used for logging + the 200 response body).
 *
 * Supported events:
 *   - checkout.session.completed  → create the Subscription row (or
 *     upgrade it) from the embedded subscription object
 *   - customer.subscription.updated → sync plan/status/periodEnd
 *   - customer.subscription.deleted → mark the Subscription canceled
 *     (keep the row for history; the user is back on free)
 */
export async function handleWebhookEvent(
  event: StripeWebhookEvent
): Promise<{ handled: boolean; action: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      // The session object doesn't have subscription details; we need
      // to fetch the subscription from Stripe OR rely on the
      // `subscription` field (which is just the ID). For simplicity,
      // we mark the user as "pro" (or whatever plan the price maps to)
      // by reading the line_items from the session. The session object
      // includes the subscription ID — the next
      // `customer.subscription.updated` event will fully populate the
      // row. For now, we just stash the customer + subscription IDs.
      const session = event.data.object;
      const userId = (session.client_reference_id as string) || null;
      const customerId = (session.customer as string) || null;
      const subscriptionId = (session.subscription as string) || null;

      if (!userId) {
        logger.warn("stripe webhook: checkout.session.completed without client_reference_id", {
          meta: { sessionId: session.id, customerId },
        });
        return { handled: false, action: "no_user_id" };
      }

      // Build a minimal subscription-shaped object so the upsert path
      // works for both events. The status will be corrected by the
      // next customer.subscription.updated event (Stripe fires both
      // on checkout completion).
      await upsertSubscriptionFromStripe({
        id: subscriptionId,
        customer: customerId,
        status: "active",
        current_period_end: null,
        items: { data: [] },
        metadata: { userId },
      });

      return { handled: true, action: "checkout_completed" };
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const result = await upsertSubscriptionFromStripe(sub);
      if (!result.updated) {
        return { handled: false, action: "subscription_no_user" };
      }
      return { handled: true, action: "subscription_updated" };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const result = await upsertSubscriptionFromStripe({
        ...sub,
        status: "canceled",
      });
      if (!result.updated) {
        return { handled: false, action: "delete_no_user" };
      }
      return { handled: true, action: "subscription_deleted" };
    }

    default:
      // We don't care about other event types — Stripe sends many
      // (invoice.paid, charge.refunded, etc.) that we don't need to act
      // on. Acknowledge with 200 so Stripe doesn't retry.
      return { handled: false, action: `ignored:${event.type}` };
  }
}
