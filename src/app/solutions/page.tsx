"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Cloud, Zap, Radar, ShieldCheck, FileCheck2, Network,
  CreditCard, Briefcase, Swords, Boxes, CheckCircle2, ArrowRight,
  Sparkles, Clock, Target, Fingerprint,
  Terminal, FileText, Cpu, Globe, Lock, Gauge,
  Scale, TrendingDown, IndianRupee, Scan, Wallet,
  Workflow,
} from "lucide-react";
import { TiltCard } from "@/components/sentinel/landing/tilt-card";
import { useCountUp, formatInt } from "@/components/sentinel/landing/use-count-up";

/* ============================= DATA ============================= */

const HERO_STATS = [
  { icon: Clock,   target: 90,  prefix: "",  suffix: "s",     label: "Full VAPT" },
  { icon: Gauge,   target: 85,  prefix: "",  suffix: "%",     label: "MTTR reduction" },
  { icon: Radar,   target: 22,  prefix: "",  suffix: "+",     label: "Exposure paths" },
  { icon: Lock,    target: 256, prefix: "SHA-", suffix: "",   label: "Attestation" },
] as const;

type Stat = (typeof HERO_STATS)[number];

const HERO_CHIPS = [
  { label: "By Use Case", color: "emerald", icon: Target },
  { label: "By Compliance", color: "cyan", icon: ShieldCheck },
  { label: "By Role", color: "amber", icon: Briefcase },
] as const;

const USE_CASES = [
  {
    icon: Cloud,
    title: "Cloud Security Posture",
    valueProp: "Continuous cloud-native posture management, from Lambda to Kubernetes, with virtual patching that ships in minutes.",
    badge: "60+ modules",
    points: [
      "Misconfig + secret scanning for Lambda, Cloud Run, ECS, env vars & IaC",
      "IAM policy drift detection with least-privilege remediation",
      "SCA on container images, OS packages and language deps",
      "Virtual patching: ModSecurity, Cloudflare, iptables, Nginx",
      "K8s manifest + Terraform / CloudFormation remediation",
    ],
    href: "/features",
  },
  {
    icon: Zap,
    title: "SOC Acceleration",
    valueProp: "From one URL to a full VAPT in 90 seconds, with AI-written executive summaries and a live exploit command center.",
    badge: "85% MTTR reduction",
    points: [
      "Single-URL asset discovery → full VAPT in 90 seconds",
      "AI executive summaries in C-suite business language",
      "Live command center: exploit terminal, topology, attack heatmap",
      "Guardian AI chatbot, natural-language prioritization",
      "Slack / Teams webhooks + daily digest",
    ],
    href: "/features",
  },
  {
    icon: Radar,
    title: "Exposure Management",
    valueProp: "Hunt the 22+ exposure paths attackers crawl first, with canary tokens and dark-web monitoring built in.",
    badge: "22+ exposure paths",
    points: [
      "Crawls 22+ known exposure paths (.env, .git/config, backup.zip)",
      "Sensitive data detection: AWS / Stripe / GitHub keys, JWTs, SSNs",
      "Canary token injection across every endpoint",
      "Honeypot endpoints trap attackers in real time",
      "Dark web monitoring for leaked credentials tied to your domains",
    ],
    href: "/features",
  },
] as const;

const COMPLIANCE = [
  {
    icon: ShieldCheck,
    title: "ISO 27001",
    desc: "Continuous control monitoring across Annex A.8–A.14 with hash-chained evidence and one-click audit exports.",
    points: [
      "Continuous monitoring across Annex A.8–A.14",
      "Automated evidence collection, SHA-256 hash-chained",
      "Annex A control mapping on every finding",
      "Compliance-ready PDF audit exports, one click",
    ],
  },
  {
    icon: FileCheck2,
    title: "SOC 2",
    desc: "Trust Services Criteria mapping across Security, Availability, and Confidentiality, with a tamper-evident audit trail.",
    points: [
      "TSC mapping: Security, Availability, Confidentiality",
      "Continuous monitoring of access & change management",
      "Tamper-evident audit trail (SHA-256 hash chain)",
      "Periodic attestation exports for auditors",
    ],
  },
  {
    icon: Network,
    title: "NIST CSF 2.0",
    desc: "Full Identify → Protect → Detect → Respond → Recover mapping, with per-asset risk scores and IR playbooks.",
    points: [
      "Identify / Protect / Detect / Respond / Recover mapping",
      "Per-asset risk score aligned to NIST risk model",
      "Auto-generated incident-response playbooks",
      "Behavioral anomaly detection powers the Detect function",
    ],
  },
  {
    icon: CreditCard,
    title: "PCI-DSS",
    desc: "Continuous coverage for Requirement 6 and 11, replacing quarterly assessments with continuous audit.",
    points: [
      "Continuous Req 6 (secure dev) + Req 11 (vuln scanning)",
      "SAST + DAST enforced on every commit",
      "Patch attestation ledger, QSA-ready",
      "CDE scoping & segmentation built in",
    ],
  },
  {
    icon: Scale,
    title: "DPDPA",
    desc: "India's Digital Personal Data Protection Act, with data-mapping, breach-notification, and consent-registry modules.",
    points: [
      "Personal-data discovery across code, infra & responses",
      "Consent registry & data-subject rights workflow",
      "Auto-generated breach-notification packets (72-hour SLA)",
      "DPDPA §8 reasonable-security safeguards attested",
    ],
  },
] as const;

/** GuardianX module → framework control matrix. */
const COMPLIANCE_MATRIX = {
  frameworks: ["ISO 27001", "SOC 2", "NIST CSF", "PCI-DSS", "DPDPA"],
  rows: [
    { module: "SAST",            controls: ["A.8.28",  "CC8.1",  "PR.IP-12", "Req 6.5",   "§11"] },
    { module: "DAST",            controls: ["A.8.29",  "CC7.1",  "DE.CM-1",  "Req 11.3",  "§8(5)"] },
    { module: "SCA",             controls: ["A.8.8",   "CC7.1",  "ID.RA-1",  "Req 6.3",   "§8(4)"] },
    { module: "Secret Scanning", controls: ["A.8.24",  "CC6.1",  "PR.AC-1",  "Req 3.4",   "§8(4)"] },
    { module: "IaC Scanning",    controls: ["A.8.9",   "CC8.1",  "PR.IP-1",  "Req 6.4",   "§11"] },
    { module: "AI Patch Gen",    controls: ["A.8.8",   "CC7.2",  "RS.MI-2",  "Req 6.5.1", "§8(5)"] },
    { module: "Audit Trail",     controls: ["A.5.33",  "CC7.3",  "PR.PT-1",  "Req 10.2",  "§8(5)"] },
    { module: "Asset Discovery", controls: ["A.5.9",   "CC3.2",  "ID.AM-1",  "Req 12.5",  "§8(4)"] },
  ],
} as const;

const ROLES = [
  {
    icon: Briefcase,
    title: "CISOs & Executives",
    valueProp: "Board-ready risk language, predictive scoring, and one-click reports — without CVE soup.",
    points: [
      "Executive dashboard in business-risk language",
      "PostureScore (0–100) per client / business unit",
      "Predictive risk scoring + DPDPA / GDPR posture",
      "Board-ready PDF reports with custom branding",
    ],
    href: "/",
  },
  {
    icon: Swords,
    title: "SecOps Engineers",
    valueProp: "Full VAPT in 90 seconds, autonomous DAST, and an adversarial patch arena where one AI fights another.",
    points: [
      "Full VAPT in 90 seconds from a single URL",
      "RedAgent autonomous DAST engine with real HTTP payloads",
      "PoC exploit generation + adversarial patch arena",
      "Attack chain DAG across multi-step paths",
    ],
    href: "/",
  },
  {
    icon: Boxes,
    title: "Cloud Architects",
    valueProp: "Agentless, API-first, blast-radius-safe. Drop GuardianX into any CI/CD pipeline in minutes.",
    points: [
      "Agentless deployment, no code changes, no sidecars",
      "API-first architecture, fully scriptable from CI/CD",
      "Blast-radius safety: authorized-only, scope-enforced, read-only by default",
      "IaC remediation (Terraform / CloudFormation) + K8s scanning",
    ],
    href: "/",
  },
] as const;

const ROI_STATS = [
  { icon: IndianRupee, target: 50, prefix: "₹",  suffix: "L",  label: "Saved per year vs 5-person team", color: "text-emerald-400" },
  { icon: Gauge,       target: 85, prefix: "",   suffix: "%",  label: "Mean-time-to-remediate reduction", color: "text-cyan-400" },
  { icon: Clock,       target: 90, prefix: "",   suffix: "s",  label: "Per full VAPT scan", color: "text-amber-400" },
  { icon: Layers,      target: 60, prefix: "",   suffix: "+",  label: "Modules in one platform", color: "text-violet-400" },
] as const;

/* ============================= HELPERS ============================= */

type IconType = React.ComponentType<{ className?: string }>;

const containerStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

function SectionHeader({
  index,
  total,
  title,
  blurb,
  color,
  Icon,
}: {
  index: number;
  total: number;
  title: string;
  blurb: string;
  color: "emerald" | "cyan" | "amber";
  Icon: IconType;
}) {
  const colorMap = {
    emerald: { ring: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-400" },
    cyan:    { ring: "border-cyan-500/40",    bg: "bg-cyan-500/10",    text: "text-cyan-400" },
    amber:   { ring: "border-amber-500/40",   bg: "bg-amber-500/10",   text: "text-amber-400" },
  } as const;
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        whileInView={{ scale: 1, rotate: 0 }}
        viewport={{ once: true }}
        transition={{ type: "spring" }}
        className={`flex size-12 items-center justify-center rounded-xl border ${c.ring} ${c.bg}`}
      >
        <Icon className={`size-6 ${c.text}`} />
      </motion.div>
      <div className="flex-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {`// Section ${index} of ${total}`}
        </div>
        <h2 className={`text-2xl font-bold ${c.text} sm:text-3xl`}>{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">{blurb}</p>
      </div>
    </motion.div>
  );
}

/** Hero stat tile with count-up animation. */
function HeroStatTile({ stat, index }: { stat: Stat; index: number }) {
  const [ref, value] = useCountUp(stat.target, {
    duration: 1800,
    delay: 600 + index * 150,
  });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85 + index * 0.08, duration: 0.5 }}
      className="holo-card-sharp hud-corners group relative overflow-hidden rounded-xl border border-zinc-700 p-4"
    >
      <div aria-hidden className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-emerald-500/5 transition-all duration-500 group-hover:bg-emerald-500/15" />
      <div className="relative flex items-center gap-2">
        <stat.icon className="size-4 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {stat.label}
        </span>
      </div>
      <div className="relative mt-2 text-2xl font-bold tabular-nums text-zinc-50 sm:text-3xl">
        {stat.prefix}
        {formatInt(value)}
        {stat.suffix}
      </div>
    </motion.div>
  );
}

type ColorKey = "emerald" | "cyan" | "amber";

function colorClasses(color: ColorKey) {
  const map = {
    emerald: {
      ring: "border-emerald-500/30",
      bg: "bg-emerald-500/5",
      text: "text-emerald-400",
      hoverBorder: "group-hover:border-emerald-500/50",
      glow: "from-emerald-500/10",
      check: "text-emerald-400",
      corner: "bg-emerald-500/5 group-hover:bg-emerald-500/15",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-300",
      badgeRing: "border-emerald-500/30",
    },
    cyan: {
      ring: "border-cyan-500/30",
      bg: "bg-cyan-500/5",
      text: "text-cyan-400",
      hoverBorder: "group-hover:border-cyan-500/50",
      glow: "from-cyan-500/10",
      check: "text-cyan-400",
      corner: "bg-cyan-500/5 group-hover:bg-cyan-500/15",
      badgeBg: "bg-cyan-500/10",
      badgeText: "text-cyan-300",
      badgeRing: "border-cyan-500/30",
    },
    amber: {
      ring: "border-amber-500/30",
      bg: "bg-amber-500/5",
      text: "text-amber-400",
      hoverBorder: "group-hover:border-amber-500/50",
      glow: "from-amber-500/10",
      check: "text-amber-400",
      corner: "bg-amber-500/5 group-hover:bg-amber-500/15",
      badgeBg: "bg-amber-500/10",
      badgeText: "text-amber-300",
      badgeRing: "border-amber-500/30",
    },
  } as const;
  return map[color];
}

/** Use-case card — TiltCard-wrapped, with stat badge + learn-more link. */
function UseCaseCard({
  card,
  index,
}: {
  card: (typeof USE_CASES)[number];
  index: number;
}) {
  const c = colorClasses("emerald");
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.1, duration: 0.55 }}
      className="h-full"
    >
      <TiltCard max={6} className="h-full">
        <div
          className={`group holo-card-sharp hud-corners relative h-full overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 ${c.hoverBorder}`}
        >
          {/* Glow halo on hover */}
          <div
            className={`pointer-events-none absolute -inset-0.5 rounded-xl bg-gradient-to-br ${c.glow} to-transparent opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100`}
          />
          {/* Top-right corner accent */}
          <div className={`absolute right-0 top-0 h-24 w-24 rounded-bl-full ${c.corner} transition-all duration-500`} />

          <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex size-11 items-center justify-center rounded-lg border ${c.ring} ${c.bg}`}>
                  <card.icon className={`size-5 ${c.text}`} />
                </div>
                <h3 className={`text-base font-bold ${c.text}`}>{card.title}</h3>
              </div>
            </div>

            {/* Stat badge */}
            <div className="mb-4">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border ${c.badgeRing} ${c.badgeBg} px-2.5 py-1 font-mono text-[11px] font-semibold ${c.badgeText}`}
              >
                <Sparkles className="size-3" />
                {card.badge}
              </span>
            </div>

            {/* Value prop */}
            <p className="text-xs leading-relaxed text-zinc-300">{card.valueProp}</p>

            {/* Bullets */}
            <ul className="mt-4 space-y-2 border-t border-zinc-800/60 pt-4">
              {card.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${c.check}`} />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>

            {/* Learn more */}
            <a
              href={card.href}
              className={`mt-5 inline-flex items-center gap-1.5 text-xs font-semibold ${c.text} transition-all hover:gap-2.5`}
            >
              Learn more
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

function ComplianceCard({ card, index }: { card: (typeof COMPLIANCE)[number]; index: number }) {
  const c = colorClasses("cyan");
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ y: -6 }}
      className="group h-full"
    >
      <div
        className={`holo-card-sharp hud-corners relative h-full overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 ${c.hoverBorder}`}
      >
        <div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full ${c.corner} transition-all duration-500`} />
        <div className="relative flex h-full flex-col">
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-lg border ${c.ring} ${c.bg}`}>
              <card.icon className={`size-5 ${c.text}`} />
            </div>
            <h3 className={`text-base font-bold ${c.text}`}>{card.title}</h3>
          </div>
          <p className="text-xs leading-relaxed text-zinc-300">{card.desc}</p>
          <ul className="mt-4 space-y-2 border-t border-zinc-800/60 pt-4">
            {card.points.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${c.check}`} />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function RoleCard({ card, index }: { card: (typeof ROLES)[number]; index: number }) {
  const c = colorClasses("amber");
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.1, duration: 0.55 }}
      whileHover={{ y: -6 }}
      className="group h-full"
    >
      <div
        className={`holo-card-sharp hud-corners relative h-full overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 ${c.hoverBorder}`}
      >
        <div className={`absolute right-0 top-0 h-24 w-24 rounded-bl-full ${c.corner} transition-all duration-500`} />
        <div className="relative flex h-full flex-col">
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-lg border ${c.ring} ${c.bg}`}>
              <card.icon className={`size-5 ${c.text}`} />
            </div>
            <h3 className={`text-base font-bold ${c.text}`}>{card.title}</h3>
          </div>
          <p className="text-xs leading-relaxed text-zinc-300">{card.valueProp}</p>
          <ul className="mt-4 space-y-2 border-t border-zinc-800/60 pt-4">
            {card.points.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${c.check}`} />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
          <a
            href={card.href}
            className={`mt-5 inline-flex items-center gap-1.5 text-xs font-semibold ${c.text} transition-all hover:gap-2.5`}
          >
            See it in action
            <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

/** Animated ROI stat tile. */
function ROIStatTile({
  stat,
  index,
}: {
  stat: (typeof ROI_STATS)[number];
  index: number;
}) {
  const [ref, value] = useCountUp(stat.target, {
    duration: 1800,
    delay: index * 200,
  });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
      className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-700 p-5 text-center"
    >
      <stat.icon className={`mx-auto mb-2 size-6 ${stat.color}`} />
      <div className={`text-3xl font-bold tabular-nums sm:text-4xl ${stat.color}`}>
        {stat.prefix}
        {formatInt(value)}
        {stat.suffix}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {stat.label}
      </div>
    </motion.div>
  );
}

/* ============================= PAGE ============================= */

export default function SolutionsPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        {/* Background layers */}
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-600/8 blur-3xl" />
          <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pt-16 sm:px-6">
          {/* ===== HERO ===== */}
          <section className="py-16 sm:py-24">
            <motion.div
              initial="hidden"
              animate="show"
              variants={containerStagger}
              className="flex flex-col items-center text-center"
            >
              {/* Floating icon */}
              <motion.div variants={fadeUpItem} className="mb-8">
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/20" />
                  <div
                    className="relative flex size-20 items-center justify-center rounded-2xl border border-emerald-500/50 bg-emerald-500/10"
                    style={{ boxShadow: "0 0 40px rgba(16,185,129,0.3)" }}
                  >
                    <Layers className="size-10 text-emerald-400 neon-emerald" />
                  </div>
                </div>
              </motion.div>

              {/* Badge */}
              <motion.div variants={fadeUpItem}>
                <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <Sparkles className="size-3" /> Solutions
                </Badge>
              </motion.div>

              {/* Headline */}
              <motion.h1
                variants={fadeUpItem}
                className="text-center text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl"
              >
                Solutions for every <br className="hidden sm:block" />
                <span className="gradient-text">security problem</span>
              </motion.h1>

              {/* Subhead */}
              <motion.p
                variants={fadeUpItem}
                className="mt-6 max-w-2xl text-center text-base text-zinc-400 sm:text-lg"
              >
                GuardianX runs a full VAPT in <span className="text-emerald-300">90 seconds</span>,
                cuts mean-time-to-remediate by <span className="text-emerald-300">85%</span>, and packs
                <span className="text-emerald-300"> 60+ modules</span> — SAST, DAST, SCA, exposure
                hunting, virtual patching, and compliance attestation — into one autonomous platform.
              </motion.p>

              {/* CTAs */}
              <motion.div
                variants={fadeUpItem}
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4"
              >
                <a href="/?#scan-widget">
                  <Button
                    size="lg"
                    className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                  >
                    <Scan className="size-5" /> Scan Your Website For Free
                  </Button>
                </a>
                <a href="/">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    <Terminal className="size-5" /> Enter the Lab Console
                    <ArrowRight className="size-4" />
                  </Button>
                </a>
              </motion.div>

              {/* Hero chips */}
              <motion.div
                variants={fadeUpItem}
                className="mt-10 flex flex-wrap items-center justify-center gap-2"
              >
                {HERO_CHIPS.map((chip) => (
                  <span
                    key={chip.label}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-${chip.color}-500/30 bg-${chip.color}-500/5 px-3 py-1 text-xs font-medium text-${chip.color}-300`}
                  >
                    <chip.icon className={`size-3.5 text-${chip.color}-400`} />
                    {chip.label}
                  </span>
                ))}
              </motion.div>

              {/* Hero stats — count-up */}
              <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                {HERO_STATS.map((stat, i) => (
                  <HeroStatTile key={stat.label} stat={stat} index={i} />
                ))}
              </div>
            </motion.div>
          </section>

          {/* ===== SECTION 1 — BY USE CASE ===== */}
          <section className="py-12 sm:py-16">
            <SectionHeader
              index={1}
              total={5}
              title="By Use Case"
              color="emerald"
              Icon={Target}
              blurb="Three deployment patterns where GuardianX replaces a stack of point tools — cloud posture, SOC acceleration, and external exposure management."
            />
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.1 }}
              variants={containerStagger}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {USE_CASES.map((card, i) => (
                <UseCaseCard key={card.title} card={card} index={i} />
              ))}
            </motion.div>
          </section>

          {/* ===== SECTION 2 — BY COMPLIANCE ===== */}
          <section className="py-12 sm:py-16">
            <SectionHeader
              index={2}
              total={5}
              title="By Compliance"
              color="cyan"
              Icon={ShieldCheck}
              blurb="Continuous control monitoring and hash-chained evidence for the five frameworks your auditors actually ask about — ISO 27001, SOC 2, NIST CSF 2.0, PCI-DSS, and DPDPA."
            />
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.1 }}
              variants={containerStagger}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {COMPLIANCE.map((card, i) => (
                <ComplianceCard key={card.title} card={card} index={i} />
              ))}
            </motion.div>

            {/* Compliance CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="mt-8 flex justify-center"
            >
              <a href="/">
                <Button
                  size="lg"
                  className="bg-cyan-600 text-white hover:bg-cyan-500"
                  style={{ boxShadow: "0 0 24px rgba(6,182,212,0.25)" }}
                >
                  <FileText className="size-5" /> Generate compliance report
                  <ArrowRight className="size-4" />
                </Button>
              </a>
            </motion.div>

            {/* Compliance matrix */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55 }}
              className="mt-12"
            >
              <div className="mb-4 flex items-center gap-2">
                <Workflow className="size-4 text-cyan-400" />
                <h3 className="font-mono text-xs uppercase tracking-widest text-cyan-300">
                  Module → Framework Control Matrix
                </h3>
              </div>
              <div className="holo-card-sharp hud-corners overflow-hidden rounded-xl border border-zinc-800/80">
                <div className="max-h-[28rem] overflow-auto custom-scrollbar">
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-900/95 backdrop-blur">
                        <th className="border-b border-zinc-800 p-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                          GuardianX Module
                        </th>
                        {COMPLIANCE_MATRIX.frameworks.map((fw) => (
                          <th
                            key={fw}
                            className="border-b border-zinc-800 p-3 text-center font-mono text-[10px] uppercase tracking-widest text-cyan-400"
                          >
                            {fw}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {COMPLIANCE_MATRIX.rows.map((row, ri) => (
                        <tr
                          key={row.module}
                          className={ri % 2 === 0 ? "bg-zinc-950/40" : "bg-zinc-900/30"}
                        >
                          <td className="border-b border-zinc-800/60 p-3 font-medium text-zinc-200">
                            <span className="inline-flex items-center gap-2">
                              <span className="size-1.5 rounded-full bg-cyan-400" />
                              {row.module}
                            </span>
                          </td>
                          {row.controls.map((ctrl, ci) => (
                            <td
                              key={ci}
                              className="border-b border-zinc-800/60 p-3 text-center font-mono text-[11px] text-zinc-400"
                            >
                              <span className="inline-flex items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2 py-0.5 text-cyan-300">
                                {ctrl}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-zinc-600">
                Each GuardianX module maps to specific framework controls; findings auto-attach the relevant control ID for auditors.
              </p>
            </motion.div>
          </section>

          {/* ===== SECTION 3 — BY ROLE ===== */}
          <section className="py-12 sm:py-16">
            <SectionHeader
              index={3}
              total={5}
              title="By Role"
              color="amber"
              Icon={Briefcase}
              blurb="A dedicated surface for every stakeholder — from CISOs who need board-ready risk language, to SecOps teams running live exploits, to cloud architects who need agentless, blast-radius-safe scanning."
            />
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.1 }}
              variants={containerStagger}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {ROLES.map((card, i) => (
                <RoleCard key={card.title} card={card} index={i} />
              ))}
            </motion.div>
          </section>

          {/* ===== SECTION 4 — ROI ===== */}
          <section className="py-12 sm:py-16">
            <SectionHeader
              index={4}
              total={5}
              title="Return on Investment"
              color="emerald"
              Icon={TrendingDown}
              blurb="Replace a 5-person security team with one autonomous platform. The math is unambiguous."
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55 }}
              className="holo-card-sharp hud-corners relative overflow-hidden rounded-2xl border border-emerald-500/30 p-6 sm:p-10"
            >
              {/* Decorative glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-emerald-500/10 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-cyan-500/10 blur-3xl"
              />

              <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr]">
                {/* Left: headline + cost comparison + CTA */}
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
                    {/* cost analysis */}
                    {"// cost analysis"}
                  </div>
                  <h3 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                    Replace a <span className="text-emerald-400">5-person security team</span><br />
                    with one platform
                  </h3>
                  <p className="mt-3 max-w-md text-sm text-zinc-400">
                    A 5-person SOC team in India costs ~₹50L / year in salaries alone. GuardianX
                    delivers continuous coverage for ₹60K / year — and never sleeps, never takes
                    PTO, and runs a full VAPT every 90 seconds.
                  </p>

                  {/* Cost comparison bar */}
                  <div className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4">
                    <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      <span>5-person team / yr</span>
                      <span>GuardianX / yr</span>
                    </div>
                    <div className="flex h-3 items-center gap-1 overflow-hidden rounded-full bg-zinc-900">
                      <motion.div
                        className="h-full rounded-l-full bg-gradient-to-r from-red-500 to-amber-500"
                        initial={{ width: 0 }}
                        whileInView={{ width: "98.8%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                      <motion.div
                        className="h-full rounded-r-full bg-emerald-500"
                        initial={{ width: 0 }}
                        whileInView={{ width: "1.2%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        style={{ boxShadow: "0 0 8px #34d399" }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono text-red-300">₹50,00,000</div>
                        <div className="text-[10px] text-zinc-600">salaries + benefits</div>
                      </div>
                      <ArrowRight className="size-4 text-zinc-600" />
                      <div className="text-right">
                        <div className="font-mono text-emerald-300">₹60,000</div>
                        <div className="text-[10px] text-zinc-600">GuardianX annual</div>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <a href="/" className="mt-6 inline-block">
                    <Button
                      size="lg"
                      className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                    >
                      <Wallet className="size-5" /> Start free trial
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                </div>

                {/* Right: stat tiles grid */}
                <div className="grid grid-cols-2 gap-3 self-center">
                  {ROI_STATS.map((stat, i) => (
                    <ROIStatTile key={stat.label} stat={stat} index={i} />
                  ))}
                </div>
              </div>
            </motion.div>
          </section>

          {/* ===== SECTION 5 — FINAL CTA ===== */}
          <section className="py-16 sm:py-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative overflow-hidden rounded-2xl"
            >
              {/* Gradient banner background */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/30 via-cyan-600/15 to-amber-500/20" />
              <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
              />

              <div className="relative flex flex-col items-center p-10 text-center sm:p-16">
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  whileInView={{ scale: 1, rotate: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring" }}
                  className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/10"
                >
                  <Layers className="size-7 text-emerald-400 neon-emerald" />
                </motion.div>
                <h2 className="text-3xl font-bold text-zinc-50 sm:text-5xl">
                  Ready to close the loop?
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-300 sm:text-base">
                  Scan your code, attack live targets, generate patches, export reports —
                  all in one autonomous platform.
                </p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="mt-8"
                >
                  <a href="/">
                    <Button
                      size="lg"
                      className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                    >
                      <Terminal className="size-5" /> Enter the Lab Console
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                </motion.div>

                {/* Trust strip */}
                <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-zinc-800/60 pt-6 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="size-3 text-emerald-400" /> Agentless
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Terminal className="size-3 text-emerald-400" /> API-first
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3 text-emerald-400" /> SHA-256 attestation
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-3 text-emerald-400" /> Board-ready reports
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3 text-emerald-400" /> DPDPA / GDPR
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Fingerprint className="size-3 text-emerald-400" /> 2FA + RBAC
                  </span>
                </div>
              </div>
            </motion.div>
          </section>
        </div>

        <SiteFooter />
      </div>
    </>
  );
}
