"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal, Activity, ShieldCheck, Brain } from "lucide-react";

/* ════════════════════════════════════════════════════════════════════
   AnimatedDemo, live, in-action marketing demo for the landing page.
   4 cards, all animating in real time:
     1. Terminal: lines appear one-by-one, cycling through exploit sequences
     2. Pipeline: 7 stages light up sequentially (active → completed)
     3. KPIs: numbers count up from 0, then fluctuate slightly
     4. AI Briefing: alerts slide in one by one
   Each card has a neon shine sweep overlay (like the logo).
   ════════════════════════════════════════════════════════════════════ */

// ── Terminal sequences (cycled) ─────────────────────────────────────────
const TERMINAL_SEQUENCES: { text: string; type: "cmd" | "out" | "err" | "success" | "warn" }[][] = [
  [
    { text: "$ redagent --target https://app.acme.com --mode aggressive", type: "cmd" },
    { text: "[*] Crawling endpoints...", type: "out" },
    { text: "[+] Found 42 endpoints across 3 paths", type: "success" },
    { text: "[*] Testing SQL injection on /api/login...", type: "out" },
    { text: "[!] VULNERABLE: SQL injection confirmed", type: "err" },
    { text: "[*] Payload: ' OR 1=1-- bypassed auth", type: "warn" },
    { text: "[+] Exploit confirmed, finding saved as F-001", type: "success" },
    { text: "[*] Generating AI patch...", type: "out" },
    { text: "[+] Patch SP-2026-ACM-001 | Sandbox: PASSED", type: "success" },
    { text: "[✓] Safe to deploy, patch attested on-chain", type: "success" },
  ],
  [
    { text: "$ guardianx sast --codebase payment-api.js", type: "cmd" },
    { text: "[*] AI analyzing 2,847 lines of source code...", type: "out" },
    { text: "[!] CWE-532: Stripe key logged in error handler", type: "err" },
    { text: "[!] CWE-79: Reflected XSS in search endpoint", type: "err" },
    { text: "[*] Generating patches with adversarial testing...", type: "out" },
    { text: "[+] 2 patches generated, sandbox-tested, ready", type: "success" },
    { text: "[+] Exploit PoC proven, patches block both vectors", type: "success" },
  ],
  [
    { text: "$ redagent --sweep --target https://erp.initech.io", type: "cmd" },
    { text: "[*] Scanning for sensitive data exposure...", type: "out" },
    { text: "[!] CRITICAL: /.env exposed, DB_PASSWORD=****", type: "err" },
    { text: "[+] .git/config exposed, repo clone possible", type: "warn" },
    { text: "[*] Deploying canary tokens across 22 endpoints...", type: "out" },
    { text: "[+] 3 canaries planted, exfil defense active", type: "success" },
    { text: "[+] Sweep complete: 3 exposures, 3 patched", type: "success" },
  ],
];

const COLOR_MAP: Record<string, string> = {
  cmd: "text-emerald-400",
  out: "text-zinc-400",
  err: "text-red-400",
  success: "text-emerald-300",
  warn: "text-amber-400",
};

// ── Terminal Card ───────────────────────────────────────────────────────
function TerminalDemo({ active }: { active: boolean }) {
  const [seqIndex, setSeqIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentSeq = TERMINAL_SEQUENCES[seqIndex];

  useEffect(() => {
    if (!active) return;
    // Reset visible lines when sequence changes
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= currentSeq.length) {
          // Wait 2.5s then move to next sequence
          setTimeout(() => {
            setSeqIndex((i) => (i + 1) % TERMINAL_SEQUENCES.length);
          }, 2500);
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 650);
    return () => clearInterval(interval);
  }, [seqIndex, currentSeq.length, active]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="demo-card holo-card-sharp hud-corners p-4"
    >
      <div className="demo-shine" aria-hidden />
      <div className="relative z-10">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
            <Terminal className="size-3" /> Live Exploit Terminal
          </span>
          <div className="relative h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
            <div className="scan-bar absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
          </div>
        </div>
        <div
          ref={scrollRef}
          className="custom-scrollbar h-52 overflow-y-auto rounded-lg border border-zinc-800 bg-black/80 p-3 font-mono text-[10px] leading-relaxed"
        >
          {currentSeq.slice(0, visibleCount).map((line, i) => (
            <div key={`${seqIndex}-${i}`} className="term-line flex gap-1.5" style={{ animationDelay: `${i * 0.02}s` }}>
              <span className="shrink-0 text-zinc-700">
                {new Date(Date.now() - (visibleCount - i) * 650).toLocaleTimeString("en-US", { hour12: false })}
              </span>
              <span className={`${COLOR_MAP[line.type]} break-all`}>{line.text}</span>
            </div>
          ))}
          {visibleCount > 0 && visibleCount < currentSeq.length && (
            <span className="animate-pulse text-emerald-400">█</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Pipeline Card ───────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { stage: "Onboard", color: "emerald" },
  { stage: "Scan", color: "cyan" },
  { stage: "Test", color: "amber" },
  { stage: "Patch", color: "violet" },
  { stage: "Verify", color: "sky" },
  { stage: "Defend", color: "rose" },
  { stage: "Comply", color: "emerald" },
];

const STAGE_LABELS: Record<number, string> = {
  0: "✓ Assets loaded",
  1: "✓ 26 vulns found",
  2: "✓ 6 exploits confirmed",
  3: "⚡ 13 patches generated",
  4: "○ Pending",
  5: "○ Pending",
  6: "○ Pending",
};

function PipelineDemo({ active }: { active: boolean }) {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % (PIPELINE_STAGES.length + 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="demo-card holo-card-sharp hud-corners p-4"
    >
      <div className="demo-shine" aria-hidden />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70">
          <Activity className="size-3" /> 7-Stage Pipeline
        </div>
        <div className="space-y-2">
          {PIPELINE_STAGES.map((s, i) => {
            const isCompleted = i < activeStage;
            const isActive = i === activeStage;
            const isPending = i > activeStage;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded border p-2 transition-all duration-300 ${
                  isCompleted
                    ? `border-${s.color}-500/30 bg-${s.color}-500/10`
                    : isActive
                      ? `stage-active border-${s.color}-500/50 bg-${s.color}-500/15`
                      : "border-zinc-800 bg-zinc-900/30"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    isCompleted || isActive
                      ? `bg-${s.color}-500/30 text-${s.color}-300`
                      : "bg-zinc-800 text-zinc-600"
                  }`}
                >
                  {isCompleted ? "✓" : i + 1}
                </span>
                <span className={`text-xs font-medium ${isCompleted || isActive ? "text-zinc-100" : "text-zinc-500"}`}>
                  {s.stage}
                </span>
                <span
                  className={`ml-auto text-[10px] ${
                    isCompleted || isActive ? `text-${s.color}-400` : "text-zinc-600"
                  }`}
                >
                  {isActive ? "● Running..." : STAGE_LABELS[i] || "○ Pending"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────
const KPI_TARGETS = [
  { label: "CLIENTS", target: 7, color: "text-emerald-400" },
  { label: "ACTIVE", target: 4, color: "text-cyan-400" },
  { label: "PATCHES", target: 26, color: "text-violet-400" },
  { label: "CRITICAL", target: 3, color: "text-red-400" },
];

function useCountUp(target: number, duration = 1200, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now() + delay;
    let raf: number;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - start);
      const progress = Math.min(elapsed / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

function KpiDemo({ active }: { active: boolean }) {
  // Cycle re-trigger every 8s so the count-up replays
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setCycle((c) => c + 1), 8000);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="demo-card holo-card-sharp hud-corners p-4"
    >
      <div className="demo-shine" aria-hidden />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
          <ShieldCheck className="size-3" /> Real-Time KPIs
        </div>
        <div className="grid grid-cols-4 gap-2">
          {KPI_TARGETS.map((k, i) => (
            <KpiCell key={`${cycle}-${i}`} target={k.target} label={k.label} color={k.color} delay={i * 150} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function KpiCell({ target, label, color, delay }: { target: number; label: string; color: string; delay: number }) {
  const value = useCountUp(target, 1200, delay);
  return (
    <div className="kpi-pop rounded border border-zinc-800 bg-zinc-900/40 p-2 text-center" style={{ animationDelay: `${delay}ms` }}>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[8px] font-mono uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}

// ── AI Briefing Card ─────────────────────────────────────────────────────
const AI_ALERTS = [
  { icon: "🔴", text: "Initech and Stark each have 1 critical finding, prioritize remediation", color: "red" },
  { icon: "🟡", text: "Wayne Enterprises unauthorized, validate access urgently", color: "amber" },
  { icon: "🟢", text: "Globex is actively patching (8 pending), monitor progress", color: "emerald" },
  { icon: "🔵", text: "Hooli reached COMPLIANT status, DPDPA + GDPR certified", color: "sky" },
];

function AiBriefingDemo({ active }: { active: boolean }) {
  const [visibleAlerts, setVisibleAlerts] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setVisibleAlerts((prev) => {
        if (prev >= AI_ALERTS.length) {
          // Reset after showing all (with a pause)
          setTimeout(() => setVisibleAlerts(0), 3000);
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="demo-card holo-card-sharp hud-corners p-4"
    >
      <div className="demo-shine" aria-hidden />
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">
          <Brain className="size-3" /> AI Threat Briefing
        </div>
        <div className="space-y-2">
          {AI_ALERTS.slice(0, visibleAlerts).map((alert, i) => (
            <div
              key={i}
              className={`alert-slide rounded border border-${alert.color}-500/20 bg-${alert.color}-500/5 p-2 text-xs text-${alert.color}-300`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {alert.icon} {alert.text}
            </div>
          ))}
          {visibleAlerts === 0 && (
            <div className="py-4 text-center text-[10px] text-zinc-600">
              <Brain className="mx-auto size-4 animate-pulse text-violet-500/50" />
              <p className="mt-1">AI analyzing threats...</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main exported component ──────────────────────────────────────────────
export function AnimatedDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(true);

  // Gate all four child animations on section visibility + document visibility.
  // Without this, 4 simultaneous `setInterval`s churn React state forever,
  // even when the section is far below the fold.
  useEffect(() => {
    let inViewport = true;
    let docVisible = !document.hidden;
    const update = () => setActive(inViewport && docVisible);

    const onVisibility = () => {
      docVisible = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (sectionRef.current && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry) {
            inViewport = entry.isIntersecting;
            update();
          }
        },
        { threshold: 0.1 },
      );
      io.observe(sectionRef.current);
    } else {
      update();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      style={{ contentVisibility: "auto", containIntrinsicSize: "600px" }}
    >
      <div className="mb-10 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
          {"// Live Command Center"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50">See it in action</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Real-time exploit terminal, network topology, threat radar, and AI threat briefing, all in one dashboard.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TerminalDemo active={active} />
        <PipelineDemo active={active} />
        <KpiDemo active={active} />
        <AiBriefingDemo active={active} />
      </div>
    </section>
  );
}
