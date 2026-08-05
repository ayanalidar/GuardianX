"use client";

import { motion } from "framer-motion";
import { Upload, Brain, Bug, ShieldCheck, FileCheck2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Step {
  icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
  accent: string;
  glow: string;
}

const STEPS: Step[] = [
  {
    icon: Upload,
    title: "1 · Upload Code",
    desc: "Connect a Git repo or paste source. AES-256-GCM encrypted credentials.",
    color: "text-cyan-400",
    accent: "border-cyan-500/40",
    glow: "shadow-[0_0_24px_rgba(6,182,212,0.25)]",
  },
  {
    icon: Brain,
    title: "2 · AI Analyzes",
    desc: "AI reads every line, maps CVEs/CWEs, scores confidence per finding.",
    color: "text-violet-400",
    accent: "border-violet-500/40",
    glow: "shadow-[0_0_24px_rgba(139,92,246,0.25)]",
  },
  {
    icon: Bug,
    title: "3 · Vulnerabilities Found",
    desc: "Real, exploitable vulns with PoC exploits generated and verified.",
    color: "text-red-400",
    accent: "border-red-500/40",
    glow: "shadow-[0_0_24px_rgba(239,68,68,0.25)]",
  },
  {
    icon: ShieldCheck,
    title: "4 · Auto-Patch Generated",
    desc: "AI writes the fix, sandbox-tests it, runs adversarial arena until safe.",
    color: "text-emerald-400",
    accent: "border-emerald-500/40",
    glow: "shadow-[0_0_24px_rgba(16,185,129,0.25)]",
  },
  {
    icon: FileCheck2,
    title: "5 · Attested & Compliant",
    desc: "Hash-chained into SHA-256 ledger, DPDPA/SOC2 evidence auto-collected.",
    color: "text-teal-400",
    accent: "border-teal-500/40",
    glow: "shadow-[0_0_24px_rgba(20,184,166,0.25)]",
  },
];

/**
 * HowItWorks
 * ----------
 * 5-step horizontal pipeline (vertical on mobile) with animated data
 * "packets" flowing between nodes (circuit-board style).
 */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-violet-500/60">
          {"// How it works"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">From code to attested patch in 5 steps</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Fully autonomous loop. No human in the middle until final approval.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="relative flex flex-col items-center">
              {/* Connector line + flowing packet (desktop only, between nodes) */}
              {i < STEPS.length - 1 && (
                <div className="absolute left-[60%] top-9 hidden h-px w-[80%] lg:block">
                  <div className="h-full w-full bg-gradient-to-r from-zinc-700 via-zinc-700 to-transparent" />
                  {/* Flowing packet */}
                  <motion.div
                    className="absolute -top-[3px] size-2 rounded-full"
                    style={{ background: "#34d399", boxShadow: "0 0 8px #34d399, 0 0 16px #34d399" }}
                    initial={{ left: "0%", opacity: 0 }}
                    animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      delay: i * 0.4,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              )}

              {/* Node */}
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className={`relative flex size-20 items-center justify-center rounded-full border-2 bg-zinc-950 ${step.accent} ${step.glow}`}
              >
                {/* Rotating ring */}
                <motion.div
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-dashed border-zinc-700"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                />
                <Icon className={`size-8 ${step.color}`} />
                {/* Pulse */}
                <motion.div
                  aria-hidden
                  className={`absolute inset-0 rounded-full border ${step.accent}`}
                  animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: i * 0.3 }}
                />
              </motion.div>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 + 0.2 }}
                className={`mt-4 text-center text-sm font-bold ${step.color}`}
              >
                {step.title}
              </motion.h3>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 + 0.3 }}
                className="mt-1 text-center text-[11px] leading-relaxed text-zinc-500"
              >
                {step.desc}
              </motion.p>
            </div>
          );
        })}
      </div>

      {/* Mobile vertical connectors */}
      <div className="mt-6 lg:hidden">
        <div className="mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
      </div>
    </section>
  );
}
