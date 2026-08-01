"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Network, GitBranch, Server, Cpu, KeyRound, Boxes, Workflow,
  ArrowRight, ArrowDown, CheckCircle2, Terminal, Globe, Layers,
  Zap, Shield, Lock, Eye, ShieldCheck, FileText, Braces,
  Database, ScanLine, Gavel,
  UserCheck, Crosshair, Wand2, MonitorSmartphone,
} from "lucide-react";

export default function ArchitecturePage() {
  const fadeUp = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
  } as const;

  /* ------------------------------------------------------------------ */
  /* SECTION 1 — Deployment Model                                        */
  /* ------------------------------------------------------------------ */
  const DEPLOYMENT = [
    {
      icon: Network,
      title: "No Agents, No Sidecars",
      desc: "GuardianX operates entirely through API calls and HTTP probing. No software installed on your servers, no daemon processes, no kernel modules. Zero runtime overhead on production systems. Works with any cloud (AWS, GCP, Azure) or on-premise infrastructure.",
      points: ["Zero install footprint", "No kernel modules", "Works across clouds & on-prem"],
    },
    {
      icon: Workflow,
      title: "API-First Integration",
      desc: "Connect via REST API. Import codebases via Git URL or paste source. Add live targets via URL. Webhooks push results to Slack, Teams, or any HTTP endpoint. Full programmatic control — every UI action has an API equivalent.",
      points: ["REST + Webhooks", "Git URL or paste source", "Slack / Teams / HTTP endpoints"],
    },
    {
      icon: ShieldCheck,
      title: "Read-Only by Default",
      desc: "SAST reads your source code (never modifies it — patches are generated for review, not auto-applied). DAST probes live endpoints with non-destructive payloads. No write operations without explicit human approval. Every action is audit-logged.",
      points: ["Source code never modified", "Non-destructive payloads", "Every action audit-logged"],
    },
  ];

  /* ------------------------------------------------------------------ */
  /* SECTION 2 — 7-Stage Pipeline                                        */
  /* ------------------------------------------------------------------ */
  const PIPELINE = [
    { icon: UserCheck, name: "Onboard",  desc: "Add client, codebases (Git), targets (live URLs), define scope." },
    { icon: ScanLine,  name: "Scan",     desc: "AI SAST reads source, DAST crawls live endpoints, SCA checks dependencies." },
    { icon: Crosshair, name: "Test",     desc: "PoC exploit generation, adversarial red-team arena, protocol fuzzing." },
    { icon: Wand2,     name: "Patch",    desc: "AI generates fixes + test code, sandbox-verifies before review." },
    { icon: CheckCircle2, name: "Verify", desc: "Human approves, re-test confirms exploit is blocked." },
    { icon: Shield,    name: "Defend",   desc: "Canary tokens, honeypots, virtual WAF patches, runtime monitoring." },
    { icon: Gavel,     name: "Comply",   desc: "Hash-chained attestation ledger, DPDPA/GDPR/ISO mapping, PDF reports." },
  ];

  /* ------------------------------------------------------------------ */
  /* SECTION 3 — Blast Radius Safety Controls                            */
  /* ------------------------------------------------------------------ */
  const SAFETY = [
    {
      icon: Lock,
      title: "Authorization Gate",
      desc: "Every target must be explicitly authorized before any testing begins. The \u201CAuthorize\u201D button is a deliberate, logged action. Unauthorized targets cannot be scanned, tested, or patched — enforced at the API layer.",
    },
    {
      icon: Eye,
      title: "Scope Enforcement",
      desc: "Define what\u2019s in/out of bounds per engagement (e.g., \u201Capp.acme.com only, exclude /admin and payment gateway\u201D). GuardianX honors scope boundaries — crawlers stay within declared paths, DAST payloads hit only scoped endpoints.",
    },
    {
      icon: Boxes,
      title: "Sandbox Isolation",
      desc: "All patch testing happens in an isolated sandbox — never against production. AI-generated test code runs against a copy, not live data. A patch only reaches your codebase after human approval AND sandbox pass.",
    },
    {
      icon: UserCheck,
      title: "Human-in-the-Loop",
      desc: "No patch is ever auto-deployed to production (unless you explicitly enable auto-approve for low-severity). Every critical/high finding requires human review. The AI recommends; humans decide. Full rollback for any approved patch.",
    },
  ];

  /* ------------------------------------------------------------------ */
  /* SECTION 4 — Data Flow & Security                                    */
  /* ------------------------------------------------------------------ */
  const DATAFLOW = [
    {
      icon: KeyRound,
      title: "Credential Vault",
      desc: "All stored credentials (Git tokens, API keys) encrypted with AES-256-GCM. Each credential has a unique IV and auth tag. Keys never logged, never returned in API responses. Access audit-logged.",
      spec: "AES-256-GCM · unique IV per record · zero key exposure",
    },
    {
      icon: GitBranch,
      title: "Hash-Chained Attestation",
      desc: "Every approved patch creates a SHA-256 ledger entry (prevHash + patchId + codeHash + timestamp). Tamper-evident — any modification breaks every subsequent hash. Proves remediation timeline to auditors.",
      spec: "SHA-256 · hash = H(prevHash + patchId + codeHash + ts)",
    },
    {
      icon: Shield,
      title: "JWT + 2FA Auth",
      desc: "Edge middleware verifies JWT on every API request. TOTP 2FA (RFC 6238) via Google Authenticator. Admin approval workflow — new signups can\u2019t access anything until approved. Rate limiting (auth: 10/15min, API: 300/min).",
      spec: "HS256 JWT · RFC 6238 TOTP · sliding-window rate limits",
    },
    {
      icon: Globe,
      title: "Data Localization",
      desc: "Runs on Supabase (you choose region). No data leaves your configured region. DPDPA §16 compliant for Indian users. Region pinning enforced at the database layer — cross-region replication is opt-in only.",
      spec: "Region-pinned PostgreSQL · DPDPA §16 compliant",
    },
  ];

  /* ------------------------------------------------------------------ */
  /* SECTION 5 — Technology Stack                                        */
  /* ------------------------------------------------------------------ */
  const STACK = [
    { icon: MonitorSmartphone, label: "Frontend",   items: ["Next.js 16", "TypeScript", "Tailwind CSS 4", "shadcn/ui", "Framer Motion"] },
    { icon: Server,            label: "Backend",    items: ["Next.js API Routes", "Edge runtime (auth middleware)"] },
    { icon: Database,          label: "Database",   items: ["PostgreSQL (Supabase)", "Accessed via REST API"] },
    { icon: Cpu,               label: "AI",         items: ["Z.AI LLM", "Vulnerability analysis", "Patch generation", "Exploit synthesis", "Chat"] },
    { icon: Terminal,          label: "Compute",    items: ["Railway sentinel-engine", "Bun runtime", "Python3 (SAST/DAST/PDF/scraper)"] },
    { icon: Zap,               label: "Real-time",  items: ["Socket.io", "Live event streaming"] },
    { icon: Lock,              label: "Auth",       items: ["JWT (jsonwebtoken)", "bcrypt (12 rounds)", "TOTP 2FA (otplib)"] },
    { icon: Layers,            label: "Desktop",    items: ["Electron", "Cross-platform .exe / .dmg / .AppImage"] },
  ];

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-600/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24 pt-16 sm:px-6">
          {/* ------------------------------------------------------------ */}
          {/* HERO                                                          */}
          {/* ------------------------------------------------------------ */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="pt-12"
          >
            <Badge className="mb-5 border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <Layers className="size-3" /> Architecture
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
              How GuardianX sits in{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                your environment
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Agentless. API-first. Blast-radius safe. No code changes, no sidecars, no runtime overhead.
            </p>

            {/* Pills */}
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { icon: Network,  label: "Agentless" },
                { icon: Workflow, label: "API-first" },
                { icon: Shield,   label: "Blast-radius safe" },
                { icon: Braces,   label: "No code changes" },
                { icon: Boxes,    label: "No sidecars" },
                { icon: Zap,      label: "Zero runtime overhead" },
              ].map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/60 px-3 py-1 font-mono text-[11px] text-zinc-300"
                >
                  <p.icon className="size-3 text-cyan-400" />
                  {p.label}
                </span>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* SECTION 1 — Deployment Model                                  */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                <Network className="size-5 text-cyan-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 01"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50">
                  Deployment Model — Agentless by Design
                </h2>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {DEPLOYMENT.map((d, i) => (
                <motion.div
                  key={d.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-700 p-5 transition-colors hover:border-cyan-500/40"
                >
                  <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-cyan-500/5 transition-colors group-hover:bg-cyan-500/10" />
                  <div className="relative">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                      <d.icon className="size-5 text-cyan-400" />
                    </div>
                    <h3 className="text-sm font-bold text-cyan-300">{d.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">{d.desc}</p>
                    <ul className="mt-3 space-y-1.5">
                      {d.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-[11px] text-zinc-500">
                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* SECTION 2 — The 7-Stage Pipeline                              */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Workflow className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 02"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50">The 7-Stage Pipeline</h2>
              </div>
            </div>

            <div className="holo-card-sharp hud-corners p-5 sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                {PIPELINE.map((stage, i) => (
                  <Fragment key={stage.name}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06, duration: 0.4 }}
                      className="relative flex-1 overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-3 transition-colors hover:border-emerald-500/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/10 font-mono text-[11px] font-bold text-emerald-300">
                          {i + 1}
                        </span>
                        <stage.icon className="size-4 text-cyan-400" />
                      </div>
                      <h4 className="mt-2 text-xs font-bold text-zinc-100">{stage.name}</h4>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                        {stage.desc}
                      </p>
                    </motion.div>

                    {i < PIPELINE.length - 1 && (
                      <div className="flex shrink-0 items-center justify-center py-1 lg:py-0">
                        <ArrowDown className="size-4 text-cyan-400/60 lg:hidden" />
                        <ArrowRight className="hidden size-4 text-cyan-400/60 lg:block" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>

              {/* legend */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-800 pt-4 font-mono text-[10px] text-zinc-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400" /> Offense
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan-400" /> Defense / Verify
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-violet-400" /> Comply
                </span>
                <span className="ml-auto hidden sm:inline">
                  Each stage emits audit-logged events to Socket.io
                </span>
              </div>
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* SECTION 3 — Blast Radius Safety Controls                      */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Shield className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 03"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50">
                  Blast Radius Safety Controls
                </h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {SAFETY.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-700 p-5 transition-colors hover:border-emerald-500/40"
                >
                  <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10" />
                  <div className="relative">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                        <s.icon className="size-5 text-emerald-400" />
                      </div>
                      <h3 className="text-sm font-bold text-emerald-300">{s.title}</h3>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-400">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* SECTION 4 — Data Flow & Security                              */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                <Lock className="size-5 text-cyan-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 04"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50">Data Flow &amp; Security</h2>
              </div>
            </div>

            {/* Diagram-style row: client -> gateway -> engine -> vault */}
            <div className="holo-card-sharp hud-corners mb-4 overflow-hidden p-5 sm:p-6">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                {[
                  { icon: Globe,    label: "Client / Browser",   sub: "HTTPS + JWT cookie" },
                  { icon: Server,   label: "Edge Middleware",    sub: "JWT verify · rate limit" },
                  { icon: Cpu,      label: "sentinel-engine",    sub: "Bun + Python3" },
                  { icon: Database, label: "Supabase Postgres",  sub: "Region-pinned" },
                ].map((node, i, arr) => (
                  <Fragment key={node.label}>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1, duration: 0.4 }}
                      className="flex-1 rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-3 text-center"
                    >
                      <node.icon className="mx-auto size-5 text-cyan-400" />
                      <div className="mt-2 text-xs font-bold text-zinc-100">{node.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{node.sub}</div>
                    </motion.div>
                    {i < arr.length - 1 && (
                      <div className="flex shrink-0 items-center justify-center">
                        <ArrowDown className="size-4 text-cyan-400/50 sm:hidden" />
                        <ArrowRight className="hidden size-4 text-cyan-400/50 sm:block" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-800 pt-3 text-center font-mono text-[10px] text-zinc-600">
                All hops TLS 1.2+ · credentials never traverse the client boundary
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {DATAFLOW.map((d, i) => (
                <motion.div
                  key={d.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-700 p-5 transition-colors hover:border-cyan-500/40"
                >
                  <div className="relative">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                        <d.icon className="size-5 text-cyan-400" />
                      </div>
                      <h3 className="text-sm font-bold text-cyan-300">{d.title}</h3>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-400">{d.desc}</p>
                    <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[10px] text-emerald-300/80">
                      {d.spec}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* SECTION 5 — Technology Stack                                  */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Boxes className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 05"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50">Technology Stack</h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STACK.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  className="holo-card-sharp hud-corners group relative overflow-hidden rounded-xl border border-zinc-700 p-4 transition-colors hover:border-emerald-500/40"
                >
                  <div className="absolute right-0 top-0 h-12 w-12 rounded-bl-full bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10" />
                  <div className="relative">
                    <div className="mb-2 flex items-center gap-2">
                      <s.icon className="size-4 text-emerald-400" />
                      <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                        {s.label}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {s.items.map((it) => (
                        <li key={it} className="text-[11px] leading-relaxed text-zinc-400">
                          <span className="mr-1 text-cyan-400/70">›</span>
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------------------ */}
          {/* CTA                                                           */}
          {/* ------------------------------------------------------------ */}
          <motion.section {...fadeUp} className="mt-20">
            <div className="holo-card-sharp hud-corners relative overflow-hidden p-8 sm:p-12">
              <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
              <div aria-hidden className="pointer-events-none absolute -top-20 right-10 h-60 w-60 rounded-full bg-cyan-500/15 blur-3xl" />
              <div className="relative text-center">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-500/10">
                  <Terminal className="size-7 text-cyan-300" />
                </div>
                <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                  See the architecture in action
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  Walk through a live engagement with our team. We&apos;ll show you the 7-stage
                  pipeline end-to-end against a target of your choice — with every safety
                  control visible.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a href="/contact">
                    <Button
                      size="lg"
                      className="bg-cyan-600 text-white hover:bg-cyan-500"
                    >
                      <Wand2 className="size-5" /> Request Demo
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                  <a href="/whitepaper">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <FileText className="size-5" /> Read the Whitepaper
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </motion.section>

          {/* footer micro-text */}
          <div className="mt-12 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            <p>
              © {new Date().getFullYear()} GuardianX · Agentless VAPT &amp; Autonomous Security Operations
            </p>
            <p className="mt-1">
              DPDPA 2023 · GDPR · HIPAA · PCI-DSS · ISO 27001 · SOC 2 ready
            </p>
          </div>
        </div>

        <div className="mt-auto">
          <SiteFooter />
        </div>
      </div>
    </>
  );
}
