"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowUpRight, TrendingUp, Clock, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCountUp, formatInt } from "./use-count-up";

/**
 * CaseStudies
 * -----------
 * "Real Results from Real Scans" — 3 anonymized customer case studies.
 *
 * Each card shows:
 *   - An anonymized company type
 *   - A headline metric that counts up on scroll into view
 *   - A before → after score pair (PostureScore / Compliance / MTTR)
 *   - A short outcome sentence
 *   - A "Read case study" link to /case-studies (placeholder route)
 *
 * Dark cards with emerald accent borders, framer-motion entrance.
 * No external chart libraries — counters are pure rAF (useCountUp).
 */

interface CaseStudy {
  companyType: string;
  industry: string;
  headlineLabel: string;
  headlineValue: number;
  headlineSuffix?: string;
  headlinePrefix?: string;
  headlineUnit?: string;
  beforeLabel: string;
  beforeValue: number;
  afterLabel: string;
  afterValue: number;
  beforeSuffix?: string;
  afterSuffix?: string;
  deltaGood: "up" | "down"; // which direction is "better"
  outcome: string;
  Icon: LucideIcon;
}

const CASES: CaseStudy[] = [
  {
    companyType: "Fintech Startup",
    industry: "Series A · Bangalore",
    headlineLabel: "Vulnerabilities found",
    headlineValue: 23,
    headlineUnit: "in 2 hours",
    beforeLabel: "PostureScore",
    beforeValue: 34,
    afterLabel: "PostureScore",
    afterValue: 89,
    deltaGood: "up",
    outcome:
      "Found 23 vulnerabilities in 2 hours, including 2 critical SQL injections. Remediation time: 4 hours. PostureScore improved from 34 to 89.",
    Icon: ShieldCheck,
  },
  {
    companyType: "E-commerce Platform",
    industry: "Mid-market · Mumbai",
    headlineLabel: "DPDPA findings mapped",
    headlineValue: 47,
    headlineUnit: "in 1 day",
    beforeLabel: "DPDPA Compliance",
    beforeValue: 12,
    beforeSuffix: "%",
    afterLabel: "DPDPA Compliance",
    afterValue: 100,
    afterSuffix: "%",
    deltaGood: "up",
    outcome:
      "DPDPA compliance audit completed in 1 day. 47 findings mapped to specific DPDPA sections. Zero data exfiltration incidents since deployment.",
    Icon: TrendingUp,
  },
  {
    companyType: "Healthcare SaaS",
    industry: "HIPAA-bound · Delhi",
    headlineLabel: "Auto-patched post-deploy",
    headlineValue: 3,
    headlineUnit: "before exploit",
    beforeLabel: "Mean Time To Patch",
    beforeValue: 72,
    beforeSuffix: "h",
    afterLabel: "Mean Time To Patch",
    afterValue: 0,
    afterSuffix: "h",
    deltaGood: "down",
    outcome:
      "Continuous DAST scanning detected 3 new vulnerabilities after a deploy. Auto-patched before attackers could exploit. 99.9% uptime maintained.",
    Icon: Clock,
  },
];

function ScorePair({ study }: { study: CaseStudy }) {
  // Single shared in-view trigger for both before/after counters — both
  // animate together when the card scrolls into view.
  const triggerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(triggerRef, { once: true, amount: 0.4 });

  const [, beforeVal] = useCountUp(study.beforeValue, {
    duration: 1400,
    delay: 200,
    start: inView,
  });
  const [, afterVal] = useCountUp(study.afterValue, {
    duration: 1600,
    delay: 500,
    start: inView,
  });

  return (
    <div ref={triggerRef} className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <div className="flex items-end justify-between gap-2">
        {/* Before */}
        <div className="flex-1 text-center">
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            Before
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-zinc-400">
            {formatInt(beforeVal)}
            {study.beforeSuffix ?? ""}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center justify-center pb-1">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"
          >
            <ArrowUpRight className="size-3.5" />
          </motion.div>
        </div>

        {/* After */}
        <div className="flex-1 text-center">
          <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/70">
            After
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-300">
            {formatInt(afterVal)}
            {study.afterSuffix ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseCard({ study, index }: { study: CaseStudy; index: number }) {
  const [ref, value] = useCountUp(study.headlineValue, {
    duration: 1800,
    delay: index * 200 + 200,
  });

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 28, rotateX: -6 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="holo-card-sharp hud-corners group relative flex flex-col overflow-hidden border border-emerald-500/30 bg-zinc-950/70 p-6"
    >
      {/* Top-row: icon + industry tag */}
      <div className="flex items-center justify-between">
        <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <study.Icon className="size-5 text-emerald-400" />
        </div>
        <span className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          {study.industry}
        </span>
      </div>

      {/* Company type */}
      <h3 className="mt-4 text-lg font-bold text-zinc-100">{study.companyType}</h3>

      {/* Headline metric */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="bg-gradient-to-br from-emerald-300 to-cyan-400 bg-clip-text text-5xl font-bold tabular-nums text-transparent">
          {study.headlinePrefix ?? ""}
          {formatInt(value)}
          {study.headlineSuffix ?? ""}
        </span>
        {study.headlineUnit && (
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            {study.headlineUnit}
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
        {study.headlineLabel}
      </div>

      {/* Before → After */}
      <ScorePair study={study} />

      {/* Outcome */}
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">{study.outcome}</p>

      {/* Read case study link */}
      <a
        href="/features"
        className="mt-5 inline-flex items-center gap-1.5 self-start border-b border-emerald-500/40 pb-0.5 font-mono text-[11px] uppercase tracking-wider text-emerald-300 transition-colors hover:border-emerald-400 hover:text-emerald-200"
      >
        Read case study
        <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>

      {/* Decorative corner accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-emerald-500/10 blur-2xl transition-opacity duration-500 group-hover:bg-emerald-500/20"
      />
    </motion.article>
  );
}

export function CaseStudies() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          {"// Case studies"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
          Real results from real scans
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Anonymized outcomes from teams who replaced manual pentests with GuardianX.
          Metrics count up as you scroll into view.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {CASES.map((study, i) => (
          <CaseCard key={study.companyType} study={study} index={i} />
        ))}
      </div>
    </section>
  );
}
