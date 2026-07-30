"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldHalf,
  Crosshair,
  Swords,
  FileCode2,
  KeyRound,
  Gauge,
  Gavel,
  Globe,
  Wand2,
  Heart,
  Link2,
  FileText,
  ArrowRight,
  Terminal,
  Zap,
  Lock,
  Activity,
  Bug,
  ShieldCheck,
  Cpu,
  Database,
  ScanLine,
} from "lucide-react";

interface LandingPageProps {
  onEnter: () => void;
}

const FEATURES = [
  {
    icon: Bug,
    title: "AI Vulnerability Detection",
    category: "SAST",
    desc: "AI reads your source code and identifies real, exploitable vulnerabilities with CVE/CWE mapping, confidence scores, and the exact vulnerable snippet.",
    color: "text-red-400",
    border: "border-red-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]",
  },
  {
    icon: Crosshair,
    title: "PoC Exploit Playground",
    category: "Exploit",
    desc: "For every vulnerability, the AI generates a working proof-of-concept exploit. Run it against the original code to prove the vuln is real, then against the patched code to prove the fix works.",
    color: "text-orange-400",
    border: "border-orange-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]",
  },
  {
    icon: Swords,
    title: "Adversarial Red-Team Arena",
    category: "Self-Attack",
    desc: "After patching, a second AI persona attacks its own fix. If it finds a bypass, the defender iterates. Loop until the attacker concedes — the patch is battle-tested before human review.",
    color: "text-amber-400",
    border: "border-amber-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]",
  },
  {
    icon: Crosshair,
    title: "RedAgent VAPT Engine",
    category: "DAST",
    desc: "Autonomous penetration testing against live targets. The AI crawls the app, plans category-appropriate attacks, fires real HTTP payloads, and confirms exploitation with full evidence.",
    color: "text-red-400",
    border: "border-red-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]",
  },
  {
    icon: ScanLine,
    title: "Sensitive Data Exposure Scanner",
    category: "Secrets",
    desc: "Systematically detects exposed AWS/Stripe/GitHub keys, JWTs, private keys, passwords, SSNs, and credit cards. Probes 22+ known exposure paths. All samples redacted — proves the leak without exfiltrating.",
    color: "text-purple-400",
    border: "border-purple-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]",
  },
  {
    icon: FileText,
    title: "Professional VAPT Reports",
    category: "Reporting",
    desc: "Generate a 15-page PDF VAPT report with front page, TOC, document control, executive summary, methodology, findings master table, detailed PoC evidence, compliance mapping, and cleanup certificate.",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]",
  },
  {
    icon: KeyRound,
    title: "Encrypted Git Integration",
    category: "Credentials",
    desc: "Connect real private repos with AES-256-GCM encrypted credentials. Tokens are encrypted at rest, never shown again, never leaked in logs. Clone, explore, and import files for scanning.",
    color: "text-sky-400",
    border: "border-sky-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]",
  },
  {
    icon: Gauge,
    title: "PostureScore",
    category: "Metrics",
    desc: "A 0–100 security credit score per codebase, computed from open vulns, sandbox pass rates, and adversarial win rates. Letter grades A–F. Trend over time. Exec-friendly at-a-glance posture.",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]",
  },
  {
    icon: Globe,
    title: "Continuous Threat Intel",
    category: "Live Feed",
    desc: "Monitors live CVE disclosures via web search and cross-references them against your codebases. New 0-day for a lib you use? GuardianX flags it high-relevance before you've heard of it.",
    color: "text-cyan-400",
    border: "border-cyan-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]",
  },
  {
    icon: Wand2,
    title: "AI Remediation Copilot",
    category: "Copilot",
    desc: "Inside every patch: ask the AI to explain the fix, generate an improved production-ready version, or produce a hardened defense-in-depth variant with input validation and rate limiting.",
    color: "text-violet-400",
    border: "border-violet-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]",
  },
  {
    icon: Heart,
    title: "Self-Healing Runtime",
    category: "Runtime",
    desc: "Live runtime monitoring tracks which functions are vulnerable vs healed. One-click hot-swap deploys a patched function at runtime with zero downtime. Auto-heal when an attack is detected.",
    color: "text-rose-400",
    border: "border-rose-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(244,63,94,0.15)]",
  },
  {
    icon: Link2,
    title: "Cryptographic Patch Attestation",
    category: "Trust",
    desc: "Every approved patch is hash-chained into an immutable SHA-256 ledger. Tamper-evident: any modification to a past attestation breaks every subsequent hash. Enterprise-grade audit trail.",
    color: "text-teal-400",
    border: "border-teal-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(20,184,166,0.15)]",
  },
  {
    icon: Gavel,
    title: "DPDPA & Multi-Framework Compliance",
    category: "GRC",
    desc: "Map every finding to DPDPA 2023, GDPR, HIPAA, PCI-DSS, ISO 27001, and SOC 2. Track section-level compliance, generate audit reports, and auto-draft 72-hour breach notifications.",
    color: "text-purple-400",
    border: "border-purple-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]",
  },
  {
    icon: Lock,
    title: "Data Privacy Scanner",
    category: "Privacy",
    desc: "Detect PII collection without consent, plaintext password storage, cross-border data transfer risks, and data retention violations — all mapped to specific DPDPA sections.",
    color: "text-indigo-400",
    border: "border-indigo-500/30",
    glow: "hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]",
  },
];

const PIPELINE_STEPS = [
  { icon: FileCode2, label: "Analyze", desc: "AI scans source code" },
  { icon: Crosshair, label: "Exploit", desc: "Generate + verify PoC" },
  { icon: ShieldCheck, label: "Patch", desc: "AI writes the fix" },
  { icon: Swords, label: "Attack", desc: "Red-team tries to break it" },
  { icon: ShieldCheck, label: "Defend", desc: "Iterate until secure" },
  { icon: Bug, label: "Review", desc: "Human approves" },
];

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Matrix rain background */}
      <MatrixRainBG />

      {/* Ambient glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-700/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-red-700/5 blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <nav className="sticky top-0 z-30 border-b border-emerald-500/15 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <img src="/guardianx-logo.png" alt="GuardianX" className="size-9 rounded-lg object-contain neon-border" />
              <span className="text-lg font-bold tracking-tight text-zinc-50 neon-emerald">
                Guardian<span className="text-emerald-400">X</span>
              </span>
            </div>
            <div className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
              <a href="#features" className="transition-colors hover:text-emerald-400">Features</a>
              <a href="#pipeline" className="transition-colors hover:text-emerald-400">Pipeline</a>
              <a href="#contact" className="transition-colors hover:text-emerald-400">Contact</a>
            </div>
            <Button onClick={onEnter} className="bg-emerald-600 text-white hover:bg-emerald-500">
              <Terminal className="size-4" />
              Enter Lab
            </Button>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Sparkles className="size-3" />
              Autonomous Security Operations Platform
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
              Security that{" "}
              <span className="neon-emerald text-emerald-400">thinks</span>,{" "}
              <span className="neon-red text-red-400">attacks</span>, and{" "}
              <span className="neon-emerald text-emerald-400">heals itself</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              GuardianX is the first platform to close the loop from code to live
              target to patch to report — all AI-driven with real execution at
              every step. Autonomous SAST, DAST, exploit generation, adversarial
              patching, and VAPT reporting in one.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={onEnter}
                className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
              >
                <Terminal className="size-5" />
                Enter the Lab Console
                <ArrowRight className="size-4" />
              </Button>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-6 py-3 text-sm text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                Explore Features
              </a>
            </div>
          </motion.div>

          {/* Hero stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {[
              { value: "12+", label: "Security Modules" },
              { value: "100%", label: "AI-Driven" },
              { value: "Real", label: "Sandbox Execution" },
              { value: "SHA-256", label: "Attestation Ledger" },
            ].map((s, i) => (
              <div key={i} className="holo-card hud-corners rounded-xl p-4 text-center">
                <div className="text-2xl font-bold neon-emerald text-emerald-400">{s.value}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Pipeline section */}
        <section id="pipeline" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              {"// The Autonomous Pipeline"}
            </div>
            <h2 className="text-3xl font-bold text-zinc-50">From code to patch, autonomously</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Every vulnerability goes through a closed-loop pipeline: detect → exploit → patch → attack → defend → review. No human intervention until the final approval.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PIPELINE_STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="holo-card hud-corners glow-hover rounded-xl p-4 text-center"
              >
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                  <step.icon className="size-5 text-emerald-400" />
                </div>
                <div className="text-xs font-bold text-zinc-100">{step.label}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{step.desc}</div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ArrowRight className="mx-auto mt-2 size-3 text-emerald-500/30" />
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {/* Features grid */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              {"// Capabilities"}
            </div>
            <h2 className="text-3xl font-bold text-zinc-50">Everything you need to secure your code</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Twelve integrated modules covering the full security lifecycle — from static analysis to live penetration testing to self-healing runtime.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.1 }}
                className={`holo-card hud-corners glow-hover group rounded-xl border ${f.border} p-5 transition-all duration-300 ${f.glow}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className={`flex size-10 items-center justify-center rounded-lg border ${f.border} bg-zinc-950/60`}>
                    <f.icon className={`size-5 ${f.color}`} />
                  </div>
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900/50 text-[9px] uppercase tracking-wider text-zinc-400">
                    {f.category}
                  </Badge>
                </div>
                <h3 className="text-sm font-bold text-zinc-100">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Tech badges */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="holo-card hud-corners rounded-2xl p-8 text-center">
            <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              {"// Built On"}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {["Next.js 16", "TypeScript", "Prisma + SQLite", "Socket.IO", "ReportLab", "Bun Runtime", "AES-256-GCM", "SHA-256 Ledger", "OWASP Top 10", "CVSS v3.1"].map((tech) => (
                <span key={tech} className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 font-mono text-xs text-emerald-300/80">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 p-10 text-center"
          >
            <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-30" />
            <div className="relative">
              <ShieldHalf className="mx-auto size-12 text-emerald-400 neon-emerald" />
              <h2 className="mt-4 text-3xl font-bold text-zinc-50">Ready to enter the lab?</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
                Launch the GuardianX console. Scan code, attack live targets, generate patches, and export professional VAPT reports — all in one autonomous platform.
              </p>
              <Button
                size="lg"
                onClick={onEnter}
                className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
              >
                <Terminal className="size-5" />
                Enter Lab Console
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer id="contact" className="border-t border-emerald-500/15 bg-zinc-950/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2">
                  <img src="/guardianx-logo.png" alt="GuardianX" className="size-8 object-contain" />
                  <span className="text-lg font-bold text-zinc-50">
                    Guardian<span className="text-emerald-400">X</span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Autonomous Security Operations Platform. AI-driven SAST, DAST, exploit generation, adversarial patching, and VAPT reporting.
                </p>
              </div>
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Contact</div>
                <div className="space-y-1 text-sm text-zinc-400">
                  <a href="https://www.guardianx.in" target="_blank" rel="noopener noreferrer" className="block transition-colors hover:text-emerald-400">www.guardianx.in</a>
                  <a href="mailto:hello@guardianx.in" className="block transition-colors hover:text-emerald-400">hello@guardianx.in</a>
                  <a href="tel:+917006712347" className="block transition-colors hover:text-emerald-400">+91 70067 12347</a>
                </div>
              </div>
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Compliance</div>
                <div className="flex flex-wrap gap-1.5">
                  {["OWASP Top 10", "PCI-DSS", "ISO 27001", "SOC 2", "NIST"].map((c) => (
                    <span key={c} className="rounded border border-zinc-700 bg-zinc-900/50 px-1.5 py-0.5 text-[10px] text-zinc-400">{c}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 border-t border-zinc-800/60 pt-4 text-center text-xs text-zinc-600">
              © {new Date().getFullYear()} GuardianX. All rights reserved. · Built for autonomous security.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Inline matrix rain (lighter version for landing)
function MatrixRainBG() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-20">
      <div className="cyber-grid absolute inset-0 opacity-50" />
    </div>
  );
}

function Sparkles({ className }: { className?: string }) {
  return <span className={className}>✦</span>;
}
