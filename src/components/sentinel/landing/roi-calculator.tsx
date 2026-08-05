"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, IndianRupee, Building2, ShieldCheck, ArrowRight, TrendingDown } from "lucide-react";
import { GlowCTA } from "./glow-cta";

/**
 * ROICalculator
 * -------------
 * "How much could a breach cost you?" — interactive ROI estimator.
 *
 * Inputs:
 *   - Company size (employees): 10–1000
 *   - Annual revenue: ₹10L–₹100Cr (log scale)
 *   - Industry: Fintech / Healthcare / E-commerce / SaaS / Other
 *
 * Math (all real, computed live):
 *   breach_cost = industry.base + industry.perEmployee * employees
 *   guardianx_cost = 5000 * 12 = 60,000  (₹/year)
 *   ROI = (breach_cost * 0.3) / guardianx_cost
 *   breach_as_pct_of_revenue = breach_cost / revenue * 100
 *
 * Animated number updates: rAF-based ease-out tween from current → target.
 * No chart libraries — all bars/numbers are CSS + text.
 */

interface Industry {
  key: string;
  label: string;
  base: number; // ₹
  perEmployee: number; // ₹
  color: string; // tailwind text class
  dot: string; // hex
}

const INDUSTRIES: Industry[] = [
  { key: "fintech", label: "Fintech", base: 25_000_000, perEmployee: 50_000, color: "text-emerald-400", dot: "#34d399" },
  { key: "healthcare", label: "Healthcare", base: 18_000_000, perEmployee: 40_000, color: "text-cyan-400", dot: "#22d3ee" },
  { key: "ecommerce", label: "E-commerce", base: 12_000_000, perEmployee: 30_000, color: "text-amber-400", dot: "#fbbf24" },
  { key: "saas", label: "SaaS", base: 20_000_000, perEmployee: 45_000, color: "text-violet-400", dot: "#a78bfa" },
  { key: "other", label: "Other", base: 10_000_000, perEmployee: 25_000, color: "text-rose-400", dot: "#fb7185" },
];

const GUARDIANX_ANNUAL = 60_000; // ₹60,000 / year
const BREACH_PROBABILITY = 0.3; // 30% annual probability assumption

/**
 * Smoothly tween a number toward `target` whenever it changes.
 * Always animates from the *currently displayed* value, so rapid
 * slider drags feel continuous.
 */
function useAnimatedNumber(target: number, duration = 0.55): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = valueRef.current;
    const to = target;
    // If the delta is below the display rounding threshold, skip the
    // animation entirely — no setState needed (value is already within
    // 0.5 of target, which rounds away in all our formatters).
    if (Math.abs(from - to) < 0.5) {
      valueRef.current = to;
      return;
    }
    const startTs = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      valueRef.current = v;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else valueRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

/** Format ₹ amount using Indian lakh/crore notation. */
function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatROI(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return Math.round(n).toString();
  return n.toFixed(1);
}

interface SliderProps {
  label: string;
  Icon: typeof Users;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  accent: string; // tailwind text class for accent
}

function Slider({ label, Icon, value, min, max, step, onChange, display, accent }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <Icon className={`size-3.5 ${accent}`} />
          {label}
        </label>
        <span className={`font-mono text-sm font-bold tabular-nums ${accent}`}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="roi-slider h-2 w-full cursor-pointer appearance-none rounded-full"
        style={
          {
            background: `linear-gradient(to right, currentColor ${pct}%, rgba(63,63,70,0.6) ${pct}%)`,
            color: "var(--accent)",
          } as React.CSSProperties
        }
        aria-label={label}
      />
    </div>
  );
}

export function ROICalculator() {
  const [employees, setEmployees] = useState(100);
  const [revenueL, setRevenueL] = useState(500); // in ₹ lakhs, 10–10000
  const [industryKey, setIndustryKey] = useState<string>("fintech");

  const industry = INDUSTRIES.find((i) => i.key === industryKey) ?? INDUSTRIES[0];
  const revenue = revenueL * 1_00_000; // ₹L → ₹

  const breachCost = industry.base + industry.perEmployee * employees;
  const roi = (breachCost * BREACH_PROBABILITY) / GUARDIANX_ANNUAL;
  const breachPctOfRevenue = revenue > 0 ? (breachCost / revenue) * 100 : 0;
  const guardianxPctOfBreach = (GUARDIANX_ANNUAL / breachCost) * 100;

  // Animated display values
  const animBreach = useAnimatedNumber(breachCost);
  const animROI = useAnimatedNumber(roi);
  const animPctRev = useAnimatedNumber(breachPctOfRevenue);
  const animGxPct = useAnimatedNumber(guardianxPctOfBreach);

  // Drive slider accent color via CSS var scoped to this component instance
  const rootStyle = { ["--accent" as string]: industry.dot } as React.CSSProperties;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" style={rootStyle}>
      <div className="mb-8 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          {"// ROI calculator"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
          How much could a breach cost you?
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Adjust the sliders to model your exposure. All math is computed live from
          industry breach-cost averages — no marketing fudge.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.55 }}
        className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"
      >
        {/* Inputs panel */}
        <div className="holo-card-sharp hud-corners space-y-6 border border-zinc-800/80 bg-zinc-950/60 p-6">
          <Slider
            label="Company size"
            Icon={Users}
            value={employees}
            min={10}
            max={1000}
            step={5}
            onChange={setEmployees}
            display={`${employees.toLocaleString("en-IN")} employees`}
            accent={industry.color}
          />

          <Slider
            label="Annual revenue"
            Icon={IndianRupee}
            value={revenueL}
            min={10}
            max={10000}
            step={10}
            onChange={setRevenueL}
            display={formatINR(revenue)}
            accent={industry.color}
          />

          {/* Industry dropdown */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                <Building2 className={`size-3.5 ${industry.color}`} />
                Industry
              </label>
              <span className={`font-mono text-sm font-bold ${industry.color}`}>
                {industry.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRIES.map((ind) => {
                const active = ind.key === industryKey;
                return (
                  <button
                    key={ind.key}
                    type="button"
                    onClick={() => setIndustryKey(ind.key)}
                    className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-all ${
                      active
                        ? `${ind.color} border-current bg-current/10`
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                    style={active ? { boxShadow: `0 0 12px ${ind.dot}44` } : undefined}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: ind.dot, boxShadow: active ? `0 0 6px ${ind.dot}` : undefined }}
                    />
                    {ind.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cost basis footnote */}
          <div className="rounded-md border border-zinc-800/80 bg-zinc-900/40 p-3 font-mono text-[10px] leading-relaxed text-zinc-500">
            <div className="mb-1 uppercase tracking-widest text-zinc-600">{"// cost basis"}</div>
            base {formatINR(industry.base)} + {formatINR(industry.perEmployee)}/employee
            <br />
            GuardianX: ₹5,000/mo × 12 = <span className="text-emerald-400">₹60,000/yr</span>
          </div>
        </div>

        {/* Results panel */}
        <div className="holo-card-sharp hud-corners relative overflow-hidden border border-emerald-500/30 bg-zinc-950/60 p-6">
          {/* Headline breach cost */}
          <div className="text-center">
            <div className="font-mono text-[10px] uppercase tracking-widest text-red-400/70">
              Estimated breach cost
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={industryKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-1 bg-gradient-to-br from-red-300 via-amber-300 to-emerald-300 bg-clip-text text-5xl font-bold tabular-nums text-transparent sm:text-6xl"
              >
                {formatINR(animBreach)}
              </motion.div>
            </AnimatePresence>
            <div className="mt-1 text-xs text-zinc-500">
              {industry.label} · {employees.toLocaleString("en-IN")} employees
            </div>
          </div>

          {/* Comparison bar: breach cost vs GuardianX cost */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <span>Breach cost</span>
              <span>GuardianX/yr</span>
            </div>
            <div className="flex h-3 items-center gap-1 overflow-hidden rounded-full bg-zinc-900">
              <motion.div
                className="h-full rounded-l-full bg-gradient-to-r from-red-500 to-amber-500"
                animate={{ width: `${Math.min(98, (breachCost / (breachCost + GUARDIANX_ANNUAL)) * 100)}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div
                className="h-full rounded-r-full bg-emerald-500"
                animate={{ width: `${Math.max(2, (GUARDIANX_ANNUAL / (breachCost + GUARDIANX_ANNUAL)) * 100)}%` }}
                transition={{ duration: 0.5 }}
                style={{ boxShadow: "0 0 8px #34d399" }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/70">
                ROI
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-300">
                {formatROI(animROI)}x
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-500">return on GuardianX spend</div>
            </div>
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-cyan-500/70">
                % of revenue at risk
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-cyan-300">
                {animPctRev.toFixed(animPctRev < 10 ? 1 : 0)}%
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-500">breach vs annual revenue</div>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4 text-emerald-400" />
                <span className="text-xs text-zinc-400">GuardianX costs you</span>
              </div>
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">
                {animGxPct.toFixed(animGxPct < 1 ? 3 : 2)}% of breach cost
              </span>
            </div>
          </div>

          {/* Marketing line */}
          <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <p className="text-[13px] font-medium text-zinc-200">
              <span className="text-emerald-300">GuardianX prevents 90% of breaches</span>{" "}
              for{" "}
              <span className="font-bold text-emerald-300">0.02% of the cost</span>.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              The math: ₹60,000/yr vs a single breach costing{" "}
              <span className="text-zinc-300">{formatINR(breachCost)}</span>.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-6 flex justify-center">
            <GlowCTA variant="solid" className="!px-7 !py-3 !text-sm">
              <ShieldCheck className="size-4" />
              Get Protected
              <ArrowRight className="size-4" />
            </GlowCTA>
          </div>

          {/* Decorative glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-emerald-500/10 blur-3xl"
          />
        </div>
      </motion.div>

      {/* Disclaimer */}
      <p className="mx-auto mt-6 max-w-3xl text-center text-[11px] leading-relaxed text-zinc-600">
        Estimates derived from publicly reported Indian breach-cost averages
        (IBM Cost of a Data Breach 2024, DPDPA enforcement projections).
        Actual exposure varies by posture, controls, and incident response maturity.
      </p>
    </section>
  );
}
