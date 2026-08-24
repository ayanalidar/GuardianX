"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Crown,
  Loader2,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  CreditCard,
  ExternalLink,
  Building2,
  Users,
  Crosshair,
} from "lucide-react";

interface BillingPanelProps {
  currentUser?: { id: string; email: string; name: string; role: string } | null;
}

interface PlanStatus {
  stripeEnabled: boolean;
  plan: string;
  status: string;
  label: string;
  limits: { clientsMax: number; scansMax: number };
  usage: {
    clientsUsed: number;
    scansUsed: number;
    clientsPercent: number;
    scansPercent: number;
  };
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

interface PlanCard {
  id: "free" | "pro" | "enterprise";
  name: string;
  priceLabel: string;
  priceNote: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const PLANS: PlanCard[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "₹0",
    priceNote: "/ forever",
    tagline: "For solo security researchers & small teams exploring the platform.",
    features: [
      "3 clients",
      "10 scans / month",
      "SAST + AI patch generation",
      "Community support",
    ],
    cta: "Current Plan",
    icon: ShieldCheck,
    accent: "emerald",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "₹5,000",
    priceNote: "/ month",
    tagline: "For consultancies running weekly VAPT cycles on multiple clients.",
    features: [
      "25 clients",
      "250 scans / month",
      "SAST + DAST + adversarial patching",
      "RedAgent VAPT engine",
      "GRC compliance (DPDPA, ISO 27001, SOC 2)",
      "Priority email support (24h SLA)",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
    icon: Rocket,
    accent: "amber",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Custom",
    priceNote: "/ tailored",
    tagline: "For MSSPs and large orgs that need SSO, dedicated infra, and audit SLAs.",
    features: [
      "Unlimited clients + scans",
      "Dedicated sentinel-engine fleet",
      "SSO (SAML / OIDC) + SCIM",
      "On-prem / VPC deployment",
      "Custom compliance frameworks",
      "Dedicated TAM + 4h SLA",
    ],
    cta: "Contact Sales",
    icon: Crown,
    accent: "purple",
  },
];

const ACCENT: Record<string, { text: string; border: string; bg: string; btn: string; ring: string }> = {
  emerald: {
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    btn: "bg-emerald-600 text-white hover:bg-emerald-500",
    ring: "ring-emerald-500/40",
  },
  amber: {
    text: "text-amber-300",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    btn: "bg-amber-600 text-white hover:bg-amber-500",
    ring: "ring-amber-500/40",
  },
  purple: {
    text: "text-purple-300",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    btn: "bg-purple-600 text-white hover:bg-purple-500",
    ring: "ring-purple-500/40",
  },
};

export function BillingPanel({ currentUser }: BillingPanelProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/status");
      if (!res.ok) throw new Error("Failed to load billing status");
      const data = (await res.json()) as PlanStatus;
      setStatus(data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Billing status unavailable",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCheckout = async (plan: "pro" | "enterprise") => {
    if (plan === "enterprise") {
      // Enterprise is sales-led.
      window.location.href = "mailto:hello@guardianx.in?subject=GuardianX%20Enterprise%20Plan";
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // Stripe not configured — show the message inline.
      toast({
        title: "Billing disabled",
        description: data.message ?? "Stripe is not configured on this instance.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Portal failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast({
        title: "Manage subscription",
        description:
          data.message ?? "No Stripe customer record found. Subscribe to a plan first.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Portal failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const currentPlanId = status?.plan || "free";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <CreditCard className="size-5 text-emerald-400" />
          Billing & Subscription
        </h2>
        <p className="text-sm text-zinc-400">
          Manage your GuardianX plan, view usage, and upgrade for higher limits.
        </p>
      </div>

      {/* Billing disabled notice */}
      {status && !status.stripeEnabled && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <div className="font-semibold text-amber-300">Billing is currently disabled</div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Stripe is not configured on this GuardianX instance. You can still see your plan and
              usage below, but checkout / portal buttons will return a friendly message. Set{" "}
              <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">
                STRIPE_SECRET_KEY
              </code>{" "}
              +{" "}
              <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">
                STRIPE_PRICE_PRO
              </code>{" "}
              to enable.
            </p>
          </div>
        </motion.div>
      )}

      {/* Current plan + usage */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-zinc-800/60" />
          ))}
        </div>
      ) : status ? (
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
                <ShieldCheck className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-50">
                  Current Plan: {status.label}
                  <Badge
                    className={`border px-1.5 py-0 text-[9px] ${
                      status.status === "active"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {status.status}
                  </Badge>
                  {status.cancelAtPeriodEnd && (
                    <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                      Canceled at period end
                    </Badge>
                  )}
                </div>
                {status.currentPeriodEnd && (
                  <div className="text-[10px] text-zinc-500">
                    Renews / ends on {new Date(status.currentPeriodEnd).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePortal}
              disabled={busy === "portal" || !status.stripeEnabled || !status.stripeCustomerId}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              {busy === "portal" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ExternalLink className="size-3.5" />
              )}
              Manage Subscription
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <UsageTile
              icon={Building2}
              label="Clients"
              used={status.usage.clientsUsed}
              max={status.limits.clientsMax}
              percent={status.usage.clientsPercent}
            />
            <UsageTile
              icon={Crosshair}
              label="Scans this period"
              used={status.usage.scansUsed}
              max={status.limits.scansMax}
              percent={status.usage.scansPercent}
            />
          </div>
        </Card>
      ) : null}

      {/* Pricing cards */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Available Plans</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const accent = ACCENT[plan.accent];
            const Icon = plan.icon;
            const isCurrent = currentPlanId === plan.id;
            const isUpgrade = !isCurrent && plan.id !== "free";
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <Card
                  className={`relative flex h-full flex-col rounded-xl border bg-zinc-900/40 p-5 transition-colors ${
                    plan.highlight
                      ? "border-amber-500/40 shadow-[0_0_28px_rgba(245,158,11,0.12)]"
                      : "border-zinc-800"
                  } ${isCurrent ? `${accent.border} ring-1 ${accent.ring}` : ""}`}
                >
                  {plan.highlight && (
                    <Badge className="absolute -top-2.5 right-4 border border-amber-500/40 bg-amber-500/15 px-2 py-0 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      Most popular
                    </Badge>
                  )}
                  <div className="mb-3 flex items-center gap-2">
                    <div className={`flex size-9 items-center justify-center rounded-lg ${accent.bg} ring-1 ${accent.ring}`}>
                      <Icon className={`size-4 ${accent.text}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-50">{plan.name}</div>
                      <div className="text-[10px] text-zinc-500">{plan.tagline}</div>
                    </div>
                  </div>

                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-zinc-50">{plan.priceLabel}</span>
                    <span className="text-xs text-zinc-500">{plan.priceNote}</span>
                  </div>

                  <ul className="mb-5 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                        <Check className={`mt-0.5 size-3.5 shrink-0 ${accent.text}`} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto">
                    {isCurrent ? (
                      <Button
                        disabled
                        variant="outline"
                        className="w-full border-zinc-700 bg-zinc-900 text-zinc-300"
                      >
                        <Check className="size-4" /> Current Plan
                      </Button>
                    ) : plan.id === "enterprise" ? (
                      <Button
                        onClick={() => handleCheckout("enterprise")}
                        className={`w-full ${accent.btn}`}
                      >
                        <Crown className="size-4" /> {plan.cta}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleCheckout(plan.id as "pro")}
                        disabled={busy === plan.id || !status?.stripeEnabled}
                        className={`w-full ${accent.btn}`}
                      >
                        {busy === plan.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : isUpgrade ? (
                          <Rocket className="size-4" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        {plan.cta}
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Org usage summary (for admins) */}
      {currentUser?.role === "admin" && status && (
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Users className="size-4 text-emerald-400" />
            <span className="text-sm font-semibold text-zinc-200">Org-wide usage</span>
          </div>
          <p className="text-xs text-zinc-500">
            As an admin you see aggregate usage across all users. Individual user activity is on the
            <span className="text-emerald-400"> User Activity</span> tab.
          </p>
        </Card>
      )}
    </div>
  );
}

function UsageTile({
  icon: Icon,
  label,
  used,
  max,
  percent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  used: number;
  max: number;
  percent: number;
}) {
  const unlimited = max >= 9999;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <Icon className="size-3.5 text-emerald-400" /> {label}
        </div>
        <div className="text-xs text-zinc-400">
          <span className="font-bold text-zinc-100">{used}</span>
          {" / "}
          {unlimited ? "∞" : max}
        </div>
      </div>
      <Progress
        value={unlimited ? 0 : percent}
        className="h-1.5 bg-zinc-800"
      />
      {!unlimited && percent >= 90 && (
        <div className="mt-1 text-[10px] text-amber-400">
          Approaching limit — consider upgrading.
        </div>
      )}
    </div>
  );
}
