"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Target,
  Heart,
  Cpu,
  Brain,
  Activity,
  HeartPulse,
  ShieldCheck,
  Lock,
  RotateCcw,
  Radar,
  Network,
  GitBranch,
  Crosshair,
  ShieldAlert,
  Code2,
  Bug,
  Globe,
  FileText,
  Phone,
  ArrowRight,
  Rocket,
  Zap,
  ShieldHalf,
  IndianRupee,
  Headphones,
  Sparkles,
  Bot,
  Cctv,
  Fingerprint,
  MapPin,
  Mail,
  Scale,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";
import { useCountUp, formatInt } from "@/components/sentinel/landing/use-count-up";

/* ---------------------------------- data ---------------------------------- */

const HERO_STATS: { value: string; label: string; color: string }[] = [
  { value: "60+", label: "AI modules", color: "text-emerald-400" },
  { value: "90s", label: "per VAPT scan", color: "text-cyan-400" },
  { value: "85%", label: "MTTR reduction", color: "text-violet-400" },
  { value: "1.6M+", label: "Indian companies to protect", color: "text-rose-400" },
];

const VALUES: {
  icon: LucideIcon;
  title: string;
  desc: string;
  iconWrap: string;
  iconColor: string;
  titleColor: string;
}[] = [
  {
    icon: Target,
    title: "Autonomy First",
    desc: "Security shouldn't require a PhD in pentesting. GuardianX thinks, attacks, patches, and reports — autonomously, in one continuous loop.",
    iconWrap: "border-emerald-500/30 bg-emerald-500/10",
    iconColor: "text-emerald-400",
    titleColor: "text-emerald-400",
  },
  {
    icon: Heart,
    title: "Built for India",
    desc: "DPDPA-compliant by design, priced in rupees, and tuned for the regulatory reality of Indian businesses — then scaled globally.",
    iconWrap: "border-rose-500/30 bg-rose-500/10",
    iconColor: "text-rose-400",
    titleColor: "text-rose-400",
  },
  {
    icon: Cpu,
    title: "AI-Native",
    desc: "Not a legacy tool with AI bolted on. GuardianX was built from day one around LLMs for analysis, exploit synthesis, and patch generation.",
    iconWrap: "border-cyan-500/30 bg-cyan-500/10",
    iconColor: "text-cyan-400",
    titleColor: "text-cyan-400",
  },
];

const STAGES: {
  stage: string;
  sub: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  stageColor: string;
  subColor: string;
  glow: string;
  bullets: { icon: LucideIcon; text: string }[];
}[] = [
  {
    stage: "01 / THINK",
    sub: "Adaptive Intelligence",
    title: "AI reads code like antibodies scanning for threats",
    desc: "The Think engine ingests source code, runtime signals, and threat intel to map your entire attack surface in real time. It predicts compromise paths before adversaries ever exploit them.",
    icon: Brain,
    iconWrap: "border-emerald-500/30 bg-emerald-500/10",
    iconColor: "text-emerald-400",
    stageColor: "text-emerald-400",
    subColor: "text-emerald-500/60",
    glow: "bg-emerald-500/8",
    bullets: [
      { icon: Radar, text: "AI vulnerability detection across source, deps, and config" },
      { icon: Network, text: "Predictive attack-path graph across identity, network, workloads" },
      { icon: GitBranch, text: "Continuous risk scoring with confidence-weighted prioritization" },
    ],
  },
  {
    stage: "02 / ATTACK",
    sub: "Autonomous Adversary Emulation",
    title: "AI generates PoC exploits like white blood cells hunting pathogens",
    desc: "You cannot defend what you haven't stress-tested. The Attack engine synthesizes real HTTP payloads, validates every finding with a working proof-of-concept, and surfaces what's actually exploitable — not just what looks risky.",
    icon: Activity,
    iconWrap: "border-rose-500/30 bg-rose-500/10",
    iconColor: "text-rose-400",
    stageColor: "text-rose-400",
    subColor: "text-rose-500/60",
    glow: "bg-rose-500/8",
    bullets: [
      { icon: Crosshair, text: "Real HTTP payloads across OWASP categories and CWEs" },
      { icon: ShieldAlert, text: "Proof-of-concept exploit generation with verified evidence" },
      { icon: ShieldCheck, text: "Continuous breach-and-attack simulation against live targets" },
    ],
  },
  {
    stage: "03 / HEAL",
    sub: "Automated Remediation",
    title: "AI generates patches like skin regrows over a wound",
    desc: "Containment in seconds, not hours. Once a flaw is verified, the Heal engine generates a code-level patch, validates it doesn't break the build, and rolls it forward — closing the loop back to Think.",
    icon: HeartPulse,
    iconWrap: "border-violet-500/30 bg-violet-500/10",
    iconColor: "text-violet-400",
    stageColor: "text-violet-400",
    subColor: "text-violet-500/60",
    glow: "bg-violet-500/8",
    bullets: [
      { icon: ShieldCheck, text: "AI-generated patches with build-time validation" },
      { icon: Lock, text: "Blast-radius isolation without operational downtime" },
      { icon: RotateCcw, text: "Instant rollback to a known-secure baseline" },
    ],
  },
];

const ENGINES: {
  icon: LucideIcon;
  name: string;
  desc: string;
  iconWrap: string;
  iconColor: string;
  nameColor: string;
  capabilities: { icon: LucideIcon; text: string }[];
}[] = [
  {
    icon: Code2,
    name: "SAST Engine",
    desc: "Reads source code at AST granularity and reasons over every function, flow, and dependency.",
    iconWrap: "border-cyan-500/30 bg-cyan-500/10",
    iconColor: "text-cyan-400",
    nameColor: "text-cyan-400",
    capabilities: [
      { icon: Code2, text: "AI vulnerability detection across 60+ module categories" },
      { icon: GitBranch, text: "Full CWE mapping with cross-file taint analysis" },
      { icon: Sparkles, text: "Confidence scores and exploitability rating per finding" },
    ],
  },
  {
    icon: Crosshair,
    name: "DAST Engine",
    desc: "Crawls live targets, fires real HTTP payloads, and captures evidence like a human pentester.",
    iconWrap: "border-rose-500/30 bg-rose-500/10",
    iconColor: "text-rose-400",
    nameColor: "text-rose-400",
    capabilities: [
      { icon: Radar, text: "Autonomous crawler maps every endpoint and parameter" },
      { icon: Bug, text: "OWASP-category attack payloads against live targets" },
      { icon: FileText, text: "Reproducible evidence capture for every confirmed vuln" },
    ],
  },
  {
    icon: ShieldCheck,
    name: "Defense Engine",
    desc: "Deploys runtime defenses — canary tokens, honeypots, and virtual WAF patches — in production.",
    iconWrap: "border-emerald-500/30 bg-emerald-500/10",
    iconColor: "text-emerald-400",
    nameColor: "text-emerald-400",
    capabilities: [
      { icon: Fingerprint, text: "Canary tokens and honeypots detect lateral movement" },
      { icon: ShieldCheck, text: "Virtual WAF patches applied at the edge, no deploys" },
      { icon: Cctv, text: "24/7 runtime monitoring with anomaly detection" },
    ],
  },
];

const INDIA: {
  icon: LucideIcon;
  title: string;
  desc: string;
  iconWrap: string;
  iconColor: string;
  titleColor: string;
}[] = [
  {
    icon: Scale,
    title: "DPDPA-First",
    desc: "Compliant with India's Digital Personal Data Protection Act by design. Every module maps to the DPDPA, with audit trails and consent-aware data handling baked into the platform.",
    iconWrap: "border-emerald-500/30 bg-emerald-500/10",
    iconColor: "text-emerald-400",
    titleColor: "text-emerald-400",
  },
  {
    icon: IndianRupee,
    title: "Rupee Pricing",
    desc: "Pricing in rupees, not dollars. Starting at ₹0 for the free tier, with transparent per-scan and per-month plans designed for Indian startups and enterprises alike.",
    iconWrap: "border-amber-500/30 bg-amber-500/10",
    iconColor: "text-amber-400",
    titleColor: "text-amber-400",
  },
  {
    icon: Headphones,
    title: "Local Support",
    desc: "Support in English and Hindi. India-based engineering team. Mumbai timezone, working hours that overlap with yours — not a 12-hour-away vendor.",
    iconWrap: "border-rose-500/30 bg-rose-500/10",
    iconColor: "text-rose-400",
    titleColor: "text-rose-400",
  },
];

const IMPACT: {
  target: number;
  prefix?: string;
  suffix?: string;
  label: string;
  color: string;
  accent: string;
  icon: LucideIcon;
}[] = [
  {
    target: 60,
    suffix: "+",
    label: "AI modules",
    color: "text-emerald-400",
    accent: "border-emerald-500/30",
    icon: Cpu,
  },
  {
    target: 90,
    suffix: "s",
    label: "per scan",
    color: "text-cyan-400",
    accent: "border-cyan-500/30",
    icon: Zap,
  },
  {
    target: 85,
    suffix: "%",
    label: "MTTR reduction",
    color: "text-violet-400",
    accent: "border-violet-500/30",
    icon: Activity,
  },
  {
    target: 50,
    prefix: "₹",
    suffix: "L/yr",
    label: "saved per customer",
    color: "text-amber-400",
    accent: "border-amber-500/30",
    icon: IndianRupee,
  },
];

const CONTACTS: {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
  iconWrap: string;
  iconColor: string;
}[] = [
  {
    icon: Mail,
    label: "Email",
    value: "hello@guardianx.in",
    href: "mailto:hello@guardianx.in",
    iconWrap: "border-cyan-500/30 bg-cyan-500/10",
    iconColor: "text-cyan-400",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+91 70067 12347",
    href: "tel:+917006712347",
    iconWrap: "border-emerald-500/30 bg-emerald-500/10",
    iconColor: "text-emerald-400",
  },
  {
    icon: Globe,
    label: "Website",
    value: "www.guardianx.cloud",
    href: "https://www.guardianx.cloud",
    iconWrap: "border-violet-500/30 bg-violet-500/10",
    iconColor: "text-violet-400",
  },
];

/* ------------------------------- subcomponents ----------------------------- */

function ImpactTile({
  item,
  index,
}: {
  item: (typeof IMPACT)[number];
  index: number;
}) {
  const [ref, value] = useCountUp(item.target, {
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
      className={`holo-card-sharp hud-corners relative overflow-hidden border p-6 text-center ${item.accent}`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-current opacity-5 blur-2xl" />
      <item.icon className={`mx-auto mb-3 size-6 ${item.color}`} />
      <div className={`text-3xl font-bold tabular-nums sm:text-4xl ${item.color}`}>
        {item.prefix}
        {formatInt(value)}
        {item.suffix}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {item.label}
      </div>
    </motion.div>
  );
}

/* ---------------------------------- page ----------------------------------- */

export default function CompanyPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        {/* Ambient background: circuit grid + emerald/violet glows */}
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-600/12 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-emerald-500/8 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-cyan-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6">
          {/* ============================ HERO ============================ */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-24 pt-10 text-center sm:pt-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 }}
              className="mb-6 inline-flex"
            >
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Building2 className="size-3" /> Company
              </Badge>
            </motion.div>

            <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-zinc-50 sm:text-6xl">
              We're building the{" "}
              <span className="neon-emerald">autonomous immune system</span>{" "}
              for code
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-400 sm:text-lg">
              GuardianX is the platform our founder wished existed when he was
              securing India's startups. AI-native architecture, 60+ modules,
              and a full VAPT in 90 seconds — built India-first, scaled for the
              world.
            </p>

            {/* Stat tiles */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {HERO_STATS.map((s) => (
                <div
                  key={s.label}
                  className="holo-card-sharp hud-corners p-4 text-center"
                >
                  <div className={`text-2xl font-bold tabular-nums ${s.color}`}>
                    {s.value}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              <a href="/#agent-x">
                <Button
                  size="lg"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <Bot className="size-5" /> Meet Agent X
                  <ArrowRight className="size-4" />
                </Button>
              </a>
              <a href="/contact">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                >
                  Request a demo
                </Button>
              </a>
            </motion.div>
          </motion.section>

          {/* =========================== MISSION ========================== */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="mb-10 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                {"// Our Mission"}
              </div>
              <h2 className="mx-auto max-w-3xl text-3xl font-bold text-zinc-50 sm:text-4xl">
                Make world-class security accessible to every organization
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
                India has 1.6M+ registered companies but fewer than 500 certified
                penetration testers. GuardianX bridges that gap with AI —
                delivering the expertise of a 5-person security team in one
                autonomous platform, at a fraction of the cost.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {VALUES.map((v, i) => (
                <motion.div
                  key={v.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="holo-card-sharp hud-corners p-6"
                >
                  <div
                    className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border ${v.iconWrap}`}
                  >
                    <v.icon className={`size-6 ${v.iconColor}`} />
                  </div>
                  <h3
                    className={`text-center text-base font-bold ${v.titleColor}`}
                  >
                    {v.title}
                  </h3>
                  <p className="mt-3 text-center text-sm text-zinc-400">
                    {v.desc}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Founder's note */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="holo-card-sharp hud-corners relative mt-6 overflow-hidden p-6 sm:p-8"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-500/10 blur-3xl"
              />
              <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Headshot placeholder */}
                <div className="relative shrink-0">
                  <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-zinc-800 to-violet-600/20 sm:size-24">
                    <span className="font-mono text-2xl font-bold text-emerald-300 sm:text-3xl">
                      AA
                    </span>
                  </div>
                  <div className="pulse-dot absolute -right-0.5 -top-0.5 size-3 rounded-full bg-emerald-400" />
                </div>
                {/* Quote */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                    {"// Founder's note"}
                  </div>
                  <blockquote className="text-base italic leading-relaxed text-zinc-200 sm:text-lg">
                    "I started GuardianX because India's founders shouldn't have
                    to choose between shipping fast and being secure. We're
                    building the autonomous security platform I wish existed
                    when I was securing my first startup — affordable,
                    AI-native, and built for the realities of doing business
                    here."
                  </blockquote>
                  <div className="mt-4 flex flex-col items-center gap-1 sm:items-start">
                    <div className="text-sm font-bold text-zinc-50">Ayan Ali</div>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                      Founder &amp; CEO
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* ======================= CORE FRAMEWORK ====================== */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="mb-10 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                {"// The Core Framework"}
              </div>
              <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                Think. Attack. Heal.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
                Three engines work in a continuous closed loop so your defenses
                adapt as fast as adversaries evolve. No handoffs. No waiting on
                a human. Just the cycle, running 24/7.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {STAGES.map((stage, i) => (
                <motion.div
                  key={stage.stage}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="holo-card-sharp hud-corners relative overflow-hidden p-6"
                >
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute -right-8 -top-8 size-32 rounded-full blur-3xl ${stage.glow}`}
                  />
                  <div className="relative">
                    <div className="mb-4 flex items-center justify-between">
                      <span
                        className={`font-mono text-[10px] font-bold tracking-widest ${stage.stageColor}`}
                      >
                        {stage.stage}
                      </span>
                      <div
                        className={`flex size-10 items-center justify-center rounded-lg border ${stage.iconWrap}`}
                      >
                        <stage.icon className={`size-5 ${stage.iconColor}`} />
                      </div>
                    </div>
                    <div
                      className={`mb-2 font-mono text-[10px] uppercase tracking-widest ${stage.subColor}`}
                    >
                      {stage.sub}
                    </div>
                    <h3 className="text-lg font-bold leading-snug text-zinc-50">
                      {stage.title}
                    </h3>
                    <p className="mt-3 text-sm text-zinc-400">{stage.desc}</p>
                    <div className="mt-5 space-y-2.5">
                      {stage.bullets.map((b, bi) => (
                        <div
                          key={bi}
                          className="flex items-start gap-2 text-xs text-zinc-300"
                        >
                          <b.icon
                            className={`mt-0.5 size-3.5 shrink-0 ${stage.iconColor}`}
                          />
                          <span>{b.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Closed-loop badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 }}
              className="mt-6 flex justify-center"
            >
              <div className="holo-card-sharp hud-corners flex items-center gap-3 rounded-full px-5 py-2.5">
                <InfinityIcon className="size-4 text-emerald-400" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-300">
                  Closed-loop &middot; Think → Attack → Heal → Think
                </span>
                <div className="pulse-dot size-2 rounded-full bg-emerald-400" />
              </div>
            </motion.div>
          </motion.section>

          {/* ========================= THE PLATFORM ====================== */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="mb-10 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
                {"// The Platform"}
              </div>
              <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                One platform, three closed-loop engines
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
                SAST reads your code. DAST attacks your live targets. Defense
                protects what's running. All three feed each other in a single
                closed loop.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {ENGINES.map((engine, i) => (
                <motion.div
                  key={engine.name}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="holo-card-sharp hud-corners relative overflow-hidden p-6"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div
                      className={`flex size-12 items-center justify-center rounded-lg border ${engine.iconWrap}`}
                    >
                      <engine.icon className={`size-6 ${engine.iconColor}`} />
                    </div>
                    <h3
                      className={`text-lg font-bold ${engine.nameColor}`}
                    >
                      {engine.name}
                    </h3>
                  </div>
                  <p className="mb-5 text-sm text-zinc-400">{engine.desc}</p>
                  <div className="space-y-2.5">
                    {engine.capabilities.map((c, ci) => (
                      <div
                        key={ci}
                        className="flex items-start gap-2 text-xs text-zinc-300"
                      >
                        <c.icon
                          className={`mt-0.5 size-3.5 shrink-0 ${engine.iconColor}`}
                        />
                        <span>{c.text}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ====================== BUILT FOR INDIA ====================== */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="mb-10 text-center">
              <div className="mb-3 flex justify-center">
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                  <MapPin className="size-3" /> Made in India
                </Badge>
              </div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber-500/60">
                {"// Built for India, scaled for the world"}
              </div>
              <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                Built for India, scaled for the world
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
                We started with the hardest market — India's regulatory, price,
                and language realities — and engineered a platform that's
                globally competitive as a result.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {INDIA.map((card, i) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="holo-card-sharp hud-corners p-6"
                >
                  <div
                    className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border ${card.iconWrap}`}
                  >
                    <card.icon className={`size-6 ${card.iconColor}`} />
                  </div>
                  <h3
                    className={`text-center text-base font-bold ${card.titleColor}`}
                  >
                    {card.title}
                  </h3>
                  <p className="mt-3 text-center text-sm text-zinc-400">
                    {card.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ====================== STATS / IMPACT ======================= */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="mb-10 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-violet-500/60">
                {"// Impact"}
              </div>
              <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                Numbers that change how teams ship
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
                Not promises — measured outcomes across early GuardianX
                deployments.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {IMPACT.map((item, i) => (
                <ImpactTile key={item.label} item={item} index={i} />
              ))}
            </div>
          </motion.section>

          {/* ========================== CONTACT ========================== */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-6"
          >
            <div className="mb-8 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
                {"// Get in touch"}
              </div>
              <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                Let's talk
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                Whether you're shipping a new product, prepping for a RBI/SEBI
                audit, or just want to see Agent X in action — we're here.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {CONTACTS.map((c, i) => (
                <motion.a
                  key={c.label}
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="holo-card-sharp hud-corners group flex items-center gap-4 p-5 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
                >
                  <div
                    className={`flex size-12 shrink-0 items-center justify-center rounded-lg border ${c.iconWrap}`}
                  >
                    <c.icon className={`size-6 ${c.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {c.label}
                    </div>
                    <div className="truncate text-sm font-medium text-zinc-200">
                      {c.value}
                    </div>
                  </div>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-emerald-400" />
                </motion.a>
              ))}
            </div>
          </motion.section>

          {/* ============================ CTA ============================ */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="holo-card-sharp hud-corners relative overflow-hidden p-8 sm:p-12">
              <div
                aria-hidden
                className="cyber-grid pointer-events-none absolute inset-0 opacity-20"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 left-1/2 h-60 w-96 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
              />
              <div className="relative">
                <ShieldHalf className="mx-auto size-12 text-emerald-400 neon-emerald" />
                <h2 className="mt-4 text-3xl font-bold text-zinc-50 sm:text-4xl">
                  Ready to secure your assets?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  Spin up the Lab Console now, or book a personalized demo for
                  your organization.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <a href="/">
                    <Button
                      size="lg"
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <Rocket className="size-5" /> Enter the Lab Console
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                  <a href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Zap className="size-5" /> Request a demo
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
