"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Network,
  Workflow,
  ShieldCheck,
  UserCheck,
  ScanLine,
  Crosshair,
  Wand2,
  CheckCircle2,
  Shield,
  Gavel,
  Lock,
  Eye,
  Boxes,
  Terminal,
  Layers,
  Zap,
  ArrowRight,
  ArrowDown,
  CheckCircle,
  Code2,
  Database,
  Server,
  Cpu,
  Cloud,
  Palette,
  Component,
  Brain,
  Boxes as BoxesIcon,
  Hand,
  Mic,
  CreditCard,
  FileJson,
  Activity,
  ScrollText,
  Radio,
  Fingerprint,
  Webhook,
  Timer,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* DATA                                                               */
/* ------------------------------------------------------------------ */

const DEPLOYMENT = [
  {
    icon: Network,
    title: "No Agents, No Sidecars",
    desc: "GuardianX runs entirely through API calls and HTTP probing. Nothing is installed on your servers — no daemon, no kernel module, no background process.",
    points: [
      "Zero install footprint",
      "No kernel modules or sidecars",
      "Works across AWS, GCP, Azure & on-prem",
    ],
  },
  {
    icon: Workflow,
    title: "API-First Integration",
    desc: "Every UI action has an API equivalent. Trigger scans, fetch findings, approve patches, and stream events programmatically — the console is just a thin client.",
    points: [
      "REST + Webhooks + Socket.io streams",
      "Git URL or pasted source",
      "Slack / Teams / HTTP endpoints",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Read-Only by Default",
    desc: "SAST reads your source (never modifies it); DAST probes endpoints with non-destructive payloads. Patches are generated for review, never auto-applied.",
    points: [
      "Source code is never mutated",
      "Non-destructive payloads only",
      "Every action is audit-logged",
    ],
  },
] as const;

const PIPELINE = [
  { icon: UserCheck, name: "Onboard", desc: "Add clients, codebases (Git), targets (URLs), and scope." },
  { icon: ScanLine, name: "Scan", desc: "AI SAST reads source, DAST crawls endpoints, SCA checks deps." },
  { icon: Crosshair, name: "Test", desc: "PoC exploit synthesis, adversarial arena, protocol fuzzing." },
  { icon: Wand2, name: "Patch", desc: "AI generates fix + test code, sandbox-verifies pre-review." },
  { icon: CheckCircle2, name: "Verify", desc: "Human approves, re-test confirms the exploit is blocked." },
  { icon: Shield, name: "Defend", desc: "Canary tokens, honeypots, virtual WAF patches, runtime watch." },
  { icon: Gavel, name: "Comply", desc: "Hash-chained ledger, DPDPA/GDPR/ISO mapping, PDF reports." },
] as const;

const SAFETY = [
  {
    icon: Lock,
    title: "Authorization Gate",
    desc: "Every target must be explicitly authorized before any testing begins. The \u201CAuthorize\u201D action is deliberate, logged, and enforced at the API layer.",
    points: [
      "Per-target explicit authorization",
      "Authorization is a logged action",
      "Enforced server-side, not just UI",
    ],
  },
  {
    icon: Eye,
    title: "Scope Enforcement",
    desc: "Define what is in and out of bounds per engagement. Crawlers stay within declared paths and DAST payloads hit only scoped endpoints.",
    points: [
      "Path allow-lists / deny-lists",
      "Crawlers honor declared boundaries",
      "Out-of-scope endpoints never probed",
    ],
  },
  {
    icon: Boxes,
    title: "Sandbox Isolation",
    desc: "All patch testing happens in an isolated sandbox, never against production. A patch reaches your codebase only after sandbox pass AND human approval.",
    points: [
      "Patches run in a sandbox copy",
      "Never against live data",
      "Two-key approval: sandbox + human",
    ],
  },
  {
    icon: ScrollText,
    title: "Audit Logging",
    desc: "Every action — scan, probe, patch, approval — is appended to an immutable, hash-chained ledger. Tampering breaks every subsequent hash.",
    points: [
      "Immutable hash-chained ledger",
      "Per-action attestation",
      "Exportable for SOC 2 / ISO 27001",
    ],
  },
] as const;

const STACK = [
  { icon: Code2, name: "Next.js", why: "App Router, RSC, and edge middleware give us SSR, streaming, and auth at the edge in one framework." },
  { icon: FileJson, name: "TypeScript", why: "End-to-end type safety from Prisma models to API responses to component props." },
  { icon: Database, name: "Prisma", why: "Type-safe schema-first ORM with migrations, relations, and zero data-layer surprises." },
  { icon: Cloud, name: "Neon Postgres", why: "Serverless Postgres with branching — every preview gets its own DB copy." },
  { icon: Palette, name: "Tailwind CSS", why: "Utility-first styling keeps the design system tight, dark-mode native, and responsive." },
  { icon: Component, name: "shadcn/ui", why: "Composable, accessible Radix primitives we own outright — no opaque dependency blobs." },
  { icon: Brain, name: "Z.AI / OpenAI / Groq", why: "Multi-LLM routing: Z.AI for analysis, OpenAI for synthesis, Groq for low-latency chat." },
  { icon: BoxesIcon, name: "Three.js", why: "WebGL threat constellation and attack-graph rendering in the War Room overlay." },
  { icon: Hand, name: "MediaPipe", why: "On-device gesture control for the immersive War Room — pinch to zoom, swipe to pivot." },
  { icon: Mic, name: "Web Speech API", why: "Native browser voice control — \u201Cscan acme prod\u201D — with zero extra runtime." },
  { icon: CreditCard, name: "Stripe", why: "Compliant billing, metered usage, and India-specific UPI / RuPay rails out of the box." },
] as const;

const ENDPOINTS = [
  {
    method: "POST" as const,
    path: "/api/scans",
    desc: "Kick off a new scan against a codebase (Git URL or pasted source) or a live URL.",
    body: `{
  "codebase": "github.com/acme/payments-api",
  "branch":   "main",
  "modes":    ["sast","dast","sca"],
  "scope":    { "allow": ["app.acme.com"], "deny": ["/admin"] }
}`,
  },
  {
    method: "GET" as const,
    path: "/api/posture-score",
    desc: "Return the live posture score (0–100) with trend and top contributing findings.",
    body: `// GET /api/posture-score?range=30d
// → { "score": 78, "trend": "+4", "delta": [82,79,77,78], "topRisk": "auth/weak-jwt" }`,
  },
  {
    method: "POST" as const,
    path: "/api/agent-x/chat",
    desc: "Send a message to Agent X — the Guardian AI — with conversation memory.",
    body: `{
  "message": "Summarize last scan's criticals and propose a remediation order.",
  "context": "scan_01HX…"
}`,
  },
  {
    method: "GET" as const,
    path: "/api/predictive-forecast",
    desc: "Fetch the AI threat forecast — predicted next-attack surface and likelihood.",
    body: `// GET /api/predictive-forecast?horizon=7d
// → { "forecast": [{"surface":"/api/checkout","likelihood":0.74,"reason":"…"}] }`,
  },
  {
    method: "POST" as const,
    path: "/api/public-scan/scan",
    desc: "Anonymous public scan — single URL, no auth required, rate-limited.",
    body: `{
  "url": "https://acme.com",
  "depth": 1
}`,
  },
  {
    method: "GET" as const,
    path: "/api/threat-constellation",
    desc: "Return the graph of findings, assets, and exploit paths for the 3D constellation.",
    body: `// GET /api/threat-constellation?clientId=acme
// → { "nodes": […], "edges": […], "hotPaths": ["auth→priv-esc→exfil"] }`,
  },
  {
    method: "POST" as const,
    path: "/api/patches/[id]/approve",
    desc: "Human-approve a generated patch. Records a hash-chained attestation entry.",
    body: `{
  "patchId": "ptch_01HX…",
  "decision": "approved",
  "note":     "LGTM, applies cleanly on staging."
}`,
  },
  {
    method: "GET" as const,
    path: "/api/health",
    desc: "Liveness + readiness probe. Returns engine, DB, and LLM provider status.",
    body: `// GET /api/health
// → { "ok": true, "db": "healthy", "llm": "z.ai:up", "latencyMs": 42 }`,
  },
] as const;

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  const styles =
    method === "GET"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider ${styles}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto">
      <code className="block whitespace-pre font-mono text-[11px] leading-relaxed text-zinc-300">
        {children}
      </code>
    </pre>
  );
}

/* ------------------------------------------------------------------ */
/* PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function ArchitecturePage() {
  const fadeUp = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
  } as const;

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        {/* Background: circuit grid + ambient glows */}
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute top-1/3 right-10 h-80 w-80 rounded-full bg-emerald-600/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 pt-16 sm:px-6">
          {/* ---------------------------------------------------------- */}
          {/* 1. HERO                                                    */}
          {/* ---------------------------------------------------------- */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="pt-8"
          >
            <Badge className="mb-5 border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <Layers className="size-3" /> Architecture
            </Badge>

            <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
              Built for scale,{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                designed for safety
              </span>
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              GuardianX is agentless and API-first — your source code is read-only
              by default. Every engagement flows through a 7-stage pipeline from
              onboarding to compliance, with each approved patch sealed by a
              SHA-256 hash-chained attestation ledger.
            </p>

            {/* Stats tiles */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {[
                { label: "Agents to install", value: "0" },
                { label: "Stage pipeline", value: "7" },
                { label: "Attestation chain", value: "SHA-256" },
                { label: "API latency", value: "<100ms" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.5 }}
                  className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5"
                >
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {stat.label}
                  </div>
                  <div className="mt-1 bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
                    {stat.value}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/">
                <Button
                  size="lg"
                  className="bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  <Terminal className="size-5" /> Enter the Lab
                  <ArrowRight className="size-4" />
                </Button>
              </a>
              <a href="/architecture#api">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <Code2 className="size-5" /> See the API docs
                </Button>
              </a>
            </div>
          </motion.section>

          {/* ---------------------------------------------------------- */}
          {/* 2. DEPLOYMENT MODEL                                        */}
          {/* ---------------------------------------------------------- */}
          <motion.section {...fadeUp} className="mt-24">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                <Network className="size-5 text-cyan-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 01"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                  Deployment Model, Agentless by Design
                </h2>
              </div>
              <Badge className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <CheckCircle className="size-3" /> Zero install footprint
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {DEPLOYMENT.map((d, i) => (
                <motion.div
                  key={d.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group holo-card-sharp hud-corners relative flex flex-col overflow-hidden rounded-xl border border-zinc-700 p-5 transition-colors hover:border-cyan-500/40"
                >
                  <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-cyan-500/5 transition-colors group-hover:bg-cyan-500/10" />
                  <div className="relative flex flex-1 flex-col">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                      <d.icon className="size-5 text-cyan-400" />
                    </div>
                    <h3 className="text-sm font-bold text-cyan-300">{d.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      {d.desc}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {d.points.map((pt) => (
                        <li
                          key={pt}
                          className="flex items-start gap-2 text-[11px] text-zinc-500"
                        >
                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Sample API call */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-4"
            >
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                <Terminal className="size-3 text-cyan-400" /> sample api call
              </div>
              <pre className="font-mono text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 overflow-x-auto">
                <code className="whitespace-pre text-zinc-300">
{`$ curl -X POST https://api.guardianx.in/v1/scans \\
       -H "Authorization: Bearer $GUARDIANX_TOKEN" \\
       -H "Content-Type: application/json" \\
       -d '{"codebase":"github.com/acme/payments-api","modes":["sast","dast","sca"]}'`}
                </code>
              </pre>
            </motion.div>
          </motion.section>

          {/* ---------------------------------------------------------- */}
          {/* 3. THE 7-STAGE PIPELINE                                     */}
          {/* ---------------------------------------------------------- */}
          <motion.section {...fadeUp} className="mt-24">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Workflow className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 02"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                  The 7-Stage Pipeline
                </h2>
              </div>
              <Badge className="ml-auto border-amber-500/30 bg-amber-500/10 text-amber-300">
                <Timer className="size-3" /> 90 seconds end-to-end
              </Badge>
            </div>

            <div className="holo-card-sharp hud-corners p-4 sm:p-6">
              {/* Horizontal flow on lg+, vertical stack on mobile */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                {PIPELINE.map((stage, i) => (
                  <Fragment key={stage.name}>
                    <motion.div
                      initial={{ opacity: 0, x: -16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ delay: i * 0.1, duration: 0.45 }}
                      className="group relative flex-1 overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-3 transition-colors hover:border-emerald-500/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/10 font-mono text-[11px] font-bold text-emerald-300">
                          {i + 1}
                        </span>
                        <stage.icon className="size-4 text-cyan-400" />
                      </div>
                      <h4 className="mt-2 text-xs font-bold text-zinc-100">
                        {stage.name}
                      </h4>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                        {stage.desc}
                      </p>
                      {/* progress rail */}
                      <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <motion.div
                          initial={{ width: "0%" }}
                          whileInView={{ width: "100%" }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.1 + 0.2, duration: 0.5 }}
                          className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                        />
                      </div>
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
                  <span className="size-2 rounded-full bg-cyan-400" /> Verify / Build
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-400" /> Defend / Comply
                </span>
                <span className="ml-auto hidden sm:inline">
                  Each stage emits audit-logged events to Socket.io
                </span>
              </div>
            </div>
          </motion.section>

          {/* ---------------------------------------------------------- */}
          {/* 4. BLAST RADIUS SAFETY                                     */}
          {/* ---------------------------------------------------------- */}
          <motion.section {...fadeUp} className="mt-24">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Shield className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 03"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                  Blast Radius Safety Controls
                </h2>
              </div>
              <Badge className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <ShieldCheck className="size-3" /> Defense in depth
              </Badge>
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
                      <h3 className="text-sm font-bold text-emerald-300">
                        {s.title}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-400">{s.desc}</p>
                    <ul className="mt-3 space-y-1.5">
                      {s.points.map((pt) => (
                        <li
                          key={pt}
                          className="flex items-start gap-2 text-[11px] text-zinc-500"
                        >
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

          {/* ---------------------------------------------------------- */}
          {/* 5. TECH STACK                                              */}
          {/* ---------------------------------------------------------- */}
          <motion.section {...fadeUp} className="mt-24">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                <Boxes className="size-5 text-cyan-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 04"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                  Technology Stack
                </h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STACK.map((tech, i) => (
                <motion.div
                  key={tech.name}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="group holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-cyan-500/40"
                >
                  <div className="absolute right-0 top-0 h-12 w-12 rounded-bl-full bg-cyan-500/5 transition-colors group-hover:bg-cyan-500/10" />
                  <div className="relative">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/5">
                        <tech.icon className="size-4 text-cyan-400" />
                      </div>
                      <span className="font-mono text-xs font-bold text-zinc-100">
                        {tech.name}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      {tech.why}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ---------------------------------------------------------- */}
          {/* 6. API REFERENCE                                           */}
          {/* ---------------------------------------------------------- */}
          <motion.section
            id="api"
            {...fadeUp}
            className="mt-24 scroll-mt-20"
          >
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Webhook className="size-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {"// Section 05"}
                </div>
                <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
                  API Reference
                </h2>
              </div>
              <Badge className="ml-auto border-amber-500/30 bg-amber-500/10 text-amber-300">
                <FileJson className="size-3" /> Full OpenAPI spec coming soon
              </Badge>
            </div>

            <p className="mb-4 max-w-2xl text-sm text-zinc-400">
              Every console action has an API equivalent. Below are the core
              endpoints — each is versioned, JSON in / JSON out, and authenticated
              with a bearer token (the public-scan endpoint excepted).
            </p>

            <div className="grid gap-3 lg:grid-cols-2">
              {ENDPOINTS.map((ep, i) => (
                <motion.div
                  key={ep.path}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-emerald-500/40"
                >
                  <div className="flex items-center gap-2">
                    <MethodBadge method={ep.method} />
                    <code className="font-mono text-xs text-zinc-100">
                      {ep.path}
                    </code>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    {ep.desc}
                  </p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    example request
                  </div>
                  <div className="font-mono text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 overflow-x-auto">
                    <CodeBlock>{ep.body}</CodeBlock>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ---------------------------------------------------------- */}
          {/* 7. FINAL CTA                                               */}
          {/* ---------------------------------------------------------- */}
          <motion.section {...fadeUp} className="mt-24">
            <div className="holo-card-sharp hud-corners relative overflow-hidden p-8 sm:p-12">
              <div
                aria-hidden
                className="cyber-grid pointer-events-none absolute inset-0 opacity-20"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 right-10 h-60 w-60 rounded-full bg-cyan-500/15 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 left-10 h-60 w-60 rounded-full bg-emerald-500/15 blur-3xl"
              />
              <div className="relative text-center">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-500/10">
                  <Terminal className="size-7 text-cyan-300" />
                </div>
                <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
                  Ready to see it in action?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  Drop into the Lab Console, run a live scan, watch the 7-stage
                  pipeline light up in real time, and inspect the hash-chained
                  attestation ledger for yourself.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a href="/">
                    <Button
                      size="lg"
                      className="bg-cyan-600 text-white hover:bg-cyan-500"
                    >
                      <Wand2 className="size-5" /> Enter the Lab Console
                      <ArrowRight className="size-4" />
                    </Button>
                  </a>
                  <a href="/architecture#api">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <Code2 className="size-5" /> Browse the API
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </motion.section>

          {/* footer micro-text */}
          <div className="mt-12 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            <p>
              © {new Date().getFullYear()} GuardianX · Agentless VAPT &amp;
              Autonomous Security Operations
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
