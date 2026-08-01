"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import {
  ShieldHalf,
  Shield,
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
  Lock,
  Bug,
  Radar,
  ShieldCheck,
  Skull,
  ScanLine,
  Network,
  Database,
  Cpu,
  Activity,
  Zap,
  Eye,
  Fingerprint,
  Webhook,
  GitBranch,
  Server,
  AlertTriangle,
  Workflow,
  Containers,
  Brain,
  Rocket,
  FlaskConical,
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
    neon: "neon-red",
    border: "border-red-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(239,68,68,0.2)]",
    bg: "bg-red-500/5",
  },
  {
    icon: Crosshair,
    title: "PoC Exploit Playground",
    category: "Exploit",
    desc: "For every vulnerability, the AI generates a working proof-of-concept exploit. Run it against the original code to prove the vuln is real, then against the patched code to prove the fix works.",
    color: "text-orange-400",
    neon: "neon-orange",
    border: "border-orange-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(249,115,22,0.2)]",
    bg: "bg-orange-500/5",
  },
  {
    icon: Swords,
    title: "Adversarial Red-Team Arena",
    category: "Self-Attack",
    desc: "After patching, a second AI persona attacks its own fix. If it finds a bypass, the defender iterates. Loop until the attacker concedes — the patch is battle-tested before human review.",
    color: "text-amber-400",
    neon: "neon-amber",
    border: "border-amber-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]",
    bg: "bg-amber-500/5",
  },
  {
    icon: Crosshair,
    title: "RedAgent VAPT Engine",
    category: "DAST",
    desc: "Autonomous penetration testing against live targets. The AI crawls the app, plans category-appropriate attacks, fires real HTTP payloads, and confirms exploitation with full evidence.",
    color: "text-red-400",
    neon: "neon-red",
    border: "border-red-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(239,68,68,0.2)]",
    bg: "bg-red-500/5",
  },
  {
    icon: ScanLine,
    title: "Sensitive Data Exposure Scanner",
    category: "Secrets",
    desc: "Systematically detects exposed AWS/Stripe/GitHub keys, JWTs, private keys, passwords, SSNs, and credit cards. Probes 22+ known exposure paths. All samples redacted — proves the leak without exfiltrating.",
    color: "text-purple-400",
    neon: "neon-purple",
    border: "border-purple-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(168,85,247,0.2)]",
    bg: "bg-purple-500/5",
  },
  {
    icon: FileText,
    title: "Professional VAPT Reports",
    category: "Reporting",
    desc: "Generate a 15-page PDF VAPT report with front page, TOC, document control, executive summary, methodology, findings master table, detailed PoC evidence, compliance mapping, and cleanup certificate.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: KeyRound,
    title: "Encrypted Git Integration",
    category: "Credentials",
    desc: "Connect real private repos with AES-256-GCM encrypted credentials. Tokens are encrypted at rest, never shown again, never leaked in logs. Clone, explore, and import files for scanning.",
    color: "text-sky-400",
    neon: "neon-sky",
    border: "border-sky-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(14,165,233,0.2)]",
    bg: "bg-sky-500/5",
  },
  {
    icon: Gauge,
    title: "PostureScore",
    category: "Metrics",
    desc: "A 0–100 security credit score per codebase, computed from open vulns, sandbox pass rates, and adversarial win rates. Letter grades A–F. Trend over time. Exec-friendly at-a-glance posture.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: Globe,
    title: "Continuous Threat Intel",
    category: "Live Feed",
    desc: "Monitors live CVE disclosures via web search and cross-references them against your codebases. New 0-day for a lib you use? GuardianX flags it high-relevance before you've heard of it.",
    color: "text-cyan-400",
    neon: "neon-cyan",
    border: "border-cyan-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(6,182,212,0.2)]",
    bg: "bg-cyan-500/5",
  },
  {
    icon: Wand2,
    title: "AI Remediation Copilot",
    category: "Copilot",
    desc: "Inside every patch: ask the AI to explain the fix, generate an improved production-ready version, or produce a hardened defense-in-depth variant with input validation and rate limiting.",
    color: "text-violet-400",
    neon: "neon-violet",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
    bg: "bg-violet-500/5",
  },
  {
    icon: Heart,
    title: "Self-Healing Runtime",
    category: "Runtime",
    desc: "Live runtime monitoring tracks which functions are vulnerable vs healed. One-click hot-swap deploys a patched function at runtime with zero downtime. Auto-heal when an attack is detected.",
    color: "text-rose-400",
    neon: "neon-rose",
    border: "border-rose-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(244,63,94,0.2)]",
    bg: "bg-rose-500/5",
  },
  {
    icon: Link2,
    title: "Cryptographic Patch Attestation",
    category: "Trust",
    desc: "Every approved patch is hash-chained into an immutable SHA-256 ledger. Tamper-evident: any modification to a past attestation breaks every subsequent hash. Enterprise-grade audit trail.",
    color: "text-teal-400",
    neon: "neon-teal",
    border: "border-teal-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(20,184,166,0.2)]",
    bg: "bg-teal-500/5",
  },
  {
    icon: Gavel,
    title: "DPDPA & Multi-Framework Compliance",
    category: "GRC",
    desc: "Map every finding to DPDPA 2023, GDPR, HIPAA, PCI-DSS, ISO 27001, and SOC 2. Track section-level compliance, generate audit reports, and auto-draft 72-hour breach notifications.",
    color: "text-purple-400",
    neon: "neon-purple",
    border: "border-purple-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(168,85,247,0.2)]",
    bg: "bg-purple-500/5",
  },
  {
    icon: Lock,
    title: "Data Privacy Scanner",
    category: "Privacy",
    desc: "Detect PII collection without consent, plaintext password storage, cross-border data transfer risks, and data retention violations — all mapped to specific DPDPA sections.",
    color: "text-indigo-400",
    neon: "neon-violet",
    border: "border-indigo-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(99,102,241,0.2)]",
    bg: "bg-indigo-500/5",
  },
  {
    icon: Skull,
    title: "Dark Web Monitoring",
    category: "SOC",
    desc: "Continuously scans breach databases and dark web sources for leaked credentials, passwords, and data dumps matching your domains. Get alerted before attackers use your leaked data.",
    color: "text-red-400",
    neon: "neon-red",
    border: "border-red-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(239,68,68,0.2)]",
    bg: "bg-red-500/5",
  },
  {
    icon: Activity,
    title: "Security KPI Dashboard",
    category: "Metrics",
    desc: "Real-time security metrics: MTTD, MTTR, vulnerability density per KLOC, sandbox pass rate, adversarial win rate, resolution rate. 7-day trends with severity breakdowns.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: Radar,
    title: "Attack Surface Management",
    category: "Discovery",
    desc: "Continuously discover exposed services, open ports, and missing security headers on your live targets. Real-time risk assessment with per-endpoint exposure tracking.",
    color: "text-cyan-400",
    neon: "neon-cyan",
    border: "border-cyan-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(6,182,212,0.2)]",
    bg: "bg-cyan-500/5",
  },
  {
    icon: Network,
    title: "Data Exfiltration Defense",
    category: "Defense",
    desc: "Inject canary tokens into your data and monitor for exfiltration. Deploy honeypot endpoints to trap attackers. Real-time data flow monitoring detects suspicious outbound transfers.",
    color: "text-rose-400",
    neon: "neon-rose",
    border: "border-rose-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(244,63,94,0.2)]",
    bg: "bg-rose-500/5",
  },
  {
    icon: ScanLine,
    title: "Web Scraping Audit Engine",
    category: "Audit",
    desc: "Dual-mode (lightweight + browser) scraping engine with PII sanitization. Extract structured data from any URL, detect leaked credentials in responses, and generate integrity-hashed audit trails.",
    color: "text-violet-400",
    neon: "neon-violet",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
    bg: "bg-violet-500/5",
  },
  {
    icon: GitBranch,
    title: "CI/CD Integration",
    category: "DevSecOps",
    desc: "Trigger scans from GitHub Actions, GitLab CI, or Jenkins. Merge-blocking when critical vulnerabilities are found. PR comments with patch suggestions. Full DevSecOps pipeline integration.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: AlertTriangle,
    title: "AI Attack Chain Synthesis",
    category: "Correlation",
    desc: "AI correlates individual vulnerabilities into multi-step attack chains. See how a low-severity XSS + a medium-severity IDOR + an info disclosure can chain into full account takeover.",
    color: "text-amber-400",
    neon: "neon-amber",
    border: "border-amber-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]",
    bg: "bg-amber-500/5",
  },
  {
    icon: Workflow,
    title: "API Fuzzing + Business Logic Testing",
    category: "Testing",
    desc: "Stateful API fuzzing crashes endpoints with malformed inputs. Business logic testing detects price manipulation, privilege escalation, and race conditions. GraphQL + WebSocket testing included.",
    color: "text-orange-400",
    neon: "neon-orange",
    border: "border-orange-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(249,115,22,0.2)]",
    bg: "bg-orange-500/5",
  },
  {
    icon: Eye,
    title: "Executive Dashboard + Heatmap",
    category: "Visibility",
    desc: "Board-ready security posture dashboard with 8 KPIs, 7-day trends, top threats, and severity breakdowns. Per-codebase risk heatmap. Vuln correlation engine for root-cause analysis.",
    color: "text-cyan-400",
    neon: "neon-cyan",
    border: "border-cyan-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(6,182,212,0.2)]",
    bg: "bg-cyan-500/5",
  },
  {
    icon: Webhook,
    title: "Multi-Tenant RBAC + Integrations",
    category: "Platform",
    desc: "Organization-level multi-tenancy with admin/analyst/viewer roles. Integrate with Slack, Jira, GitHub, Splunk, ELK, PagerDuty. Webhook alerts + scheduled scans + full audit logging.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: Brain,
    title: "Guardian AI Assistant",
    category: "AI",
    desc: "Natural language interface to the entire platform. Ask 'what should I prioritize?' or 'which client has the most critical findings?' and get real answers from live data. Chat sidebar with context.",
    color: "text-violet-400",
    neon: "neon-violet",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
    bg: "bg-violet-500/5",
  },
  {
    icon: Rocket,
    title: "Service Launcher + War Room",
    category: "Operations",
    desc: "Pick clients, pick a service (Scan/Test/Patch/Verify/Defend/Comply), launch. War Room fullscreen mode for wall projection with auto-cycling views. Clickable pipeline stages per client.",
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  {
    icon: FlaskConical,
    title: "Autonomous R&D Lab",
    category: "Self-Improving",
    desc: "Searches GitHub for open-source security tools, AI analyzes their code, performs gap analysis vs our modules, and generates optimization recommendations. Benchmark engine, protocol fuzzer, attack graph DAG, behavioral monitor, virtual patching, IaC remediation, rollback safeguards.",
    color: "text-violet-400",
    neon: "neon-violet",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
    bg: "bg-violet-500/5",
  },
  {
    icon: Shield,
    title: "Virtual Patching + IaC Remediation",
    category: "Defense",
    desc: "Can't patch code immediately? Auto-generate WAF rules (ModSecurity, Cloudflare, iptables, Nginx) as virtual patches. Generate Terraform, Ansible, K8s, Docker manifests to patch at the deployment template level.",
    color: "text-rose-400",
    neon: "neon-rose",
    border: "border-rose-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(244,63,94,0.2)]",
    bg: "bg-rose-500/5",
  },
];

const PIPELINE_STEPS = [
  { icon: FileCode2, label: "Analyze", desc: "AI scans source code", color: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  { icon: Crosshair, label: "Exploit", desc: "Generate + verify PoC", color: "text-red-400", border: "border-red-500/40", bg: "bg-red-500/10" },
  { icon: ShieldCheck, label: "Patch", desc: "AI writes the fix", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  { icon: Swords, label: "Attack", desc: "Red-team tries to break it", color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  { icon: ShieldCheck, label: "Defend", desc: "Iterate until secure", color: "text-teal-400", border: "border-teal-500/40", bg: "bg-teal-500/10" },
  { icon: Bug, label: "Review", desc: "Human approves", color: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10" },
];

const STATS = [
  { value: "50+", label: "Security Modules", color: "neon-emerald", text: "text-emerald-400" },
  { value: "100%", label: "AI-Driven", color: "neon-cyan", text: "text-cyan-400" },
  { value: "7-Stage", label: "Client Pipeline", color: "neon-amber", text: "text-amber-400" },
  { value: "SHA-256", label: "Attestation Ledger", color: "neon-violet", text: "text-violet-400" },
];

const TECH_STACK = [
  "Next.js 16", "TypeScript", "Supabase", "Railway Engine", "Socket.IO",
  "ReportLab", "Bun Runtime", "Python 3", "Playwright", "AES-256-GCM",
  "SHA-256 Ledger", "OWASP Top 10", "CVSS v3.1", "DPDPA 2023",
];

const COMPLIANCE = ["OWASP Top 10", "PCI-DSS", "ISO 27001", "SOC 2", "NIST", "DPDPA", "GDPR", "HIPAA"];

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="scanlines cyber-vignette premium-bg relative min-h-screen overflow-hidden text-zinc-100">
      {/* Matrix rain background */}
      <MatrixRainBG />

      {/* Ambient glows — multi-color */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 left-0 h-80 w-80 rounded-full bg-violet-600/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-red-600/8 blur-3xl" />
      </div>

      <div className="relative z-10">
        <SiteHeader onEnter={onEnter} />

        {/* Hero */}
        <section className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-24 py-20 text-center sm:px-6 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 neon-border">
              <Zap className="size-3" />
              Autonomous Security Operations Platform
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
              Security that{" "}
              <span className="neon-emerald">thinks</span>,{" "}
              <span className="neon-red">attacks</span>, and{" "}
              <span className="neon-violet">heals itself</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              The first platform to close the loop from code to live target to patch to report —
              all AI-driven. Autonomous SAST, DAST, exploit generation, adversarial patching,
              behavioral defense, virtual patching, IaC remediation, and a self-improving R&D lab
              that studies open-source tools to optimize its own modules.
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
                Explore 50+ Modules
              </a>
            </div>
          </motion.div>

          {/* Hero stats strip — vibrant multi-color */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {STATS.map((s, i) => (
              <div key={i} className="neon-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.text} ${s.color}`}>{s.value}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Live Command Center Demo */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
              {"// Live Command Center"}
            </div>
            <h2 className="text-3xl font-bold text-zinc-50">See it in action</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Real-time exploit terminal, network topology, threat radar, and AI threat briefing — all in one dashboard.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Terminal Demo */}
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="neon-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">Live Exploit Terminal</span>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black/80 p-3 font-mono text-[10px] leading-relaxed">
                <div className="text-emerald-400">$ redagent --target https://app.target.com</div>
                <div className="text-zinc-400">[*] Crawling endpoints...</div>
                <div className="text-emerald-300">[+] Found 42 endpoints</div>
                <div className="text-zinc-400">[*] Testing SQL injection on /api/login...</div>
                <div className="text-red-400">[!] VULNERABLE: SQL injection confirmed</div>
                <div className="text-amber-400">[*] Payload: ' OR 1=1-- bypassed auth</div>
                <div className="text-emerald-300">[+] Exploit confirmed — finding saved</div>
                <div className="text-zinc-400">[*] Generating patch...</div>
                <div className="text-emerald-400">[+] Patch: SP-2026-001 | Sandbox: PASSED</div>
                <div className="text-emerald-300">[✓] Safe to deploy</div>
                <span className="animate-pulse text-emerald-400">█</span>
              </div>
            </motion.div>

            {/* Pipeline Demo */}
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="neon-card p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cyan-400/60">7-Stage Pipeline</div>
              <div className="space-y-2">
                {[
                  { stage: "Onboard", status: "✓ Complete", color: "emerald" },
                  { stage: "Scan", status: "✓ 26 vulns found", color: "cyan" },
                  { stage: "Test", status: "✓ 6 exploits confirmed", color: "amber" },
                  { stage: "Patch", status: "⚡ 13 patches generated", color: "violet" },
                  { stage: "Verify", status: "○ Pending", color: "zinc" },
                  { stage: "Defend", status: "○ Pending", color: "zinc" },
                  { stage: "Comply", status: "○ Pending", color: "zinc" },
                ].map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded border border-${s.color}-500/20 bg-${s.color}-500/5 p-2`}>
                    <span className={`flex size-5 items-center justify-center rounded-full bg-${s.color}-500/20 text-[10px] font-bold text-${s.color}-400`}>{i + 1}</span>
                    <span className="text-xs font-medium text-zinc-200">{s.stage}</span>
                    <span className={`ml-auto text-[10px] text-${s.color}-400`}>{s.status}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* KPI Demo */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="neon-card p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">Real-Time KPIs</div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "CLIENTS", value: "7", color: "text-emerald-400" },
                  { label: "ACTIVE", value: "4", color: "text-cyan-400" },
                  { label: "PATCHES", value: "26", color: "text-violet-400" },
                  { label: "CRITICAL", value: "3", color: "text-red-400" },
                ].map((k, i) => (
                  <div key={i} className="rounded border border-zinc-800 bg-zinc-900/40 p-2 text-center">
                    <div className={`text-xl font-bold font-mono ${k.color}`}>{k.value}</div>
                    <div className="text-[8px] font-mono uppercase tracking-wider text-zinc-600">{k.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* AI Briefing Demo */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="neon-card p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-violet-400/60">AI Threat Briefing</div>
              <div className="space-y-2">
                <div className="rounded border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-300">
                  🔴 Initech and Stark each have 1 critical finding — prioritize remediation
                </div>
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300">
                  🟡 Wayne Enterprises unauthorized — validate access urgently
                </div>
                <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">
                  🟢 Globex is actively patching (8 pending) — monitor progress
                </div>
              </div>
            </motion.div>
          </div>

          <div className="mt-8 text-center">
            <a href="/">
              <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                <Terminal className="size-5" /> Try the Live Console
              </Button>
            </a>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              {"// Trusted By"}
            </div>
            <h2 className="text-3xl font-bold text-zinc-50">Security leaders choose GuardianX</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { quote: "GuardianX found 3 critical vulnerabilities our manual pentest missed. The AI-generated patches saved us 2 weeks of developer time.", author: "CISO", company: "FinTech Startup, Bangalore", color: "emerald" },
              { quote: "We replaced our entire VAPT vendor with GuardianX. Same quality report, 10% of the cost, delivered in 90 seconds instead of 2 weeks.", author: "Head of Security", company: "Healthcare Platform, Mumbai", color: "cyan" },
              { quote: "The R&D Lab is incredible — it studies open-source tools and improves its own modules. No other security platform does this.", author: "CTO", company: "SaaS Company, Delhi", color: "violet" },
            ].map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className={`neon-card p-5 border border-${t.color}-500/20`}
              >
                <div className={`mb-3 text-3xl font-bold text-${t.color}-400/30`}>"</div>
                <p className="text-xs leading-relaxed text-zinc-300">{t.quote}</p>
                <div className="mt-4 border-t border-zinc-800 pt-3">
                  <div className={`text-xs font-bold text-${t.color}-400`}>{t.author}</div>
                  <div className="text-[10px] text-zinc-500">{t.company}</div>
                </div>
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
              <span className="neon-emerald text-emerald-400 font-bold">50+ integrated modules</span> across SAST, DAST, AI autonomy, active defense, R&D engineering, and multi-tenant operations.
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
                className={`neon-card group p-5 border ${f.border} ${f.glow} ${f.bg}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className={`flex size-10 items-center justify-center rounded-lg border ${f.border} bg-zinc-950/60`}>
                    <f.icon className={`size-5 ${f.color}`} />
                  </div>
                  <Badge variant="outline" className={`border-zinc-700 bg-zinc-900/50 text-[9px] uppercase tracking-wider ${f.color}`}>
                    {f.category}
                  </Badge>
                </div>
                <h3 className={`text-sm font-bold ${f.color}`}>{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Tech badges */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="neon-card p-8 text-center">
            <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              {"// Built On"}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {TECH_STACK.map((tech) => (
                <span key={tech} className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 font-mono text-xs text-emerald-300/80 neon-border">
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
            className="holo-card-sharp relative overflow-hidden p-10 text-center"
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
        <SiteFooter />
      </div>
    </div>
  );
}

// Inline matrix rain (lighter version for landing)
function MatrixRainBG() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-30">
      <div className="cyber-grid absolute inset-0 opacity-60" />
    </div>
  );
}
