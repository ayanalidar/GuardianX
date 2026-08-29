"use client";

// GuardianX — PAY-PER-VULNERABILITY PANEL
// ======================================
// Innovation #1: outcome-based pricing. The customer pays only when
// GuardianX finds real vulnerabilities — nothing upfront, nothing if the
// codebase is clean. Each finding's severity maps to a fixed rupee price
// (Critical ₹500, High ₹200, Medium ₹50, Low ₹10, Info ₹0). Owed entries
// accumulate in the FindingsLedger; the user pays them off in a single
// Stripe Checkout session that folds every "owed" row into one charge.
//
// This component is a self-contained tab view:
//   • Header with ₹ icon + "PAY-PER-VULNERABILITY" title
//   • Big-number "Total owed: ₹X" card (animated count-up)
//   • Pricing table (5 severity tiers)
//   • Ledger table (date, severity, amount, status) with custom scrollbar
//   • "Pay now" button → /api/pay-per-vuln/invoice → redirect to Stripe
//   • "How it works" explainer card
//
// Visual idiom: holo-card-sharp + hud-corners, bg-zinc-950, emerald + amber
// accents (NO indigo/blue). Mobile-first, responsive.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  IndianRupee,
  ShieldCheck,
  Sparkles,
  ReceiptText,
  Loader2,
  RefreshCw,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ── Types (mirror server response shape) ─────────────────────────────────
interface LedgerEntry {
  id: string;
  findingId: string;
  severity: string;
  amount: number; // paise
  scanId: string | null;
  codebaseId: string | null;
  status: string; // owed | invoiced | paid | waived
  createdAt: string;
  invoicedAt: string | null;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  totalOwed: number;       // paise
  totalInvoiced: number;   // paise
  totalPaid: number;       // paise
  breakdown: Record<string, number>;
  error?: string;
}

interface InvoiceResponse {
  stripeEnabled?: boolean;
  url?: string;
  sessionId?: string;
  invoicedCount?: number;
  totalPaise?: number;
  owedCount?: number;
  message?: string;
  error?: string;
}

// ── Pricing tiers — single source of truth for the UI ────────────────────
// Mirrors src/app/api/pay-per-vuln/record/route.ts SEVERITY_AMOUNT map.
const PRICING = [
  { sev: "critical", label: "Critical", price: 500, color: "#f43f5e", icon: AlertCircle },
  { sev: "high",     label: "High",     price: 200, color: "#f97316", icon: ShieldCheck },
  { sev: "medium",   label: "Medium",   price: 50,  color: "#f59e0b", icon: AlertCircle },
  { sev: "low",      label: "Low",      price: 10,  color: "#06b6d4", icon: Info },
  { sev: "info",     label: "Info",     price: 0,   color: "#71717a", icon: Info },
] as const;

function rupee(paise: number): string {
  // Format paise → ₹X,XXX.XX (Indian grouping). ₹0 stays as ₹0.
  const rupees = paise / 100;
  if (rupees === 0) return "₹0";
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
  return formatter.format(rupees);
}

function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case "critical": return "#f43f5e";
    case "high":     return "#f97316";
    case "medium":   return "#f59e0b";
    case "low":      return "#06b6d4";
    case "info":     return "#71717a";
    default:         return "#a1a1aa";
  }
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "owed":     return { label: "OWED",     cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" };
    case "invoiced": return { label: "INVOICED", cls: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30" };
    case "paid":     return { label: "PAID",     cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" };
    case "waived":   return { label: "WAIVED",   cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" };
    default:         return { label: status.toUpperCase(), cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" };
  }
}

// ── Animated count-up (rupee formatting) ──────────────────────────────────
function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

async function fetchLedger(signal: AbortSignal): Promise<LedgerResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/pay-per-vuln/ledger", {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as LedgerResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to load ledger (${res.status})`);
  }
  return data;
}

async function postInvoice(): Promise<InvoiceResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/pay-per-vuln/invoice", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as InvoiceResponse;
}

export function PayPerVuln() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [paying, setPaying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const d = await fetchLedger(ctrl.signal);
      setData(d);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message || "Failed to load ledger.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const totalOwed = data?.totalOwed ?? 0;
  const animatedOwed = useCountUp(totalOwed);

  const handlePay = async () => {
    if (totalOwed === 0) {
      toast({
        title: "Nothing to pay",
        description: "You have no owed findings right now.",
      });
      return;
    }
    setPaying(true);
    try {
      const resp = await postInvoice();
      if (resp.error) {
        toast({ title: "Payment failed", description: resp.error, variant: "destructive" });
        return;
      }
      if (resp.stripeEnabled === false) {
        toast({
          title: "Stripe not configured",
          description: resp.message || "Billing is disabled on this GuardianX instance.",
          variant: "destructive",
        });
        return;
      }
      if (resp.url) {
        toast({
          title: "Redirecting to Stripe…",
          description: `Invoicing ${resp.invoicedCount || 0} finding(s) for ${rupee(resp.totalPaise || 0)}.`,
        });
        // Give the toast a moment to paint, then redirect.
        setTimeout(() => {
          window.location.href = resp.url as string;
        }, 600);
        return;
      }
      // Either 0 owed or below minimum charge.
      toast({
        title: "Invoice not generated",
        description: resp.message || "Nothing to invoice right now.",
      });
      // Refresh — the owed entries may still be there (or zero).
      void load();
    } catch (e) {
      toast({
        title: "Payment failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  const breakdown = data?.breakdown ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const entries = data?.entries ?? [];
  const totalPaid = data?.totalPaid ?? 0;
  const totalInvoiced = data?.totalInvoiced ?? 0;

  return (
    <div className="space-y-4 p-1">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="holo-card-sharp hud-corners flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <IndianRupee className="size-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
              PAY-PER-VULNERABILITY
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
              Outcome-based pricing · You only pay when we find something
            </p>
          </div>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* ── Big number card ──────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="holo-card-sharp hud-corners relative overflow-hidden p-6"
        >
          <div className="absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/10 blur-2xl" aria-hidden />
          <div className="relative">
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-400/80">
              <ReceiptText className="size-3.5" />
              Total owed
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-10 w-40 bg-emerald-500/10" />
            ) : (
              <div
                className="font-mono text-4xl font-bold tracking-tight text-emerald-300 sm:text-5xl"
                style={{ textShadow: "0 0 24px rgba(16,185,129,0.35)" }}
              >
                {rupee(animatedOwed)}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800/60 px-2 py-1">
                <CheckCircle2 className="size-3 text-emerald-400" />
                Paid: {rupee(totalPaid)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800/60 px-2 py-1">
                <Loader2 className="size-3 text-cyan-400" />
                Invoiced: {rupee(totalInvoiced)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Pricing table ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="holo-card-sharp hud-corners p-5 lg:col-span-2"
        >
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cyan-400/80">
            Pricing · per finding
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PRICING.map((tier) => {
              const Icon = tier.icon;
              return (
                <div
                  key={tier.sev}
                  className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-center transition-colors hover:border-zinc-700"
                >
                  <Icon className="size-4" style={{ color: tier.color }} />
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                    {tier.label}
                  </div>
                  <div
                    className="mt-1 font-mono text-sm font-bold"
                    style={{ color: tier.color }}
                  >
                    ₹{tier.price}
                  </div>
                  <div className="mt-1 text-[9px] text-zinc-500">
                    {breakdown[tier.sev] || 0} owed
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Ledger table ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="holo-card-sharp hud-corners flex flex-col p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <ReceiptText className="size-4 text-emerald-400" />
            Findings Ledger
            {entries.length > 0 && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                {entries.length}
              </Badge>
            )}
          </h3>
          <Button
            onClick={handlePay}
            disabled={paying || totalOwed === 0}
            size="sm"
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            {paying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Pay {rupee(totalOwed)} now
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-rose-300">
            <AlertCircle className="size-5" />
            {error}
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-emerald-500/5" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <ShieldCheck className="size-7 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-zinc-200">No findings yet</p>
            <p className="max-w-sm text-xs text-zinc-500">
              Run a scan. When GuardianX finds a vulnerability, the entry appears here and you owe the listed amount. If we find nothing, you pay nothing.
            </p>
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto custom-scrollbar">
            {/* Desktop header row */}
            <div className="hidden grid-cols-[1.4fr_0.8fr_1fr_0.8fr] gap-3 border-b border-zinc-800/60 px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 md:grid">
              <div>Finding</div>
              <div>Severity</div>
              <div>Date</div>
              <div className="text-right">Amount · Status</div>
            </div>
            {entries.map((e, i) => {
              const sev = (e.severity || "info").toLowerCase();
              const sevColor = severityColor(sev);
              const sb = statusBadge(e.status);
              const date = new Date(e.createdAt);
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.4) }}
                  className="grid grid-cols-1 gap-2 border-b border-zinc-800/40 px-4 py-3 transition-colors hover:bg-zinc-900/40 md:grid-cols-[1.4fr_0.8fr_1fr_0.8fr] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">
                      {e.findingId}
                    </div>
                    {e.codebaseId && (
                      <div className="truncate font-mono text-[9px] text-zinc-600">
                        cb:{e.codebaseId.slice(0, 12)}…
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: sevColor }}
                      aria-hidden
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: sevColor }}>
                      {sev}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    <span className="ml-1 text-zinc-600">
                      {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span className="font-mono text-sm font-bold text-zinc-100">
                      {rupee(e.amount)}
                    </span>
                    <Badge variant="outline" className={`px-1.5 py-0.5 font-mono text-[9px] ${sb.cls}`}>
                      {sb.label}
                    </Badge>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ── How it works explainer ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="holo-card-sharp hud-corners p-5"
      >
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-400/80">
          <Sparkles className="size-3.5" />
          How it works
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-xs text-emerald-300">1</span>
              Scan
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              GuardianX runs SAST + DAST + AI remediation across your codebase. Every confirmed finding is added to your ledger.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex size-6 items-center justify-center rounded-md bg-amber-500/15 font-mono text-xs text-amber-300">2</span>
              Accumulate
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              You only pay when we find real vulnerabilities. If we find nothing, you pay nothing. Critical ₹500, High ₹200, Medium ₹50, Low ₹10, Info ₹0.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex size-6 items-center justify-center rounded-md bg-cyan-500/15 font-mono text-xs text-cyan-300">3</span>
              Pay
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              Click <span className="font-semibold text-emerald-300">Pay now</span> to fold every owed entry into a single Stripe Checkout. After payment, entries flip to <span className="font-mono">paid</span>.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200/90">
          <ArrowRight className="size-4 text-emerald-400" />
          <span className="font-semibold">Outcome guarantee:</span>
          <span className="text-emerald-100/80">
            If a scan completes with zero findings, your ledger stays at ₹0 — no platform fee, no minimum charge, no surprise.
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default PayPerVuln;
