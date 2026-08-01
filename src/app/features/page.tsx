"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldHalf, Bug, Crosshair, Swords, FileCode2, KeyRound, Gauge,
  Globe, Wand2, Heart, Link2, FileText, Gavel, Lock, Skull,
  ScanLine, Radar, Network, GitBranch, AlertTriangle, Workflow,
  Eye, Webhook, Brain, Rocket, FlaskConical, Shield, Cpu,
  Activity, ArrowRight, Terminal, ShieldCheck, RotateCcw,
} from "lucide-react";

const FEATURE_CATEGORIES = [
  {
    title: "Offensive Security",
    color: "red",
    icon: Crosshair,
    features: [
      { icon: Bug, title: "AI Vulnerability Detection", desc: "AI reads your source code, identifies exploitable vulnerabilities with CWE/CVE mapping, confidence scores, and exact vulnerable snippets.", color: "red" },
      { icon: Crosshair, title: "PoC Exploit Playground", desc: "AI generates working proof-of-concept exploits. Run against original code to prove the vuln, then against patched code to prove the fix.", color: "orange" },
      { icon: Swords, title: "Adversarial Red-Team Arena", desc: "After patching, a second AI attacks its own fix. If it finds a bypass, the defender iterates. Loop until the attacker concedes.", color: "amber" },
      { icon: Crosshair, title: "RedAgent DAST VAPT Engine", desc: "Autonomous penetration testing. AI crawls, plans attacks per OWASP category, fires real HTTP payloads, confirms exploitation with evidence.", color: "red" },
      { icon: ScanLine, title: "Sensitive Data Exposure Scanner", desc: "Detects exposed AWS/Stripe/GitHub keys, JWTs, private keys, passwords, SSNs. Probes 22+ known exposure paths. All samples redacted.", color: "purple" },
      { icon: Workflow, title: "Protocol Fuzzer", desc: "Mutation-based fuzzing for HTTP/GraphQL/WebSocket. Integer overflows, string boundaries, JSON structure mutations to reveal edge-case faults.", color: "amber" },
      { icon: Network, title: "Attack Graph DAG", desc: "AI models how low-severity issues chain into full compromise. Multi-step attack paths visualized as a Directed Acyclic Graph.", color: "red" },
    ],
  },
  {
    title: "Defensive Security",
    color: "emerald",
    icon: Shield,
    features: [
      { icon: ShieldCheck, title: "AI Patch Generation", desc: "For every vulnerability, AI generates a production-ready fix with test code. Sandbox verifies the fix works before human review.", color: "emerald" },
      { icon: Heart, title: "Self-Healing Runtime", desc: "Live runtime monitoring tracks vulnerable vs healed functions. One-click hot-swap deploys patched code with zero downtime.", color: "rose" },
      { icon: Link2, title: "Cryptographic Patch Attestation", desc: "Every approved patch is hash-chained into an immutable SHA-256 ledger. Tamper-evident — any modification breaks the chain.", color: "teal" },
      { icon: Shield, title: "Data Exfiltration Defense", desc: "Inject canary tokens, deploy honeypot endpoints, monitor data flows in real-time. Detect exfiltration before data leaves.", color: "rose" },
      { icon: Shield, title: "Virtual Patching", desc: "Can't patch immediately? Auto-generate WAF rules (ModSecurity, Cloudflare, iptables, Nginx) as virtual patches.", color: "rose" },
      { icon: Eye, title: "Behavioral Anomaly Detection", desc: "Flags deviations from baseline: web server executing shells, unexpected high CPU, binary modifications, hidden user creation.", color: "cyan" },
    ],
  },
  {
    title: "Intelligence & Analytics",
    color: "cyan",
    icon: Brain,
    features: [
      { icon: Globe, title: "Continuous Threat Intel", desc: "Monitors live CVE disclosures via web search, cross-references against your codebases. New 0-day? GuardianX flags it before you've heard of it.", color: "cyan" },
      { icon: Brain, title: "Guardian AI Assistant", desc: "Natural language interface. Ask 'what should I prioritize?' — get real answers from live data.", color: "violet" },
      { icon: AlertTriangle, title: "Anomaly Detection Alerts", desc: "Detects: finding spikes, stuck scans, canary triggers, patch review bottlenecks, unauthorized targets.", color: "amber" },
      { icon: Gauge, title: "Predictive Risk Score", desc: "AI predicts which client is most likely to be breached based on findings, patch velocity, and behavioral patterns.", color: "rose" },
      { icon: Activity, title: "PostureScore", desc: "0-100 security credit score per codebase. Computed from open vulns, sandbox pass rates, adversarial win rates.", color: "emerald" },
      { icon: Gauge, title: "Risk Trend Charts", desc: "30/60/90-day visualizations showing risk score, finding count, and patch velocity over time.", color: "cyan" },
      { icon: Skull, title: "Dark Web Monitoring", desc: "Continuously scans breach databases for leaked credentials matching your domains.", color: "red" },
    ],
  },
  {
    title: "R&D Lab — Self-Improving",
    color: "violet",
    icon: FlaskConical,
    features: [
      { icon: FlaskConical, title: "GitHub Tool Research Agent", desc: "Searches GitHub for open-source security tools, AI analyzes their code, extracts optimizations, integrates into our modules.", color: "violet" },
      { icon: Gauge, title: "Benchmark Engine", desc: "Runs performance benchmarks: GuardianX vs baseline OSS tools. Measures speed, accuracy, memory.", color: "emerald" },
      { icon: AlertTriangle, title: "Gap Analysis", desc: "AI compares each module against best-in-class tools. Documents where they perform better.", color: "amber" },
      { icon: FileCode2, title: "IaC Remediation", desc: "Generates Terraform, Ansible, Kubernetes, Docker manifests to patch at the deployment template level.", color: "sky" },
      { icon: RotateCcw, title: "Rollback Safeguards", desc: "Pre-patch state capture, post-patch health checks, auto-rollback if service crashes.", color: "emerald" },
    ],
  },
  {
    title: "Operations & Platform",
    color: "emerald",
    icon: Rocket,
    features: [
      { icon: Rocket, title: "One-Click Full VAPT", desc: "Enter a URL, click one button. Discovers assets, runs recon, launches SAST+DAST, scans secrets, generates report.", color: "emerald" },
      { icon: Cpu, title: "Command Center", desc: "Real-time dashboard: live exploit terminal, network topology map, process tree, threat level gauge, AI briefing.", color: "cyan" },
      { icon: Activity, title: "War Room Mode", desc: "Fullscreen display for wall projection. Auto-cycling views with giant KPI numbers.", color: "cyan" },
      { icon: Brain, title: "AI Threat Briefing", desc: "Every 5 minutes, AI generates a 3-bullet threat briefing: what's critical, what's improving, what needs attention.", color: "violet" },
      { icon: GitBranch, title: "CI/CD Integration", desc: "Trigger scans from GitHub Actions. Merge-blocking when critical vulnerabilities found.", color: "emerald" },
      { icon: Webhook, title: "Slack/Teams Integration", desc: "Real-time alerts in Slack when critical vuln found, attack blocked, canary triggered.", color: "emerald" },
      { icon: FileText, title: "Professional VAPT Reports", desc: "15-page PDF with front page, TOC, executive summary, methodology, findings, PoC evidence, compliance mapping.", color: "emerald" },
      { icon: FileText, title: "Executive Summary (AI)", desc: "AI writes a C-suite summary: overall risk, key findings, business impact, recommended actions.", color: "amber" },
      { icon: Gavel, title: "Compliance Mapping", desc: "Auto-maps findings to DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2, NIST, OWASP Top 10.", color: "purple" },
      { icon: Lock, title: "2FA Authentication", desc: "TOTP-based two-factor auth with backup codes. Required for admin accounts.", color: "emerald" },
      { icon: Eye, title: "Client Portal", desc: "White-label portal for clients to view their own security posture. Self-service.", color: "sky" },
      { icon: FileText, title: "Custom Report Branding", desc: "Upload your logo, choose accent colors. VAPT PDFs use your branding. Perfect for MSSPs.", color: "violet" },
    ],
  },
];

export default function FeaturesPage() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  return (
    <div ref={containerRef} className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <motion.div animate={{ x: [0, 200, 0], y: [0, -100, 0], scale: [1, 1.3, 1] }} transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-emerald-500/8 blur-[150px]" />
        <motion.div animate={{ x: [0, -150, 0], y: [0, 100, 0], scale: [1, 1.5, 1] }} transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-violet-500/8 blur-[150px]" />
        <motion.div animate={{ x: [0, 100, 0], y: [0, -80, 0], scale: [1, 1.2, 1] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/2 left-1/2 h-[400px] w-[400px] rounded-full bg-red-500/5 blur-[150px]" />
      </div>

      <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-4">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 1, type: "spring" }} className="mb-8">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/20" />
            <div className="relative flex size-20 items-center justify-center rounded-2xl border border-emerald-500/50 bg-emerald-500/10" style={{ boxShadow: "0 0 40px rgba(16,185,129,0.3)" }}>
              <ShieldHalf className="size-10 text-emerald-400" />
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Cpu className="size-3" /> 50+ Modules · 5 Categories</Badge>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8 }} className="text-center text-5xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-7xl">
          Everything you need<br />to <span className="gradient-text">secure your code</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6 max-w-2xl text-center text-lg text-zinc-400">
          From AI-powered vulnerability detection to autonomous penetration testing, from self-healing patches to compliance-ready reports.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-10 flex gap-4">
          <a href="/"><Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"><Terminal className="size-5" /> Enter Lab Console</Button></a>
          <a href="/pricing"><Button size="lg" variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">View Pricing</Button></a>
        </motion.div>
      </motion.div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        {FEATURE_CATEGORIES.map((category, catIdx) => (
          <motion.div key={catIdx} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-20">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="mb-8 flex items-center gap-4">
              <motion.div initial={{ scale: 0, rotate: -90 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ type: "spring" }} className={`flex size-12 items-center justify-center rounded-xl border border-${category.color}-500/40 bg-${category.color}-500/10`}>
                <category.icon className={`size-6 text-${category.color}-400`} />
              </motion.div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">{`// Category ${catIdx + 1}`}</div>
                <h2 className={`text-2xl font-bold text-${category.color}-400`}>{category.title}</h2>
              </div>
            </motion.div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {category.features.map((feature, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 30, rotateX: 10 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }} whileHover={{ y: -6, scale: 1.03 }} className="group relative">
                  <div className={`absolute -inset-0.5 rounded-xl bg-gradient-to-br from-${feature.color}-500/10 to-transparent opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100`} />
                  <div className="holo-card-sharp hud-corners relative h-full overflow-hidden rounded-xl border border-zinc-700 p-5 transition-all duration-300 group-hover:border-zinc-600">
                    <div className={`absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-${feature.color}-500/5 transition-all duration-500 group-hover:bg-${feature.color}-500/10`} />
                    <div className="relative">
                      <div className={`mb-3 flex size-10 items-center justify-center rounded-lg border border-${feature.color}-500/30 bg-${feature.color}-500/5`}>
                        <feature.icon className={`size-5 text-${feature.color}-400`} />
                      </div>
                      <h3 className={`text-sm font-bold text-${feature.color}-400`}>{feature.title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{feature.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="text-center">
          <div className="holo-card-sharp hud-corners relative overflow-hidden p-12">
            <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative">
              <ShieldHalf className="mx-auto size-12 text-emerald-400 neon-emerald" />
              <h2 className="mt-4 text-3xl font-bold text-zinc-50">Ready to secure everything?</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">50+ modules. One platform. One click. Full VAPT.</p>
              <a href="/"><Button size="lg" className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500 neon-border"><Rocket className="size-5" /> Enter the Lab Console <ArrowRight className="size-4" /></Button></a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
