# GuardianX Billing Setup (Stripe)

This document explains how to enable Stripe subscription billing in your
GuardianX deployment. **Billing is optional** — if `STRIPE_SECRET_KEY`
is not set, the platform runs in "no-billing" mode with unlimited
enterprise limits, so all features keep working for self-hosters.

---

## 1. Create Stripe products + prices

You need **two** recurring prices in Stripe (Pro and Enterprise). The
Free plan has no Stripe price — users default to Free until they
complete a checkout.

### In the Stripe Dashboard

1. Go to **Products** → **Add product**.
2. Create the **Pro** product:
   - **Name**: `GuardianX Pro`
   - **Pricing**: `Recurring`, `₹2,000` / `month` (INR), per-unit.
   - Save and copy the `price_...` ID from the price's details page.
3. Create the **Enterprise** product:
   - **Name**: `GuardianX Enterprise`
   - **Pricing**: `Recurring`, `₹99,999` / `month` (INR), per-unit
     (or use a custom-quote workflow — the dashboard's "Contact Sales"
     button opens a `mailto:` link instead of Stripe Checkout).
   - Save and copy its `price_...` ID.

> Use **INR** for Indian customers. If you target global customers,
> create a separate USD price and switch the env var.

### Verify the price IDs

Both should look like `price_1Q8Xy...` (test mode) or `price_1Q8Xy...`
(live mode). Test prices start with `price_...` in test mode and are
visually marked "Test" in the dashboard.

---

## 2. Set environment variables

Add these to your `.env` (or `.env.local` for dev):

```bash
# Required — without this, billing is disabled and all limits are
# unlimited (enterprise mode).
STRIPE_SECRET_KEY=sk_test_...

# Required for webhook signature verification. Generate with the
# Stripe CLI (see section 4) or copy from the Stripe Dashboard.
STRIPE_WEBHOOK_SECRET=whsec_...

# Map our plan names to your Stripe price IDs.
STRIPE_PRICE_ID_PRO=price_1Q8Xy...
STRIPE_PRICE_ID_ENTERPRISE=price_1Q8Xz...

# Optional — the public URL of your deployment. Used to build
# success/cancel URLs for Stripe Checkout. Defaults to
# http://localhost:3000 in dev. MUST be set in production.
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### What happens if a variable is missing?

| Variable                       | If missing                                                                |
| ------------------------------ | ------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`            | Billing fully disabled. UI shows "billing disabled" banner; limits are unlimited. |
| `STRIPE_WEBHOOK_SECRET`        | Webhook route returns 200 + `webhook_not_configured` (Stripe stops retrying). No subscription updates will be processed. |
| `STRIPE_PRICE_ID_PRO`          | Checkout for Pro plan returns 503 with `PRICE_NOT_CONFIGURED`.           |
| `STRIPE_PRICE_ID_ENTERPRISE`   | Same as above for Enterprise.                                            |
| `NEXT_PUBLIC_APP_URL`          | Stripe redirects back to `localhost:3000` (or empty in prod). Set this!   |

---

## 3. Set up the webhook endpoint

### In the Stripe Dashboard

1. Go to **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: `https://your-domain.com/api/billing/webhook`
3. **Events to send** (select each):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**.
5. On the endpoint's detail page, click **Reveal** under **Signing
   secret** and copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

### Why these three events?

| Event                                | What GuardianX does with it                                              |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `checkout.session.completed`         | Creates the Subscription row, stashing the Stripe customer + subscription IDs. |
| `customer.subscription.updated`      | Syncs plan (free/pro/enterprise), status, and `currentPeriodEnd` from Stripe. |
| `customer.subscription.deleted`      | Marks the Subscription as `canceled`. The user reverts to Free limits.   |

> Other events (`invoice.paid`, `charge.refunded`, etc.) are
> acknowledged with 200 + `ignored:<type>` and not acted on.

---

## 4. Testing with Stripe CLI

The Stripe CLI lets you forward webhooks from your test-mode Stripe
account to your local GuardianX dev server.

### Install

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux (Ubuntu/Debian)
# See https://github.com/stripe/stripe-cli/releases for the .deb

# Windows (scoop)
scoop install stripe
```

### Authenticate

```bash
stripe login
```

This opens a browser window to authenticate the CLI with your Stripe
account.

### Forward webhooks to your dev server

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

This prints a `whsec_...` signing secret — copy it into
`STRIPE_WEBHOOK_SECRET` in your `.env.local`, then restart your dev
server.

> Keep the `stripe listen` process running in a separate terminal —
> it's what actually delivers webhook events to your local machine.

### Trigger test events

```bash
# Trigger a checkout completion (creates a Subscription row).
stripe trigger checkout.session.completed

# Trigger a subscription update.
stripe trigger customer.subscription.updated

# Trigger a subscription cancellation.
stripe trigger customer.subscription.deleted
```

### End-to-end test with a test card

1. Start your dev server (`bun run dev`).
2. Sign in to the dashboard, go to the **Billing** tab (admin only).
3. Click **Upgrade to Pro**.
4. Stripe Checkout opens in test mode — use the test card
   `4242 4242 4242 4242`, any future expiry, any CVC.
5. After successful checkout, you'll be redirected back to the
   dashboard. The Billing tab should now show "Current Plan: Pro".
6. In your `stripe listen` terminal, you'll see the
   `checkout.session.completed` and `customer.subscription.updated`
   events being delivered.

### Other useful test cards

| Card number           | Behavior                                  |
| --------------------- | ----------------------------------------- |
| `4242 4242 4242 4242` | Succeeds (Visa).                          |
| `4000 0027 6000 3184` | Requires 3D Secure authentication.        |
| `4000 0000 0000 9995` | Declines (insufficient funds).            |
| `4000 0000 0000 0069` | Declines (do not honor).                  |

See <https://stripe.com/docs/testing> for the full list.

---

## 5. Plan limits (reference)

| Plan        | Max clients | Max scans / month | Features                                                    |
| ----------- | ----------- | ----------------- | ----------------------------------------------------------- |
| Free        | 1           | 5                 | SAST, basic_reports                                         |
| Pro         | 10          | 100               | SAST, DAST, AI_remediation, full_reports, webhooks          |
| Enterprise  | ∞           | ∞                 | all                                                         |

These are defined in `src/lib/stripe.ts` (`PLAN_LIMITS` constant) —
that's the single source of truth used by both the plan-limits gate
(`src/lib/plan-limits.ts`) and the billing UI
(`src/components/sentinel/billing-panel.tsx`).

To change a limit, edit `PLAN_LIMITS` and restart the server. No DB
migration needed — the limit is read at request time, not stored.

---

## 6. Going live

1. Replace `sk_test_...` with `sk_live_...` in `STRIPE_SECRET_KEY`.
2. Replace the test `price_...` IDs with live ones in
   `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE`.
3. Update the webhook endpoint's signing secret to the **live** one
   (`STRIPE_WEBHOOK_SECRET`).
4. In the Stripe Dashboard, ensure your webhook endpoint is set to
   "Live mode" (not "Test mode").
5. Restart your server.

> **Never commit live keys to git.** Use your hosting platform's
> environment variables UI (Vercel, Railway, etc.) or a secrets
> manager like Doppler / Vault.

---

## 7. API reference

| Endpoint                              | Method | Auth           | Purpose                                                      |
| ------------------------------------- | ------ | -------------- | ------------------------------------------------------------ |
| `/api/billing/checkout`               | POST   | JWT            | Create a Stripe Checkout Session. Body: `{ plan: "pro" \| "enterprise" }`. Returns `{ url }`. |
| `/api/billing/portal`                 | POST   | JWT            | Create a Stripe Billing Portal session. Returns `{ url }`.   |
| `/api/billing/subscription`           | GET    | JWT            | Get current plan + limits + usage. Returns `SubscriptionResponse`. |
| `/api/billing/webhook`                | POST   | Stripe signature | Receive Stripe events. PUBLIC (no JWT).                       |

### Plan-limits gate

`src/lib/plan-limits.ts` exports `checkPlanLimit(userId, action,
userRole)` — call it before any resource-consuming mutation:

```ts
import { checkPlanLimit } from "@/lib/plan-limits";

const limit = await checkPlanLimit(user.userId, "create_client", user.role);
if (!limit.ok) {
  return NextResponse.json(
    { error: limit.reason, code: "PLAN_LIMIT_EXCEEDED", usage: limit.usage },
    { status: 402 }
  );
}
```

Valid actions: `"create_client"`, `"run_scan"`. The gate is a **no-op**
(returns `{ ok: true }`) when Stripe isn't configured.

Already wired in:
- `POST /api/clients` → `create_client`
- `POST /api/scans` → `run_scan`

---

## 8. Troubleshooting

### "Billing is not configured on this GuardianX instance"

`STRIPE_SECRET_KEY` is not set. Add it to your env and restart.

### Webhook returns 400 with `signature_mismatch`

`STRIPE_WEBHOOK_SECRET` doesn't match the signing secret Stripe is
using. Make sure you're using the secret from the **same endpoint**
that's actually receiving the events (test vs. live, dashboard vs.
CLI).

### Webhook returns 200 with `webhook_not_configured`

`STRIPE_WEBHOOK_SECRET` is not set at all. Stripe will stop retrying
this endpoint — that's intentional (no point retrying an endpoint that
will never accept events). Set the env var and restart.

### Upgraded but plan still shows "Free"

The webhook likely hasn't been delivered yet. Check:
1. Your `stripe listen` process is running (for local dev).
2. The webhook endpoint URL is reachable from Stripe (for production):
   `curl -X POST https://your-domain.com/api/billing/webhook` should
   return a 400 with `missing_signature_header` (not a connection error).
3. The user's `userId` was passed as `client_reference_id` in the
   checkout session (look at the Stripe Dashboard's event log to verify).

### Free plan user can't create their 2nd client

That's the intended behavior — Free plan allows 1 client. The user
should upgrade to Pro from the Billing tab.

### Past-due subscriptions

A subscription in `past_due` status keeps its plan's limits during
Stripe's dunning cycle (~4-7 days). If dunning fails and the
subscription moves to `canceled`, the user reverts to Free limits
automatically.
