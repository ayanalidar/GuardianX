"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Code2, Terminal } from "lucide-react";
import { FEATURES, type Feature } from "./features-data";
import { TiltCard } from "./tilt-card";

/**
 * FeatureCardScan
 * ---------------
 * The "mini animation" that appears on hover: a tiny code window with
 * a highlight sweep scanning through lines, finding a vuln, then patching.
 */
function FeatureCardScan({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="relative mb-3 overflow-hidden rounded-md border border-zinc-800 bg-black/70 p-2 font-mono text-[10px] leading-snug">
      <div className="mb-1 flex items-center gap-1 text-zinc-600">
        <Icon className={`size-3 ${feature.color}`} />
        <span>scan.js</span>
        <span className="ml-auto size-1.5 rounded-full bg-emerald-500/70" />
      </div>
      <div className="space-y-0.5">
        <div className="text-zinc-500">{"function login(user, pass) {"}</div>
        <div className="text-zinc-400">{"  const q = `SELECT * FROM users`"}</div>
        <div className="text-zinc-400">{"  return db.query(q);"}</div>
        <div className="text-zinc-500">{"}"}</div>
      </div>
      {/* Sweep highlight */}
      <div className="feature-sweep pointer-events-none absolute inset-x-0 top-0 h-12 -translate-x-full bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent group-hover:animate-[feature-sweep_1.8s_ease-in-out_infinite]" />
      {/* Patched badge */}
      <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
        <Sparkles className="size-2.5" /> patched: parameterized query
      </div>
    </div>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
      className="[transform-style:preserve-3d]"
    >
      <TiltCard className={`group h-full rounded-md border ${feature.border} ${feature.bg} ${feature.glow} transition-shadow duration-300`}>
        {/* Cursor-follow glow border */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(16,185,129,0.10), transparent 65%)",
          }}
        />
        <div className="relative p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className={`flex size-10 items-center justify-center rounded-lg border ${feature.border} bg-zinc-950/60`} style={{ transform: "translateZ(40px)" }}>
              <Icon className={`size-5 ${feature.color}`} />
            </div>
            <Badge variant="outline" className={`border-zinc-700 bg-zinc-900/50 text-[9px] uppercase tracking-wider ${feature.color}`}>
              {feature.category}
            </Badge>
          </div>
          <h3 className={`text-sm font-bold ${feature.color}`} style={{ transform: "translateZ(30px)" }}>
            {feature.title}
          </h3>
          <div className="mt-1.5 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-40 group-hover:opacity-100">
            <FeatureCardScan feature={feature} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{feature.desc}</p>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <Code2 className="size-3" /> {"// Capabilities"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">Everything you need to secure your code</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          <span className="neon-emerald text-emerald-400 font-bold">50+ integrated modules</span> across SAST, DAST,
          AI autonomy, active defense, R&D engineering, and multi-tenant operations. Hover any card to see it in action.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <a
          href="/features"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          <Terminal className="size-4" /> See all 50+ modules
        </a>
      </div>
    </section>
  );
}
