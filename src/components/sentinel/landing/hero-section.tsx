"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Film, Terminal, Zap } from "lucide-react";
import { GuardianXLogo } from "../guardianx-logo";
import { ParticleNetworkBackground } from "./particle-bg";
import { GlowOrb } from "./glow-orb";
import { TerminalTyping } from "./terminal-typing";
import { GlowCTA } from "./glow-cta";
import { useCountUp, formatInt } from "./use-count-up";

/**
 * HeroSection
 * -----------
 * Cinematic hero with:
 *  - Mouse-reactive particle network background
 *  - Pulsing multi-layer glow orb behind the GuardianX logo
 *  - Animated threat counter ("vulnerabilities found this month")
 *  - Live-scan terminal that types a real exploit + patch sequence
 *  - CTA buttons with hover glow + click-particle emission
 */
export function HeroSection({
  onEnter,
  onTryDemo,
}: {
  onEnter: () => void;
  onTryDemo: () => void;
}) {
  const [counterRef, counterVal] = useCountUp(2847, { duration: 2400, delay: 600 });

  return (
    <section className="relative isolate overflow-hidden px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      {/* Particle network bg, contained to this section */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <ParticleNetworkBackground density={70} />
      </div>

      {/* Center stage: glow orb behind logo */}
      <div className="relative mx-auto flex max-w-6xl flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 neon-border">
            <Zap className="size-3" />
            Autonomous Security Operations Platform
          </Badge>
          <h1 className="mx-auto max-w-4xl text-center text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
            Security that{" "}
            <span className="neon-emerald">thinks</span>,{" "}
            <span className="neon-red">attacks</span>, and{" "}
            <span className="neon-violet">heals itself</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-center text-base text-zinc-400 sm:text-lg">
            The first platform to close the loop from code to live target to patch to report —
            all AI-driven. Autonomous SAST, DAST, exploit generation, adversarial patching,
            behavioral defense, virtual patching, and a self-improving R&D lab.
          </p>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <GlowCTA onClick={onEnter} variant="solid">
            <Terminal className="size-5" />
            Enter the Lab Console
            <ArrowRight className="size-4" />
          </GlowCTA>
          <GlowCTA onClick={onTryDemo} variant="outline">
            <Film className="size-5" />
            Try Demo
          </GlowCTA>
          <GlowCTA href="#features" variant="outline">
            Explore 50+ Modules
          </GlowCTA>
        </motion.div>

        {/* Threat counter + terminal */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-16 grid w-full max-w-5xl gap-4 lg:grid-cols-[1.1fr_1.4fr]"
        >
          {/* Threat counter */}
          <div
          ref={counterRef}
          className="holo-card-sharp hud-corners relative overflow-hidden p-6"
          >
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-red-400/80">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </span>
              Live threat counter
            </div>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={Math.round(counterVal)}
                className="text-4xl font-bold tabular-nums neon-red sm:text-5xl"
              >
                {formatInt(counterVal)}
              </motion.span>
              <span className="text-sm font-mono text-zinc-500">+ this month</span>
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              Vulnerabilities found across all GuardianX engagements this month.
            </div>
            {/* Mini trend bars */}
            <div className="mt-4 flex h-12 items-end gap-1">
              {Array.from({ length: 18 }).map((_, i) => {
                const h = 20 + ((i * 37) % 80);
                return (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.6, delay: 0.8 + i * 0.04 }}
                    className="flex-1 rounded-sm bg-gradient-to-t from-red-500/30 to-red-400/80"
                  />
                );
              })}
            </div>
          </div>

          {/* Terminal */}
          <div className="holo-card-sharp hud-corners relative overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">
                <Terminal className="size-3" /> Live scan in progress
              </span>
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500/70" />
                <span className="size-2 rounded-full bg-amber-500/70" />
                <span className="size-2 rounded-full bg-emerald-500/70" />
              </div>
            </div>
            <TerminalTyping />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-zinc-800/80 pt-2 font-mono text-[9px] text-zinc-500 sm:text-[10px]">
              <span className="text-emerald-400/80">● agent: redagent-1</span>
              <span className="text-cyan-400/80">sandbox: running</span>
              <span className="text-violet-400/80">attestation: pending</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
