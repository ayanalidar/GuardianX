"use client";

// /demo — public, rate-limited demo environment (Task #10-customer-success).
//
// Lets visitors try a curated subset of the platform without signing up.
// All data shown is STATIC placeholder content (no real client data, no DB
// reads) — the "read-only demo account" (demo@guardianx.in) is a narrative
// device, not a real login.
//
// Rate limiting: on mount, the page calls GET /api/demo/access (public). If
// the response is `allowed: false` (the visitor has already used their 5
// daily views), the page renders a "limit reached" CTA instead of the demo
// content. The rate-limit counter is per-IP per-day, in-memory per Edge
// function instance (see /api/demo/access/route.ts for the caveat).
//
// Content sections:
//   1. Dashboard preview — fake KPI tiles + a sparkline chart.
//   2. Sample findings — 3 hardcoded Finding cards with severity badges.
//   3. Sample reports — links to fake PDF report downloads (just buttons).
//
// Every section ends with a "Sign up for full access" CTA pointing at /.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  ShieldCheck,
  Bug,
  FileText,
  Lock,
  Eye,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Cpu,
  Activity,
} from "lucide-react";

interface DemoAccessResponse {
  allowed: boolean;
  views_today: number;
  limit: number;
  remaining: number;
  message?: string;
}

// ── Static demo data ──────────────────────────────────────────────────────
// These are hardcoded placeholders, NOT fetched from the DB. They mirror the
// shape of the real API responses so the UI components look identical to the
// logged-in experience.

const DEMO_KPIS = [
  { label: "Open findings", value: "12", delta: "-3 this week", icon: Bug, color: "red" },
  { label: "Patches pending", value: "5", delta: "2 ready to review", icon: ShieldCheck, color: "emerald" },
  { label: "Compliance score", value: "87%", delta: "+4% vs last month", icon: TrendingUp, color: "cyan" },
  { label: "Active scans", value: "3", delta: "avg 42s remaining", icon: Activity, color: "violet" },
];

const DEMO_FINDINGS = [
  {
    id: "FND-001",
    title: "SQL injection in /api/users/login",
    severity: "critical" as const,
    category: "Injection",
    owasp: "A03:2021",
    endpoint: "POST /api/users/login",
    description:
      "The email parameter is concatenated directly into a SQL query, allowing an attacker to bypass authentication via ' OR '1'='1' -- payloads.",
    remediation: "Use parameterized queries (prepared statements). The patch replaces the string concat with a ? placeholder.",
  },
  {
    id: "FND-002",
    title: "Path traversal in /api/files/download",
    severity: "high" as const,
    category: "Path Traversal",
    owasp: "A01:2021",
    endpoint: "GET /api/files/download?name=../../etc/passwd",
    description:
      "The `name` parameter is joined to the upload directory without normalization, allowing traversal outside the intended root.",
    remediation: "Use path.resolve() + verify the result is still inside the upload root. Reject paths containing '..'.",
  },
  {
    id: "FND-003",
    title: "Hardcoded JWT secret in auth.js",
    severity: "medium" as const,
    category: "Sensitive Data Exposure",
    owasp: "A02:2021",
    endpoint: "auth.js:42",
    description:
      "A 32-byte secret is hardcoded at line 42 of auth.js. Anyone with source access can forge admin JWTs.",
    remediation: "Move the secret to an environment variable (JWT_SECRET) + rotate it. Audit logs for signs of token forgery.",
  },
];

const DEMO_REPORTS = [
  {
    id: "RPT-Q4-2024",
    title: "Q4 2024 VAPT Report — Acme Corp",
    pages: 18,
    findings: 12,
    critical: 2,
    high: 4,
    medium: 5,
    low: 1,
    generatedAt: "2024-12-15",
  },
  {
    id: "RPT-NOV-2024",
    title: "Monthly Compliance Audit — November",
    pages: 9,
    findings: 7,
    critical: 0,
    high: 2,
    medium: 3,
    low: 2,
    generatedAt: "2024-11-30",
  },
];

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "border-red-500/40 bg-red-500/10 text-red-300" },
  high: { label: "High", cls: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
  medium: { label: "Medium", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  low: { label: "Low", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
};

// 12-point sparkline (deterministic, so SSR + hydration match)
const SPARKLINE_POINTS = [4, 6, 5, 8, 7, 9, 6, 8, 10, 7, 9, 11];

export default function DemoPage() {
  const [access, setAccess] = useState<DemoAccessResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/access", { cache: "no-store" })
      .then(async (res) => res.json())
      .then((data: DemoAccessResponse) => {
        if (!cancelled) {
          setAccess(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Network/Edge error — fail open so the visitor still sees the demo.
          // The rate-limit counter is per-instance anyway, so this is at most
          // a 1-instance bypass; the next successful call will re-enforce.
          setAccess({ allowed: true, views_today: 0, limit: 5, remaining: 5 });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-600/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-24 py-16 sm:px-6">
          {/* Hero / limit banner */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <Badge className="mb-4 border-violet-500/30 bg-violet-500/10 text-violet-300">
              <Rocket className="size-3" /> Live Demo
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
              Try GuardianX <span className="neon-emerald">without signing up</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
              Explore a curated preview of the platform with read-only demo
              data. No account, no email, no commitment. Limited to{" "}
              <span className="text-zinc-200">5 views per day</span> per IP.
            </p>

            {/* Rate-limit indicator */}
            {!loading && access && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400">
                <Eye className="size-3 text-emerald-400" />
                {access.allowed ? (
                  <>
                    View <span className="text-zinc-200">{access.views_today}</span> of{" "}
                    <span className="text-zinc-200">{access.limit}</span> today ·{" "}
                    <span className="text-emerald-400">{access.remaining} remaining</span>
                  </>
                ) : (
                  <>
                    Daily limit reached — sign up for unlimited access
                  </>
                )}
              </div>
            )}
          </motion.div>

          {/* Limit-reached state */}
          {!loading && access && !access.allowed && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="holo-card-sharp hud-corners mx-auto max-w-xl p-10 text-center"
            >
              <Lock className="mx-auto size-12 text-amber-400" />
              <h2 className="mt-4 text-2xl font-bold text-zinc-50">
                You've used all 5 demo views for today
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {access.message ||
                  "The daily demo limit is 5 views per IP. Sign up for full, unlimited access to GuardianX."}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <a href="/">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                    <Rocket className="size-4" /> Sign up free <ArrowRight className="size-4" />
                  </Button>
                </a>
                <a href="/contact">
                  <Button variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                    Talk to sales
                  </Button>
                </a>
              </div>
            </motion.div>
          )}

          {/* Demo content */}
          {(!access || access.allowed) && (
            <div className="space-y-10">
              {/* Demo account banner */}
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-zinc-400">
                <span className="font-mono text-violet-300">{"// demo@guardianx.in"}</span>{" "}
                — read-only demo account. All data shown is placeholder, not
                real client data. <a href="/" className="text-emerald-400 hover:underline">Sign up</a> to
                scan your own code.
              </div>

              {/* Section 1: Dashboard preview */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="size-5 text-emerald-400" />
                  <h2 className="text-lg font-bold text-zinc-50">Dashboard preview</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {DEMO_KPIS.map((kpi, i) => (
                    <motion.div
                      key={kpi.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="holo-card-sharp hud-corners p-4"
                    >
                      <div className="flex items-center justify-between">
                        <kpi.icon className={`size-4 text-${kpi.color}-400`} />
                        <span className="text-[10px] text-zinc-500">{kpi.delta}</span>
                      </div>
                      <div className={`mt-2 text-2xl font-bold text-${kpi.color}-400`}>
                        {kpi.value}
                      </div>
                      <div className="text-[11px] text-zinc-400">{kpi.label}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Sparkline chart */}
                <div className="mt-3 holo-card-sharp hud-corners p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">
                      Findings over time (last 12 weeks)
                    </span>
                    <span className="text-[10px] text-zinc-500">demo data</span>
                  </div>
                  <div className="flex h-24 items-end gap-1">
                    {SPARKLINE_POINTS.map((p, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${(p / 11) * 100}%` }}
                        transition={{ delay: i * 0.05, duration: 0.4 }}
                        className="flex-1 rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400/80"
                      />
                    ))}
                  </div>
                </div>
              </section>

              {/* Section 2: Sample findings */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Bug className="size-5 text-red-400" />
                  <h2 className="text-lg font-bold text-zinc-50">Sample findings</h2>
                </div>
                <div className="space-y-3">
                  {DEMO_FINDINGS.map((f, i) => {
                    const sev = SEVERITY_BADGE[f.severity];
                    return (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="holo-card-sharp hud-corners p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={sev.cls}>
                                {sev.label}
                              </Badge>
                              <span className="font-mono text-[10px] text-zinc-500">{f.id}</span>
                              <span className="font-mono text-[10px] text-zinc-500">{f.owasp}</span>
                            </div>
                            <h3 className="mt-2 text-sm font-semibold text-zinc-100">
                              {f.title}
                            </h3>
                            <p className="mt-1 text-xs text-zinc-400">{f.description}</p>
                            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[10px] text-emerald-300">
                              {f.endpoint}
                            </div>
                            <div className="mt-2 text-[11px] text-zinc-500">
                              <span className="text-emerald-400">Remediation:</span> {f.remediation}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {/* Section 3: Sample reports */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="size-5 text-violet-400" />
                  <h2 className="text-lg font-bold text-zinc-50">Sample reports</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DEMO_REPORTS.map((r, i) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="holo-card-sharp hud-corners p-5"
                    >
                      <div className="flex items-center justify-between">
                        <FileText className="size-5 text-violet-400" />
                        <span className="font-mono text-[10px] text-zinc-500">{r.id}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-zinc-100">{r.title}</h3>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
                        <span>{r.pages} pages</span>
                        <span>·</span>
                        <span>{r.findings} findings</span>
                        <span>·</span>
                        <span>{r.generatedAt}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5">
                        {r.critical > 0 && (
                          <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-300">
                            {r.critical} critical
                          </span>
                        )}
                        {r.high > 0 && (
                          <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] text-orange-300">
                            {r.high} high
                          </span>
                        )}
                        {r.medium > 0 && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                            {r.medium} medium
                          </span>
                        )}
                        {r.low > 0 && (
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-300">
                            {r.low} low
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 w-full border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        disabled
                        title="Sign up to download real reports"
                      >
                        <Lock className="size-3" /> Sign up to download
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* What you get when you sign up */}
              <section className="holo-card-sharp hud-corners p-6">
                <h2 className="text-lg font-bold text-zinc-50">
                  What you get with a full account
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: Database, text: "Scan your own codebases (up to 5MB each)" },
                    { icon: Bug, text: "Real findings on your code, not sample data" },
                    { icon: ShieldCheck, text: "AI-generated patches with adversarial validation" },
                    { icon: FileText, text: "Downloadable PDF VAPT reports with your branding" },
                    { icon: Cpu, text: "DAST against your live URLs via the RedAgent engine" },
                    { icon: Clock, text: "Scheduled scans + webhook + SIEM integrations" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                      <item.icon className="size-4 shrink-0 text-zinc-500" />
                      <span className="text-xs text-zinc-300">{item.text}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="holo-card-sharp hud-corners relative overflow-hidden p-8 text-center"
              >
                <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
                <div className="relative">
                  <AlertTriangle className="mx-auto size-10 text-amber-400" />
                  <h2 className="mt-4 text-2xl font-bold text-zinc-50">
                    Ready to scan your own code?
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                    Sign up free and run your first scan in under 5 minutes.
                    No credit card required.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <a href="/">
                      <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                        <Rocket className="size-5" /> Sign up for full access <ArrowRight className="size-4" />
                      </Button>
                    </a>
                    <a href="/docs">
                      <Button size="lg" variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                        Read the docs
                      </Button>
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
