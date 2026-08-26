"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Cloud, Zap, Radar, ShieldCheck, FileCheck2, Network,
  CreditCard, Briefcase, Swords, Boxes, CheckCircle2, ArrowRight,
  Sparkles, Mail, ListChecks, Clock, Target, Fingerprint,
  Terminal, FileText, Cpu, Globe, Lock, Gauge,
} from "lucide-react";

/* ----------------------------- DATA ----------------------------- */

const HERO_STATS = [
  { icon: Clock, label: "Full VAPT", value: "90s" },
  { icon: Gauge, label: "MTTR reduction", value: "85%" },
  { icon: Radar, label: "Exposure paths", value: "22+" },
  { icon: Lock, label: "Attestation", value: "SHA-256" },
];

const HERO_CHIPS = [
  { label: "By Use Case", color: "emerald", icon: Target },
  { label: "By Compliance", color: "cyan", icon: ShieldCheck },
  { label: "By Role", color: "violet", icon: Briefcase },
];

const USE_CASES = [
  {
    icon: Cloud,
    title: "Cloud Security Posture",
    desc: "GuardianX scans cloud-deployed code, Lambda, Cloud Run, ECS, for misconfigurations, exposed secrets in env vars, and IAM policy drift. SCA detects vulnerable dependencies in container images. Virtual patching generates WAF rules (ModSecurity, Cloudflare, iptables) for instant remediation. K8s manifest scanning. IaC remediation for Terraform / CloudFormation.",
    points: [
      "Misconfig + secret scanning for Lambda, Cloud Run, ECS & env vars",
      "IAM policy drift detection with least-privilege recommendations",
      "SCA on container images, OS packages and language dependencies",
      "Virtual patching: WAF rules for ModSecurity, Cloudflare, iptables, Nginx",
      "K8s manifest scanning + IaC remediation (Terraform / CloudFormation)",
    ],
  },
  {
    icon: Zap,
    title: "SOC Acceleration",
    desc: "Auto-discovers assets from a single URL and runs full VAPT in 90 seconds. AI-generated executive summaries for the C-suite. Real-time command center with live exploit terminal, network topology, and attack heatmap. Guardian AI chatbot answers 'what should I prioritize?' from live data. Slack / Teams webhook integration and email digest of daily security posture. Reduces mean-time-to-remediate by 85%.",
    points: [
      "Single-URL asset discovery → full VAPT in 90 seconds",
      "AI executive summaries written in C-suite business language",
      "Live command center: exploit terminal, network topology, attack heatmap",
      "Guardian AI chatbot, natural-language prioritization from live data",
      "Slack / Teams webhooks + daily email digest; 85% MTTR reduction",
    ],
  },
  {
    icon: Radar,
    title: "Exposure Management",
    desc: "Crawls live targets for exposed /.env, /.git/config, /backup.zip and 22+ known exposure paths. Sensitive data scanner detects AWS / Stripe / GitHub keys, JWTs, private keys, and SSNs in responses. Canary token injection across endpoints, detects exfiltration before data leaves. Honeypot endpoints trap attackers. Dark web monitoring for leaked credentials.",
    points: [
      "Crawls 22+ known exposure paths (.env, .git/config, backup.zip)",
      "Sensitive data detection, AWS / Stripe / GitHub keys, JWTs, private keys, SSNs",
      "Canary token injection across every endpoint",
      "Honeypot endpoints trap attackers in real time",
      "Dark web monitoring for leaked credentials tied to your domains",
    ],
  },
];

const COMPLIANCE = [
  {
    icon: ShieldCheck,
    title: "ISO 27001",
    desc: "Continuous control monitoring across Annex A.8–A.14. Automated evidence collection with hash-chained attestations. Annex A mapping for every finding. Audit-export generates compliance-ready PDF reports. Real-time gap analysis dashboard surfaces what is still missing before the auditor asks.",
    points: [
      "Continuous control monitoring across Annex A.8–A.14",
      "Automated evidence collection with SHA-256 hash-chained attestations",
      "Annex A mapping attached to every finding",
      "Compliance-ready PDF audit exports, one click",
      "Real-time gap-analysis dashboard",
    ],
  },
  {
    icon: FileCheck2,
    title: "SOC 2",
    desc: "Trust Services Criteria mapping across Security, Availability, and Confidentiality. Continuous monitoring of access controls, change management, and vulnerability remediation. Audit trail protected by a SHA-256 hash chain, tamper-evident by construction. Periodic attestation exports keep your auditor in sync without the quarterly fire-drill.",
    points: [
      "TSC mapping, Security, Availability, Confidentiality",
      "Continuous monitoring of access controls & change management",
      "Tamper-evident audit trail (SHA-256 hash chain)",
      "Periodic attestation exports for auditors",
      "Vulnerability remediation evidence vault",
    ],
  },
  {
    icon: Network,
    title: "NIST CSF 2.0",
    desc: "Full NIST CSF 2.0 mapping, Identify, Protect, Detect, Respond, Recover. Risk score per asset aligned to the NIST risk model. Auto-generated incident-response playbooks. Behavioral anomaly detection powers the Detect function, while rollback attestations prove the Recover control actually works.",
    points: [
      "NIST CSF 2.0 mapping, Identify, Protect, Detect, Respond, Recover",
      "Per-asset risk score aligned to the NIST risk model",
      "Auto-generated incident-response playbooks per threat scenario",
      "Behavioral anomaly detection powers the Detect function",
      "Recovery control verification + rollback attestations",
    ],
  },
  {
    icon: CreditCard,
    title: "PCI-DSS Continuous Audit",
    desc: "Continuous coverage for Requirement 6 (secure development) and Requirement 11 (continuous vulnerability scanning). SAST + DAST enforced on every commit. The patch attestation ledger proves remediation timelines to your QSA. Quarterly assessments are replaced by continuous audit, with Cardholder Data Environment (CDE) scoping and segmentation built in.",
    points: [
      "Continuous coverage for Req 6 (secure dev) + Req 11 (vuln scanning)",
      "SAST + DAST enforced on every commit",
      "Patch attestation ledger, proves remediation timelines to QSA",
      "Quarterly assessments replaced by continuous audit",
      "Cardholder Data Environment (CDE) scoping & segmentation",
    ],
  },
];

const ROLES = [
  {
    icon: Briefcase,
    title: "CISOs & Executives",
    desc: "Executive dashboard in business-risk language, not CVE numbers. AI-generated C-suite summaries. PostureScore (0–100) per client or business unit. Predictive risk scoring flags which asset is most likely to be breached next. DPDPA / GDPR compliance posture. Board-ready PDF reports with custom branding. SLA tracking against remediation timelines.",
    points: [
      "Executive dashboard in business-risk language, not CVE numbers",
      "PostureScore (0–100) per client / business unit",
      "Predictive risk scoring + DPDPA / GDPR posture",
      "Board-ready PDF reports with custom branding",
      "SLA tracking against remediation timelines",
    ],
  },
  {
    icon: Swords,
    title: "SecOps & Red Teams",
    desc: "Full VAPT in 90 seconds. RedAgent autonomous DAST engine. PoC exploit generation paired with an adversarial patch arena where a second AI attacks its own fix. Live exploit terminal with real HTTP payloads. Attack chain DAG visualization. Protocol fuzzer for HTTP / GraphQL / WebSocket. Business logic testing.",
    points: [
      "Full VAPT in 90 seconds from a single URL",
      "RedAgent autonomous DAST engine with real HTTP payloads",
      "PoC exploit generation + adversarial patch arena",
      "Attack chain DAG visualization across multi-step paths",
      "Protocol fuzzer (HTTP / GraphQL / WebSocket) + business logic testing",
    ],
  },
  {
    icon: Boxes,
    title: "Cloud Architects",
    desc: "Agentless deployment, no code changes, no sidecars. API-first architecture, fully scriptable. Blast-radius safety controls: authorized-only testing, scope enforcement, read-only by default. IaC remediation for Terraform / CloudFormation. K8s + container scanning. Virtual patching for zero-downtime remediation when a real patch can't ship immediately.",
    points: [
      "Agentless deployment, no code changes, no sidecars",
      "API-first architecture, fully scriptable from CI/CD",
      "Blast-radius safety: authorized-only testing, scope enforcement, read-only by default",
      "IaC remediation (Terraform / CloudFormation) + K8s & container scanning",
      "Virtual patching for zero-downtime remediation",
    ],
  },
];

/* ----------------------------- COMPONENT ----------------------------- */

type Card = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  points: string[];
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
  color: "emerald" | "cyan" | "violet";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap = {
    emerald: { ring: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-400" },
    cyan: { ring: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-400" },
    violet: { ring: "border-violet-500/40", bg: "bg-violet-500/10", text: "text-violet-400" },
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

function SolutionCard({
  card,
  color,
  index,
}: {
  card: Card;
  color: "emerald" | "cyan" | "violet";
  index: number;
}) {
  const colorMap = {
    emerald: {
      ring: "border-emerald-500/30",
      bg: "bg-emerald-500/5",
      text: "text-emerald-400",
      hoverBorder: "group-hover:border-emerald-500/50",
      glow: "from-emerald-500/10",
      check: "text-emerald-400",
      corner: "bg-emerald-500/5 group-hover:bg-emerald-500/10",
    },
    cyan: {
      ring: "border-cyan-500/30",
      bg: "bg-cyan-500/5",
      text: "text-cyan-400",
      hoverBorder: "group-hover:border-cyan-500/50",
      glow: "from-cyan-500/10",
      check: "text-cyan-400",
      corner: "bg-cyan-500/5 group-hover:bg-cyan-500/10",
    },
    violet: {
      ring: "border-violet-500/30",
      bg: "bg-violet-500/5",
      text: "text-violet-400",
      hoverBorder: "group-hover:border-violet-500/50",
      glow: "from-violet-500/10",
      check: "text-violet-400",
      corner: "bg-violet-500/5 group-hover:bg-violet-500/10",
    },
  } as const;
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: 10 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="group relative h-full"
    >
      <div
        className={`absolute -inset-0.5 rounded-xl bg-gradient-to-br ${c.glow} to-transparent opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div
        className={`holo-card-sharp hud-corners relative h-full overflow-hidden rounded-xl border border-zinc-700 p-6 transition-all duration-300 ${c.hoverBorder}`}
      >
        <div
          className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full ${c.corner} transition-all duration-500`}
        />
        <div className="relative flex h-full flex-col">
          <div className="mb-4 flex items-center gap-3">
            <div
              className={`flex size-11 items-center justify-center rounded-lg border ${c.ring} ${c.bg}`}
            >
              <card.icon className={`size-5 ${c.text}`} />
            </div>
            <h3 className={`text-base font-bold ${c.text}`}>{card.title}</h3>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">{card.desc}</p>
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
          <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6">
          {/* ===== HERO ===== */}
          <section className="py-20 sm:py-28">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 1, type: "spring" }}
                className="mb-8"
              >
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/20" />
                  <div
                    className="relative flex size-20 items-center justify-center rounded-2xl border border-emerald-500/50 bg-emerald-500/10"
                    style={{ boxShadow: "0 0 40px rgba(16,185,129,0.3)" }}
                  >
                    <Layers className="size-10 text-emerald-400" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <Sparkles className="size-3" /> Solutions
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="text-center text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl"
              >
                Security solutions for <br className="hidden sm:block" />
                <span className="gradient-text">every layer</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-6 max-w-2xl text-center text-base text-zinc-400 sm:text-lg"
              >
                Map GuardianX capabilities to your specific use case, compliance framework, or role.
                Whether you are hardening cloud posture, accelerating a SOC, proving compliance to an
                auditor, or leading a red team, there is a path through the platform built for you.
              </motion.p>

              {/* Hero chips */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-2"
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

              {/* Hero stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
                className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {HERO_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-700 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <stat.icon className="size-4 text-emerald-400" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                        {stat.label}
                      </span>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-zinc-50">{stat.value}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </section>

          {/* ===== SECTION 1, BY USE CASE ===== */}
          <section className="py-12">
            <SectionHeader
              index={1}
              total={3}
              title="By Use Case"
              color="emerald"
              Icon={Target}
              blurb="Three deployment patterns where GuardianX replaces a stack of point tools, cloud posture, SOC acceleration, and external exposure management."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((card, i) => (
                <SolutionCard key={card.title} card={card} color="emerald" index={i} />
              ))}
            </div>
          </section>

          {/* ===== SECTION 2, BY COMPLIANCE ===== */}
          <section className="py-12">
            <SectionHeader
              index={2}
              total={3}
              title="By Compliance"
              color="cyan"
              Icon={ShieldCheck}
              blurb="Continuous control monitoring and hash-chained evidence for the frameworks your auditors actually ask about, ISO 27001, SOC 2, NIST CSF 2.0, and PCI-DSS."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {COMPLIANCE.map((card, i) => (
                <SolutionCard key={card.title} card={card} color="cyan" index={i} />
              ))}
            </div>
          </section>

          {/* ===== SECTION 3, BY ROLE ===== */}
          <section className="py-12">
            <SectionHeader
              index={3}
              total={3}
              title="By Role"
              color="violet"
              Icon={Briefcase}
              blurb="A dedicated surface for every stakeholder, from CISOs who need board-ready risk language, to SecOps teams running live exploits, to cloud architects who need agentless, blast-radius-safe scanning."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((card, i) => (
                <SolutionCard key={card.title} card={card} color="violet" index={i} />
              ))}
            </div>
          </section>

          {/* ===== CTA ===== */}
          <section className="py-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="holo-card-sharp hud-corners relative overflow-hidden p-10 sm:p-14"
            >
              <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl"
              />
              <div className="relative flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  whileInView={{ scale: 1, rotate: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring" }}
                  className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/10"
                >
                  <Layers className="size-7 text-emerald-400 neon-emerald" />
                </motion.div>
                <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                  Map GuardianX to your security program
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  See a live walkthrough against your own targets. One URL in, full VAPT, AI patches,
                  compliance mapping, and a board-ready report out.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <a href="/contact">
                    <Button
                      size="lg"
                      className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                    >
                      <Mail className="size-5" /> Request a Demo <ArrowRight className="size-4" />
                    </Button>
                  </a>
                  <a href="/features">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      <ListChecks className="size-5" /> Explore Features
                    </Button>
                  </a>
                </div>

                {/* Trust strip */}
                <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-zinc-800/60 pt-6 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="size-3 text-emerald-500/60" /> Agentless
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Terminal className="size-3 text-emerald-500/60" /> API-first
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3 text-emerald-500/60" /> SHA-256 attestation
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-3 text-emerald-500/60" /> Board-ready reports
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3 text-emerald-500/60" /> DPDPA / GDPR
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Fingerprint className="size-3 text-emerald-500/60" /> 2FA + RBAC
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
