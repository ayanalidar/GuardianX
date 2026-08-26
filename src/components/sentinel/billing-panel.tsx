"use client";

// GuardianX Billing Panel (Task #7-billing).
//
// Renders three sections:
//   1. Current Plan card — shows the user's current plan, status, and
//      live usage bars (clients used/max, scans used/max this month).
//   2. Pricing cards — Free / Pro (₹2,000/mo) / Enterprise (Custom),
//      each with an "Upgrade" button that hits /api/billing/checkout
//      and redirects to the Stripe Checkout URL returned.
//   3. Manage Subscription button — opens the Stripe Billing Portal
//      via /api/billing/portal so the user can update card, cancel,
//      switch plans, download invoices.
//
// GRACEFUL NO-OP: when Stripe isn't configured
// (`isStripeConfigured() === false`, surfaced via the API as
// `configured: false`), the panel shows a "billing disabled" banner,
// hides the Upgrade buttons, and displays the enterprise plan's
// unlimited limits so the user can see they have full access.
//
// Visual idiom matches the rest of the Sentinel console:
// `holo-card-sharp hud-corners`, framer-motion entrance, zinc-950 bg,
// emerald/cyan/amber accents, `useToast` for feedback.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Sparkles,
  Crown,
  Zap,
  CheckCircle2,
  ArrowRight,
  Loader2,
  AlertCircle,
  TrendingUp,
  Building2,
  Infinity as InfinityIcon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────
interface PlanLimits {
  maxClients: number;
  maxScansPerMonth: number;
  features: string[];
}

interface SubscriptionResponse {
  configured: boolean;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  usage: {
    clients: { used: number; max: number };
    scans: { used: number; max: number };
  };
}

// ── Plan catalog (single source of truth for the UI labels) ──────────────
// Pricing here must match the Stripe prices you create in the dashboard
// (see docs/BILLING-SETUP.md). The actual gate enforcement uses
// `getPlanLimits` from src/lib/stripe.ts, NOT this catalog — so if the
// numbers drift, the gate still works correctly (it just may show a
// different price than what Stripe charges).
const PLAN_CATALOG = [
  {
    id: "free" as const,
    name: "Free",
    icon: Zap,
    price: "₹0",
    period: "/forever",
    description: "For solo developers getting started with security",
    color: "emerald",
    accentBorder: "border-emerald-500/30",
    accentBg: "bg-emerald-500/10",
    accentText: "text-emerald-400",
    features: [
      "1 client",
      "5 scans per month",
      "SAST vulnerability scanning",
      "Basic PDF reports",
      "Community support",
    ],
    cta: "Current Plan",
    highlight: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    icon: Sparkles,
    price: "₹2,000",
    period: "/month",
    description: "For growing teams that need continuous protection",
    color: "cyan",
    accentBorder: "border-cyan-500/40",
    accentBg: "bg-cyan-500/10",
    accentText: "text-cyan-400",
    features: [
      "10 clients",
      "100 scans per month",
      "SAST + DAST scanning",
      "AI-powered patch remediation",
      "Full VAPT reports (15-page PDF)",
      "Webhook integrations",
      "Priority email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    icon: Crown,
    price: "Custom",
    period: "",
    description: "For MSSPs, banks, and large enterprises",
    color: "violet",
    accentBorder: "border-violet-500/40",
    accentBg: "bg-violet-500/10",
    accentText: "text-violet-400",
    features: [
      "Unlimited clients",
      "Unlimited scans",
      "Everything in Pro, plus:",
      "Dedicated infrastructure",
      "On-premise deployment",
      "Custom AI model training",
      "24/7 phone support",
      "Dedicated account manager",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

// ── Main component ──────────────────────────────────────────────────────
export function BillingPanel({
  currentUser,
}: {
  currentUser: { id: string; email: string; name: string; role: string } | null;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true);
      try {
        const resp = await fetch("/api/billing/subscription", {
          headers: {
            // Bearer-token auth (CSRF-immune per middleware.ts)
            Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("guardianx-token") || "" : ""}`,
          },
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = (await resp.json()) as SubscriptionResponse;
        setData(json);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Failed to load billing info",
          description: err instanceof Error ? err.message : "Backend unreachable.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  // After a successful checkout redirect, Stripe sends the user back to
  // /?billing=success. We don't read the query param directly here (the
  // page.tsx router does), but we DO want to refresh the subscription
  // data so the upgraded plan shows up immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      // Clean up the URL so a refresh doesn't re-trigger this.
      params.delete("billing");
      const newSearch = params.toString();
      const newUrl = newSearch
        ? `${window.location.pathname}?${newSearch}`
        : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
      load({ silent: true });
      toast({
        title: "Subscription activated",
        description: "Your plan has been upgraded. Welcome aboard!",
      });
    } else if (params.get("billing") === "cancelled") {
      params.delete("billing");
      const newSearch = params.toString();
      const newUrl = newSearch
        ? `${window.location.pathname}?${newSearch}`
        : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
      toast({
        variant: "destructive",
        title: "Checkout cancelled",
        description: "Your subscription was not changed.",
      });
    } else if (params.get("billing") === "portal") {
      params.delete("billing");
      const newSearch = params.toString();
      const newUrl = newSearch
        ? `${window.location.pathname}?${newSearch}`
        : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
      load({ silent: true });
    }
    // Only run once on mount.
  }, []);

  const handleUpgrade = async (plan: "pro" | "enterprise" | "free") => {
    if (plan === "enterprise") {
      // Enterprise is a "contact sales" flow, not self-serve checkout.
      if (typeof window !== "undefined") {
        window.location.href = "mailto:hello@guardianx.in?subject=GuardianX%20Enterprise%20Plan";
      }
      return;
    }

    if (plan === "free") {
      // "Downgrade to free" — user must cancel their current
      // subscription via the Stripe billing portal. We can't do it
      // directly via Checkout (free has no Stripe price).
      toast({
        title: "Downgrade to Free",
        description:
          "To switch to the Free plan, please cancel your current subscription from the Billing Portal. You'll keep your paid plan until the end of the current billing period.",
      });
      // Open the portal so the user can cancel.
      handlePortal();
      return;
    }

    setUpgradingPlan(plan);
    try {
      const resp = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("guardianx-token") || "" : ""}`,
        },
        body: JSON.stringify({ plan }),
      });
      const json = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !json.url) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      // Redirect to Stripe Checkout — this is a full-page redirect,
      // Stripe handles the rest.
      if (typeof window !== "undefined") {
        window.location.href = json.url;
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "Could not start checkout.",
      });
      setUpgradingPlan(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const resp = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("guardianx-token") || "" : ""}`,
        },
      });
      const json = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !json.url) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      if (typeof window !== "undefined") {
        window.location.href = json.url;
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not open billing portal",
        description: err instanceof Error ? err.message : "Try again later.",
      });
      setPortalLoading(false);
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const currentPlan = data?.plan || "free";
  const isUnlimited = !data?.configured || currentPlan === "enterprise";

  return (
    <div className="space-y-5 fade-in-up">
      {/* ── Not-configured banner ─────────────────────────────────────── */}
      {data && !data.configured && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-300">
              Billing is not configured on this GuardianX instance
            </h3>
            <p className="mt-1 text-xs text-amber-200/70">
              All plan limits are currently unlimited (enterprise mode). To enable
              subscription billing, the operator needs to set{" "}
              <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-amber-300">
                STRIPE_SECRET_KEY
              </code>{" "}
              and the price IDs. See{" "}
              <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-amber-300">
                docs/BILLING-SETUP.md
              </code>{" "}
              for instructions.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Current Plan + Usage ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="holo-card-sharp hud-corners relative overflow-hidden border border-emerald-500/20 p-5 sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <CreditCard className="size-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Current Plan:{" "}
                <span className="capitalize text-emerald-400">{currentPlan}</span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                {data?.status && data.status !== "active" && (
                  <span className="capitalize text-amber-400">{data.status} · </span>
                )}
                {data?.currentPeriodEnd
                  ? `Renews ${new Date(data.currentPeriodEnd).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}`
                  : isUnlimited
                    ? "No expiry — unlimited mode"
                    : "No active subscription"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => load({ silent: true })}
              disabled={refreshing}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span className="ml-1 hidden sm:inline">Refresh</span>
            </Button>
            {data?.configured && data?.stripeCustomerId && (
              <Button
                size="sm"
                onClick={handlePortal}
                disabled={portalLoading}
                className="bg-cyan-600 text-white hover:bg-cyan-500"
              >
                {portalLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                <span className="ml-1">Manage Subscription</span>
              </Button>
            )}
          </div>
        </div>

        {/* Usage bars */}
        <div className="grid gap-4 sm:grid-cols-2">
          <UsageBar
            label="Clients"
            used={data?.usage.clients.used ?? 0}
            max={data?.usage.clients.max ?? Infinity}
            icon={Building2}
            accent="emerald"
          />
          <UsageBar
            label="Scans this month"
            used={data?.usage.scans.used ?? 0}
            max={data?.usage.scans.max ?? Infinity}
            icon={TrendingUp}
            accent="cyan"
          />
        </div>

        {/* Current plan features */}
        <div className="mt-5 border-t border-zinc-800/60 pt-4">
          <div className="mb-2 text-xs font-medium text-zinc-400">Included features</div>
          <div className="flex flex-wrap gap-1.5">
            {(data?.limits.features || []).map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-300"
              >
                {f}
              </Badge>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Pricing cards ─────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-zinc-200">
            {data?.configured ? "Switch plan" : "Available plans"}
          </h3>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {PLAN_CATALOG.map((tier, i) => {
            const isCurrent = currentPlan === tier.id;
            const isUpgrade =
              data?.configured &&
              !isCurrent &&
              (tier.id === "pro" || tier.id === "enterprise");
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className={`holo-card-sharp hud-corners relative flex flex-col overflow-hidden border ${tier.accentBorder} ${
                  tier.highlight ? "lg:-mt-2 lg:mb-2" : ""
                }`}
              >
                {tier.highlight && (
                  <div className="absolute right-3 top-3">
                    <Badge className="border-cyan-500/40 bg-cyan-500/20 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                      Popular
                    </Badge>
                  </div>
                )}
                <div className={`border-b border-zinc-800/60 p-5 ${tier.accentBg}`}>
                  <tier.icon className={`mb-2 size-6 ${tier.accentText}`} />
                  <h4 className={`text-lg font-bold ${tier.accentText}`}>{tier.name}</h4>
                  <p className="mt-1 text-[11px] text-zinc-400">{tier.description}</p>
                </div>
                <div className="border-b border-zinc-800/60 p-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-zinc-50">{tier.price}</span>
                    {tier.period && (
                      <span className="text-xs text-zinc-500">{tier.period}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex-1 space-y-2">
                    {tier.features.map((f, j) => (
                      <div key={j} className="flex items-start gap-2 text-xs">
                        <CheckCircle2
                          className={`mt-0.5 size-3.5 shrink-0 ${tier.accentText}`}
                        />
                        <span
                          className={
                            f.includes("Everything") || f.includes("plus")
                              ? "font-semibold text-zinc-200"
                              : "text-zinc-400"
                          }
                        >
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA button */}
                  <div className="mt-5">
                    {isCurrent ? (
                      <div
                        className={`flex w-full items-center justify-center gap-2 rounded-md border ${tier.accentBorder} ${tier.accentBg} py-2.5 text-xs font-bold ${tier.accentText}`}
                      >
                        <CheckCircle2 className="size-3.5" />
                        Current Plan
                      </div>
                    ) : !data?.configured ? (
                      // Billing not configured — show disabled button.
                      <div className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 py-2.5 text-xs font-medium text-zinc-500">
                        Billing disabled
                      </div>
                    ) : isUpgrade ? (
                      <Button
                        onClick={() => handleUpgrade(tier.id)}
                        disabled={upgradingPlan === tier.id}
                        className={`w-full ${
                          tier.highlight
                            ? "bg-cyan-600 text-white hover:bg-cyan-500"
                            : `border ${tier.accentBorder} ${tier.accentBg} ${tier.accentText} hover:brightness-125`
                        }`}
                        variant={tier.highlight ? "default" : "outline"}
                      >
                        {upgradingPlan === tier.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="size-3.5" />
                        )}
                        {tier.cta}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleUpgrade(tier.id as "pro" | "enterprise")}
                        disabled={upgradingPlan === tier.id}
                        variant="outline"
                        className={`w-full border ${tier.accentBorder} ${tier.accentText} hover:brightness-125`}
                      >
                        {upgradingPlan === tier.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="size-3.5" />
                        )}
                        {tier.cta}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Footer info ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-center">
        <p className="text-[11px] text-zinc-500">
          {currentUser?.email ? `Signed in as ${currentUser.email}. ` : ""}
          All prices in INR. Billed monthly. Cancel anytime via the Billing Portal.
          Need a custom plan?{" "}
          <a
            href="mailto:hello@guardianx.in"
            className="text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            Contact sales
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ── Usage bar subcomponent ──────────────────────────────────────────────
function UsageBar({
  label,
  used,
  max,
  icon: Icon,
  accent,
}: {
  label: string;
  used: number;
  max: number;
  icon: typeof Building2;
  accent: "emerald" | "cyan";
}) {
  const unlimited = !Number.isFinite(max);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const isWarning = !unlimited && pct >= 80;
  const isCritical = !unlimited && pct >= 100;

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : accent === "emerald"
        ? "bg-emerald-500"
        : "bg-cyan-500";

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`size-3.5 text-${accent}-400`} />
          <span className="text-xs font-medium text-zinc-300">{label}</span>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          {unlimited ? (
            <span className="flex items-center gap-0.5 text-emerald-400">
              {used}
              <InfinityIcon className="size-3" /> / ∞
            </span>
          ) : (
            <>
              <span
                className={
                  isCritical
                    ? "text-red-400"
                    : isWarning
                      ? "text-amber-400"
                      : "text-zinc-200"
                }
              >
                {used}
              </span>
              <span className="text-zinc-500"> / {max}</span>
            </>
          )}
        </span>
      </div>
      {unlimited ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-500/20">
          <div className="h-full w-full bg-emerald-500/60" />
        </div>
      ) : (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`h-full ${barColor}`}
          />
        </div>
      )}
      {isCritical && (
        <p className="mt-1.5 text-[10px] text-red-400">
          Limit reached — upgrade to continue.
        </p>
      )}
      {isWarning && !isCritical && (
        <p className="mt-1.5 text-[10px] text-amber-400">
          Approaching limit — consider upgrading soon.
        </p>
      )}
    </div>
  );
}

export default BillingPanel;
