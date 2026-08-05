"use client";

import { motion } from "framer-motion";
import { Code2, Route, ShieldCheck, Bug } from "lucide-react";
import { useCountUp, formatInt } from "./use-count-up";

interface StatItem {
  target: number;
  label: string;
  suffix?: string;
  Icon: typeof Code2;
  color: string;
  accent: string;
}

const STATS: StatItem[] = [
  { target: 55000, label: "Lines of Code", Icon: Code2, color: "text-emerald-400", accent: "border-emerald-500/30" },
  { target: 143, label: "API Routes", Icon: Route, color: "text-cyan-400", accent: "border-cyan-500/30" },
  { target: 39, label: "Patches Generated", suffix: "+", Icon: ShieldCheck, color: "text-violet-400", accent: "border-violet-500/30" },
  { target: 7, label: "Vulns Found (live demo)", Icon: Bug, color: "text-red-400", accent: "border-red-500/30" },
];

function StatCell({ stat, index }: { stat: StatItem; index: number }) {
  const [ref, value] = useCountUp(stat.target, {
    duration: 1800,
    delay: index * 150,
  });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={`holo-card-sharp hud-corners relative overflow-hidden p-5 text-center border ${stat.accent}`}
    >
      <stat.Icon className={`mx-auto mb-2 size-6 ${stat.color}`} />
      <div className={`text-3xl font-bold tabular-nums sm:text-4xl ${stat.color}`}>
        {formatInt(value)}
        {stat.suffix}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {stat.label}
      </div>
      {/* Underline accent */}
      <div
        className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-gradient-to-r from-transparent via-current to-transparent transition-transform duration-700"
        style={{ color: "currentColor" }}
        data-anim="underline"
      />
    </motion.div>
  );
}

export function StatsStrip() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
          {"// By the numbers"}
        </div>
        <h2 className="text-2xl font-bold text-zinc-50">A platform built at scale</h2>
      </div>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08 } },
        }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {STATS.map((s, i) => (
          <StatCell key={s.label} stat={s} index={i} />
        ))}
      </motion.div>
    </section>
  );
}
