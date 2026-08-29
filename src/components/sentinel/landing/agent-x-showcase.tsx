"use client";

/**
 * AgentXShowcase
 * --------------
 * Cinematic landing-page section showcasing Agent X — the always-on
 * conversational AI agent that runs the entire GuardianX platform by
 * voice or text.
 *
 * Visual identity:
 *   - Dark glass card with hud-corners + circuit-board accent
 *   - Floating "AGENT X" header with pulsing emerald dot
 *   - Live conversation preview (typewriter effect cycling through
 *     example exchanges)
 *   - 6 capability chips below
 *   - "Activate Agent X" CTA → onEnter (enters the lab console where
 *     the user can click the AGENT X button in the dashboard header)
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Mic,
  Radio,
  Sparkles,
  Brain,
  Navigation,
  ShieldCheck,
  Activity,
  ArrowRight,
  Volume2,
} from "lucide-react";
import { GlowCTA } from "./glow-cta";

// ── Example exchanges (typewriter-cycled in the preview) ────────────────────
const EXCHANGES: Array<{ user: string; agent: string }> = [
  {
    user: "Hey Agent X — what's our security posture?",
    agent: "Good evening, Ayan. Your posture is 87/100 (grade B+). You have 3 critical findings in the CyberShield client. Want me to brief you?",
  },
  {
    user: "Show me the quantum scanner",
    agent: "Taking you to the Quantum-Readiness Scanner. I'll scan your code for crypto vulnerable to Shor's algorithm.",
  },
  {
    user: "Explain SQL injection",
    agent: "SQL injection (CWE-89) happens when user input is concatenated into a SQL query. An attacker can read any table or bypass auth. Remediation: parameterized queries.",
  },
  {
    user: "Approve patch SP-2026-0042",
    agent: "Approved. Patch SP-2026-0042 is now applied + hash-chained into the attestation ledger. Your posture improved to 91/100.",
  },
  {
    user: "What should I do next?",
    agent: "Based on your posture, I recommend: 1. Run a DAST engagement on the auth endpoint. 2. Review the 2 unpatched SQL injections in payment-handler.js. 3. Enable 2FA on your admin account.",
  },
];

const CAPABILITIES = [
  { icon: Mic, label: "Always-on voice", desc: "Continuous listening — no mic tap per command" },
  { icon: Volume2, label: "Talks back", desc: "TTS with a sophisticated SOC analyst voice" },
  { icon: Brain, label: "Full platform knowledge", desc: "Knows all 60+ modules + 23 tabs" },
  { icon: Navigation, label: "Navigates everything", desc: "Switch tabs, open War Room, start scans" },
  { icon: ShieldCheck, label: "Executes actions", desc: "Approves patches, runs scans, writes attestations" },
  { icon: Activity, label: "Proactive monitoring", desc: "Speaks up when new threats appear" },
];

export function AgentXShowcase({ onEnter }: { onEnter: () => void }) {
  const [exchangeIdx, setExchangeIdx] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTypingAgent, setIsTypingAgent] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = EXCHANGES[exchangeIdx];

  // Typewriter effect — cycles through user → agent → next exchange.
  useEffect(() => {
    let charIdx = 0;
    let phase: "user" | "pause1" | "agent" | "pause2" = "user";
    setTypedText("");
    setIsTypingAgent(false);

    const tick = () => {
      if (phase === "user") {
        if (charIdx <= current.user.length) {
          setTypedText(current.user.slice(0, charIdx));
          charIdx++;
          timerRef.current = setTimeout(tick, 28);
        } else {
          phase = "pause1";
          timerRef.current = setTimeout(tick, 600);
        }
      } else if (phase === "pause1") {
        setIsTypingAgent(true);
        setTypedText("");
        charIdx = 0;
        phase = "agent";
        timerRef.current = setTimeout(tick, 200);
      } else if (phase === "agent") {
        if (charIdx <= current.agent.length) {
          setTypedText(current.agent.slice(0, charIdx));
          charIdx++;
          timerRef.current = setTimeout(tick, 22);
        } else {
          phase = "pause2";
          timerRef.current = setTimeout(tick, 2500);
        }
      } else {
        // Move to next exchange
        setExchangeIdx((i) => (i + 1) % EXCHANGES.length);
        setIsTypingAgent(false);
      }
    };

    timerRef.current = setTimeout(tick, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [exchangeIdx, current.user, current.agent]);

  return (
    <section className="relative isolate overflow-hidden px-4 py-20 sm:px-6">
      {/* Background: emerald + cyan ambient glow + circuit grid */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 cyber-grid opacity-20" />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
            <Sparkles className="size-3" />
            Meet Agent X
            <span className="ml-1 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">NEW</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            Your <span className="neon-emerald">autonomous</span> SOC analyst
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Talk to GuardianX by voice or text. Agent X has full knowledge of every module,
            navigates the entire platform, executes actions, and proactively monitors your
            security posture — available full-time once activated.
          </p>
        </motion.div>

        {/* Main showcase card: conversation preview + capability chips */}
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Conversation preview */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-5 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/10">
                    <Bot className="size-5 text-emerald-400" />
                  </div>
                  <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-emerald-500 pulse-dot" />
                </div>
                <div>
                  <div className="font-mono text-sm font-bold text-emerald-300 neon-emerald">AGENT X</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-emerald-500/60">Autonomous SOC · ACTIVE</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1">
                <Radio className="size-3 text-emerald-400 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-300">LISTENING</span>
              </div>
            </div>

            {/* Conversation body */}
            <div className="min-h-[180px] space-y-3">
              {/* User bubble */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {!isTypingAgent ? (
                    <span className="font-mono">{typedText}<span className="animate-pulse">▊</span></span>
                  ) : (
                    <span className="font-mono text-zinc-500">{current.user}</span>
                  )}
                </div>
              </div>

              {/* Agent bubble */}
              <AnimatePresence mode="wait">
                {isTypingAgent && (
                  <motion.div
                    key={exchangeIdx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">
                      {typedText ? (
                        <span className="font-mono">{typedText}<span className="animate-pulse">▊</span></span>
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-500">
                          <span className="size-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-emerald-400" />
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Status bar */}
            <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
              <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                <Mic className="size-3 text-emerald-400" />
                <span>Press 'X' to activate · No mic tap per command</span>
              </div>
              <div className="flex items-center gap-1">
                <Volume2 className="size-3 text-cyan-400" />
                <span className="font-mono text-[10px] text-cyan-300">TTS ON</span>
              </div>
            </div>
          </motion.div>

          {/* Capability chips */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col gap-3"
          >
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={cap.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
                className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-emerald-500/40"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                  <cap.icon className="size-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{cap.label}</div>
                  <div className="text-xs text-zinc-400">{cap.desc}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 text-center"
        >
          <GlowCTA onClick={onEnter} variant="solid" className="!px-8 !py-3.5 !text-base">
            <Bot className="size-5" />
            Activate Agent X in the Lab
            <ArrowRight className="size-4" />
          </GlowCTA>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Click "AGENT X" in the dashboard header · or press 'X'
          </p>
        </motion.div>
      </div>
    </section>
  );
}
