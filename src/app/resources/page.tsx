"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, BookOpen, Building2, User, BarChart3, Code, Terminal,
  Download, ExternalLink, ArrowRight, CheckCircle2, TrendingUp, Award,
  ShieldHalf, Quote, Rocket, X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const WHITEPAPERS = [
  {
    icon: FileText,
    title: "GuardianX Technical Whitepaper",
    meta: "24 pages · Architecture",
    desc: "Complete architecture deep-dive, the 7-stage autonomous pipeline, AI patch generation with adversarial testing, cryptographic attestation ledger, blast radius safety controls.",
    href: "/whitepaper",
    cta: "Read",
    accent: "emerald",
  },
  {
    icon: BookOpen,
    title: "DPDPA Compliance Guide for Indian Enterprises",
    meta: "Guide · Compliance",
    desc: "How India's Digital Personal Data Protection Act (2023) maps to technical security controls. Section-by-section breakdown, data localization requirements (§16), breach notification timelines (§8). Practical implementation checklist.",
    href: "/whitepaper",
    cta: "Read",
    accent: "violet",
  },
  {
    icon: TrendingUp,
    title: "2026 Threat Landscape Report",
    meta: "Report · Research",
    desc: "AI-generated attack trends, LLM-assisted SQL injection up 340%, exposed .env files found on 1-in-12 production sites, CVE-to-exploit time now under 8 hours. Based on GuardianX scan data across 500+ engagements.",
    href: "/whitepaper",
    cta: "Read",
    accent: "amber",
  },
  {
    icon: ShieldHalf,
    title: "Adversarial Patching: A New Paradigm",
    meta: "Research · Methodology",
    desc: "Why traditional patch-and-pray fails. How GuardianX's adversarial arena (AI attacks its own fix until it concedes) produces patches that survive real-world attack. Research paper format.",
    href: "/whitepaper",
    cta: "Read",
    accent: "cyan",
  },
];

const CASE_STUDIES = [
  {
    icon: Building2,
    company: "FinTech Startup",
    location: "Bangalore",
    quote:
      "GuardianX found 3 critical vulnerabilities our manual pentest missed. The AI-generated patches saved us 2 weeks of developer time.",
    author: "CISO",
    stats: [
      { label: "ROI", value: "10x cost reduction" },
      { label: "Scan time", value: "90 sec vs 2-week manual" },
      { label: "Coverage", value: "Replaced quarterly pentest vendor" },
    ],
    accent: "emerald",
  },
  {
    icon: User,
    company: "Healthcare Platform",
    location: "Mumbai",
    quote:
      "We replaced our entire VAPT vendor with GuardianX. Same quality report, 10% of the cost, delivered in 90 seconds instead of 2 weeks.",
    author: "Head of Security",
    stats: [
      { label: "Compliance", value: "DPDPA achieved in 3 days" },
      { label: "False positives", value: "Zero in audit" },
      { label: "Cost", value: "10% of prior vendor spend" },
    ],
    accent: "cyan",
  },
  {
    icon: Building2,
    company: "SaaS Company",
    location: "Delhi",
    quote:
      "The R&D Lab is incredible, it studies open-source tools and improves its own modules. No other security platform does this.",
    author: "CTO",
    stats: [
      { label: "Modules", value: "50+ auto-optimized" },
      { label: "MTTR", value: "14 days → 2 hours" },
      { label: "Self-improving", value: "Continuous R&D" },
    ],
    accent: "violet",
  },
];

const BENCHMARKS = [
  {
    metric: "Scan time",
    traditional: "2–4 weeks",
    guardianx: "90 seconds",
  },
  {
    metric: "Cost per engagement",
    traditional: "₹2,00,000+",
    guardianx: "₹6,999 (MSME)",
  },
  {
    metric: "False positive rate",
    traditional: "15–30%",
    guardianx: "<2%",
  },
  {
    metric: "Time to patch",
    traditional: "7–14 days",
    guardianx: "2 hours (avg)",
  },
  {
    metric: "Coverage",
    traditional: "OWASP Top 10",
    guardianx: "OWASP Top 10 + CWE Top 25 + 50+ modules",
  },
  {
    metric: "Continuous monitoring",
    traditional: "No (point-in-time)",
    guardianx: "Yes (24/7 + hourly threat hunting)",
  },
  {
    metric: "Compliance mapping",
    traditional: "Manual",
    guardianx: "Auto (DPDPA, GDPR, ISO 27001, SOC 2, NIST, PCI-DSS)",
  },
];

const DOCS = [
  {
    icon: Code,
    title: "API Reference",
    desc: "Full REST API documentation, 80+ endpoints for codebases, scans, patches, engagements, findings, compliance, attestations. Authentication via JWT Bearer token. Rate limiting (300/min).",
    note: "Full interactive API docs coming soon",
    href: "/whitepaper",
    accent: "emerald",
  },
  {
    icon: Terminal,
    title: "Integration Guide",
    desc: "Connect GuardianX to your CI/CD pipeline (GitHub Actions, GitLab CI). Slack/Teams webhook setup. Custom report branding API. Cron-based scheduled scans.",
    href: "/whitepaper",
    accent: "cyan",
  },
  {
    icon: ShieldHalf,
    title: "Security & Architecture",
    desc: "Deployment model (agentless), data flow, credential vault (AES-256-GCM), attestation ledger (SHA-256 hash chain), auth (JWT + bcrypt + TOTP 2FA).",
    href: "/architecture",
    accent: "violet",
  },
  {
    icon: Rocket,
    title: "Quick Start Guide",
    desc: "5-step setup: (1) Create account, (2) Add client, (3) Import codebase or add target URL, (4) Click “Full VAPT”, (5) Review AI-generated patches. First scan in under 2 minutes.",
    href: "/",
    accent: "amber",
  },
];

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.6, ease: "easeOut" as const },
  }),
};

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function ResourcesPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-600/8 blur-3xl" />
          <div className="absolute left-0 top-1/3 h-72 w-72 rounded-full bg-cyan-500/5 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto pt-16 max-w-6xl px-4 py-20 sm:px-6">
          {/* ───────────────────────── HERO ───────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-20"
          >
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 1 }}
              className="mb-6 inline-flex"
            >
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-2xl bg-violet-500/20" />
                <div
                  className="relative flex size-16 items-center justify-center rounded-2xl border border-violet-500/50 bg-violet-500/10"
                  style={{ boxShadow: "0 0 40px rgba(139,92,246,0.25)" }}
                >
                  <BookOpen className="size-8 text-violet-300" />
                </div>
              </div>
            </motion.div>

            <Badge className="mb-4 border-violet-500/30 bg-violet-500/10 text-violet-300">
              <BookOpen className="size-3" /> Resources
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
              Knowledge center for{" "}
              <span className="bg-gradient-to-r from-violet-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                security leaders
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Whitepapers, threat reports, case studies, benchmarks, and full API
              documentation, everything you need to evaluate and deploy GuardianX.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <FileText className="size-3.5 text-violet-400" /> 4 whitepapers
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1.5">
                <Quote className="size-3.5 text-emerald-400" /> 3 case studies
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1.5">
                <BarChart3 className="size-3.5 text-cyan-400" /> 7 benchmark metrics
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1.5">
                <Code className="size-3.5 text-amber-400" /> 80+ API endpoints
              </span>
            </div>
          </motion.div>

          {/* ─────────────── SECTION 1: WHITEPAPERS ─────────────── */}
          <motion.section
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mb-24"
          >
            <SectionHeading
              eyebrow="// Section 01"
              title="Whitepapers & Threat Reports"
              icon={FileText}
              accent="violet"
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {WHITEPAPERS.map((w, i) => (
                <ResourceCard key={i} {...w} index={i} />
              ))}
            </div>
          </motion.section>

          {/* ─────────────── SECTION 2: CASE STUDIES ─────────────── */}
          <motion.section
            custom={1}
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mb-24"
          >
            <SectionHeading
              eyebrow="// Section 02"
              title="Case Studies & Benchmarks"
              icon={Award}
              accent="emerald"
            />
            <div className="grid gap-5 lg:grid-cols-3">
              {CASE_STUDIES.map((c, i) => (
                <CaseStudyCard key={i} {...c} index={i} />
              ))}
            </div>
          </motion.section>

          {/* ─────────────── SECTION 3: BENCHMARK TABLE ─────────────── */}
          <motion.section
            custom={2}
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mb-24"
          >
            <SectionHeading
              eyebrow="// Section 03"
              title="Benchmark Results"
              icon={BarChart3}
              accent="cyan"
              subtitle="Side-by-side comparison of traditional penetration testing vs GuardianX autonomous VAPT, measured across 500+ production engagements."
            />

            <div className="holo-card-sharp hud-corners overflow-hidden p-0">
              {/* card header */}
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full bg-emerald-500/80" />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                    benchmark_report.json
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
                >
                  n = 500+
                </Badge>
              </div>

              {/* table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="bg-zinc-900/40 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                        Metric
                      </th>
                      <th className="bg-zinc-900/40 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <X className="size-3 text-zinc-500" /> Traditional Pentest
                        </span>
                      </th>
                      <th className="bg-emerald-500/10 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-emerald-300">
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="size-3 text-emerald-400" /> GuardianX
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {BENCHMARKS.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/30"
                      >
                        <td className="px-5 py-4 align-top font-medium text-zinc-200">
                          {row.metric}
                        </td>
                        <td className="px-5 py-4 align-top text-zinc-500">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-zinc-600" />
                            {row.traditional}
                          </span>
                        </td>
                        <td className="bg-emerald-500/5 px-5 py-4 align-top font-medium text-emerald-300">
                          <span className="inline-flex items-center gap-2">
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            {row.guardianx}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* footer */}
              <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-900/40 px-5 py-3 text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono">
                  {"// Methodology: live production scans · 2025–2026 cohort"}
                </span>
                <span className="font-mono text-emerald-500/70">
                  GuardianX wins 7 / 7 metrics
                </span>
              </div>
            </div>
          </motion.section>

          {/* ─────────────── SECTION 4: DOCUMENTATION ─────────────── */}
          <motion.section
            custom={3}
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mb-24"
          >
            <SectionHeading
              eyebrow="// Section 04"
              title="Documentation & API Docs"
              icon={Code}
              accent="amber"
              subtitle="Everything your engineers need to integrate, automate, and audit GuardianX, from CI/CD hooks to cryptographic internals."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {DOCS.map((d, i) => (
                <DocCard key={i} {...d} index={i} />
              ))}
            </div>
          </motion.section>

          {/* ─────────────────────── CTA ─────────────────────── */}
          <motion.section
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="holo-card-sharp hud-corners relative overflow-hidden p-10 sm:p-14">
              <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-violet-500/15 blur-3xl"
              />
              <div className="relative text-center">
                <ShieldHalf className="mx-auto size-12 text-violet-300" />
                <h2 className="mt-4 text-3xl font-bold text-zinc-50 sm:text-4xl">
                  Ready to put GuardianX to the test?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  Book a live demo with a security engineer, compare plans, or
                  jump straight into the lab console and run your first scan in
                  under two minutes.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a href="/contact">
                    <Button
                      size="lg"
                      className="bg-violet-600 text-white hover:bg-violet-500 neon-border"
                    >
                      <Download className="size-5" /> Request a Demo
                    </Button>
                  </a>
                  <a href="/pricing">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/5 text-emerald-200 hover:bg-emerald-500/15"
                    >
                      <Award className="size-5" /> View Pricing
                    </Button>
                  </a>
                  <a href="/">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900 text-zinc-300"
                    >
                      <Terminal className="size-5" /> Enter the Lab
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SUBCOMPONENTS                                                      */
/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
  accent,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "violet" | "cyan" | "amber";
  subtitle?: string;
}) {
  const accentMap: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
    cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  };
  const titleColor: Record<string, string> = {
    emerald: "text-emerald-300",
    violet: "text-violet-300",
    cyan: "text-cyan-300",
    amber: "text-amber-300",
  };
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mb-8 flex items-start gap-4"
    >
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ${accentMap[accent]}`}
      >
        <Icon className="size-6" />
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {eyebrow}
        </div>
        <h2 className={`text-2xl font-bold sm:text-3xl ${titleColor[accent]}`}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{subtitle}</p>
        )}
      </div>
    </motion.div>
  );
}

function ResourceCard({
  icon: Icon,
  title,
  meta,
  desc,
  href,
  cta,
  accent,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  desc: string;
  href: string;
  cta: string;
  accent: "emerald" | "violet" | "cyan" | "amber";
  index: number;
}) {
  const accentMap: Record<string, { border: string; text: string; bg: string }> = {
    emerald: {
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    violet: {
      border: "border-violet-500/30",
      text: "text-violet-400",
      bg: "bg-violet-500/10",
    },
    cyan: {
      border: "border-cyan-500/30",
      text: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    amber: {
      border: "border-amber-500/30",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  };
  const a = accentMap[accent];
  return (
    <motion.a
      href={href}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ y: -4 }}
      className="group relative block"
    >
      <div className="holo-card-sharp hud-corners relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 group-hover:border-zinc-600">
        <div
          className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full ${a.bg} opacity-50 transition-opacity duration-500 group-hover:opacity-100`}
        />
        <div className="relative flex items-start gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border ${a.border} ${a.bg}`}
          >
            <Icon className={`size-5 ${a.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`font-mono text-[10px] uppercase tracking-widest ${a.text} opacity-80`}
            >
              {meta}
            </div>
            <h3 className="mt-1 text-base font-bold text-zinc-100">{title}</h3>
          </div>
        </div>
        <p className="relative mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
          {desc}
        </p>
        <div
          className={`relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium ${a.text} transition-transform duration-200 group-hover:translate-x-1`}
        >
          {cta}
          <ArrowRight className="size-4" />
          <ExternalLink className="size-3 opacity-60" />
        </div>
      </div>
    </motion.a>
  );
}

function CaseStudyCard({
  icon: Icon,
  company,
  location,
  quote,
  author,
  stats,
  accent,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  company: string;
  location: string;
  quote: string;
  author: string;
  stats: { label: string; value: string }[];
  accent: "emerald" | "cyan" | "violet";
  index: number;
}) {
  const accentMap: Record<string, { border: string; text: string; bg: string }> = {
    emerald: {
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    cyan: {
      border: "border-cyan-500/30",
      text: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    violet: {
      border: "border-violet-500/30",
      text: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  };
  const a = accentMap[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.1, duration: 0.55 }}
      whileHover={{ y: -4 }}
      className="group relative"
    >
      <div className="holo-card-sharp hud-corners relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 group-hover:border-zinc-600">
        <Quote className={`absolute right-4 top-4 size-8 ${a.text} opacity-20`} />
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${a.border} ${a.bg}`}
          >
            <Icon className={`size-5 ${a.text}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100">{company}</h3>
            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {location}
            </div>
          </div>
        </div>

        <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-300">
          “{quote}”
        </p>
        <div className="mt-3 font-mono text-[11px] text-zinc-500">- {author}</div>

        <div className="mt-5 space-y-2 border-t border-zinc-800 pt-4">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono uppercase tracking-wider text-zinc-600">
                {s.label}
              </span>
              <span className={`font-medium ${a.text}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function DocCard({
  icon: Icon,
  title,
  desc,
  note,
  href,
  accent,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  note?: string;
  href: string;
  accent: "emerald" | "cyan" | "violet" | "amber";
  index: number;
}) {
  const accentMap: Record<string, { border: string; text: string; bg: string }> = {
    emerald: {
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    cyan: {
      border: "border-cyan-500/30",
      text: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    violet: {
      border: "border-violet-500/30",
      text: "text-violet-400",
      bg: "bg-violet-500/10",
    },
    amber: {
      border: "border-amber-500/30",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  };
  const a = accentMap[accent];
  return (
    <motion.a
      href={href}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ y: -4 }}
      className="group relative block"
    >
      <div className="holo-card-sharp hud-corners relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 group-hover:border-zinc-600">
        <div className="flex items-start gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border ${a.border} ${a.bg}`}
          >
            <Icon className={`size-5 ${a.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-zinc-100">{title}</h3>
          </div>
          <Terminal className={`size-4 ${a.text} opacity-40`} />
        </div>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">{desc}</p>

        {note && (
          <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/90">
            <span className="font-mono">{"// Note: "}</span>
            {note}
          </div>
        )}

        <div
          className={`relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium ${a.text} transition-transform duration-200 group-hover:translate-x-1`}
        >
          View
          <ArrowRight className="size-4" />
          <ExternalLink className="size-3 opacity-60" />
        </div>
      </div>
    </motion.a>
  );
}
