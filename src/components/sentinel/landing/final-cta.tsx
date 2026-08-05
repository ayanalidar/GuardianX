"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldHalf, Terminal, ArrowRight, Users, Activity } from "lucide-react";
import { GlowCTA } from "./glow-cta";

/**
 * FinalCTA
 * --------
 * Full-width gradient banner with animated background + users-online counter.
 */
export function FinalCTA({ onEnter }: { onEnter: () => void }) {
  const [users, setUsers] = useState(1247);

  useEffect(() => {
    const t = setInterval(() => {
      // Fluctuate between 1100 and 1500, never exactly the same
      setUsers((u) => {
        const delta = Math.floor(Math.random() * 21) - 10;
        const next = u + delta;
        return Math.max(1100, Math.min(1500, next));
      });
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative isolate overflow-hidden px-4 py-20 sm:px-6">
      {/* Animated gradient banner background */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      >
        <div className="final-cta-bg absolute inset-0" />
        {/* Moving conic accent */}
        <motion.div
          className="absolute inset-0 opacity-30 mix-blend-screen"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(16,185,129,0.3) 60deg, transparent 120deg, transparent 240deg, rgba(139,92,246,0.3) 300deg, transparent 360deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
        {/* Cyber grid overlay */}
        <div className="cyber-grid absolute inset-0 opacity-30" />
      </motion.div>

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
        >
          <ShieldHalf className="mx-auto size-14 text-emerald-400 neon-emerald" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-4 text-3xl font-bold tracking-tight text-zinc-50 sm:text-5xl"
        >
          Ready to secure your code?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto mt-3 max-w-xl text-base text-zinc-300"
        >
          Launch the GuardianX console. Scan code, attack live targets, generate patches,
          and export professional VAPT reports — all in one autonomous platform.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <GlowCTA onClick={onEnter} variant="solid" className="!px-8 !py-3.5 !text-base">
            <Terminal className="size-5" />
            Enter Lab Console
            <ArrowRight className="size-4" />
          </GlowCTA>
        </motion.div>

        {/* Users online + live status */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <Users className="size-3.5" />
            <span className="font-mono tabular-nums">{users.toLocaleString("en-US")}</span>
            <span className="text-emerald-300/70">analysts online now</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300">
            <Activity className="size-3.5" />
            <span className="font-mono">7-day uptime 99.97%</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
