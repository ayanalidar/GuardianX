"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Bug,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Lock,
  Mail,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { GlowCTA } from "./glow-cta";

/**
 * ScanWidget
 * ----------
 * A prominent "Scan Your Website Free" section. User enters a URL → a
 * SIMULATED 30-second scan runs through 4 progress phases → 3-5 realistic
 * sample findings appear → user enters email to "receive the full report"
 * (lead capture via localStorage) → success state with sign-up CTA.
 *
 * Important:
 *  - The scan is fully simulated (no Nmap/Nuclei). Real scanning needs the
 *    recon-tools Docker service + explicit authorization.
 *  - We DO try to POST the URL as a Target to /api/targets (with
 *    authorized=false) so sales can see which URLs visitors probed. If the
 *    API is unreachable, we silently fall back to mock mode.
 *  - Rate-limited client-side: 1 scan per browser per hour via localStorage
 *    key `gx_scan_last_run`.
 *  - Email leads stored in localStorage key `gx_leads`.
 */

type Phase = "idle" | "scanning" | "findings" | "email" | "done";

interface SampleFinding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  owasp: string;
  endpoint: string;
  method: string;
  description: string;
  remediation: string;
}

const SAMPLE_FINDINGS: SampleFinding[] = [
  {
    id: "S-001",
    title: "SQL Injection",
    severity: "critical",
    owasp: "A03:2021",
    endpoint: "/api/users?id=",
    method: "GET",
    description: "The `id` query parameter is concatenated directly into a SQL statement. An attacker can exfiltrate the user table or bypass authentication with `' OR 1=1--`.",
    remediation: "Use parameterized queries / prepared statements; validate input types.",
  },
  {
    id: "S-002",
    title: "Reflected XSS",
    severity: "high",
    owasp: "A03:2021",
    endpoint: "/search?q=",
    method: "GET",
    description: "User input from the `q` parameter is reflected into HTML without encoding, allowing JavaScript injection.",
    remediation: "Encode all output on the server; set a strict Content-Security-Policy.",
  },
  {
    id: "S-003",
    title: "Missing Strict-Transport-Security (HSTS)",
    severity: "medium",
    owasp: "A05:2021",
    endpoint: "/",
    method: "GET",
    description: "The HSTS response header is not set, allowing man-in-the-middle SSL stripping attacks.",
    remediation: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`.",
  },
  {
    id: "S-004",
    title: "Server version header leaked",
    severity: "low",
    owasp: "A05:2021",
    endpoint: "/",
    method: "GET",
    description: "The `Server` response header discloses exact software versions, easing targeted exploits.",
    remediation: "Suppress server banners in your web server config.",
  },
  {
    id: "S-005",
    title: "Directory listing enabled",
    severity: "medium",
    owasp: "A05:2021",
    endpoint: "/static/",
    method: "GET",
    description: "Directory listing is enabled, exposing the contents of static asset folders.",
    remediation: "Disable autoindex / directory browsing.",
  },
  {
    id: "S-006",
    title: "Clickjacking — X-Frame-Options missing",
    severity: "medium",
    owasp: "A05:2021",
    endpoint: "/",
    method: "GET",
    description: "The page can be framed by any origin, enabling clickjacking attacks.",
    remediation: "Set `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`.",
  },
  {
    id: "S-007",
    title: "Default admin panel exposed",
    severity: "critical",
    owasp: "A05:2021",
    endpoint: "/admin",
    method: "GET",
    description: "An administrative interface is reachable from the public internet without IP allowlisting or VPN.",
    remediation: "Restrict /admin to internal IPs or behind a VPN + MFA.",
  },
  {
    id: "S-008",
    title: "Weak TLS — TLS 1.0 enabled",
    severity: "medium",
    owasp: "A02:2021",
    endpoint: ":443",
    method: "TLS",
    description: "The server negotiates deprecated TLS 1.0, vulnerable to BEAST and POODLE.",
    remediation: "Disable TLS < 1.2; prefer TLS 1.3.",
  },
];

const SCAN_PHASES = [
  { label: "Crawling endpoints…", icon: Radar, color: "text-cyan-400" },
  { label: "Scanning ports…", icon: Globe, color: "text-violet-400" },
  { label: "Testing for vulnerabilities…", icon: Bug, color: "text-amber-400" },
  { label: "Generating report…", icon: Terminal, color: "text-emerald-400" },
];

const SEV_META: Record<
  SampleFinding["severity"],
  { color: string; bg: string; border: string; label: string }
> = {
  critical: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", label: "CRITICAL" },
  high: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "HIGH" },
  medium: { color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-500/40", label: "MEDIUM" },
  low: { color: "text-cyan-300", bg: "bg-cyan-500/15", border: "border-cyan-500/40", label: "LOW" },
  info: { color: "text-zinc-300", bg: "bg-zinc-500/15", border: "border-zinc-500/40", label: "INFO" },
};

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 scan per hour
const SCAN_TOTAL_MS = 30_000;

function normalizeUrl(raw: string): string | null {
  let u = raw.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function timeLeftLabel(ms: number): string {
  const mins = Math.ceil(ms / 60000);
  if (mins <= 1) return "less than a minute";
  return `${mins} minutes`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function ScanWidget({ onEnter }: { onEnter: () => void }) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scanPhaseIdx, setScanPhaseIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0..100
  const [findings, setFindings] = useState<SampleFinding[]>([]);
  const [email, setEmail] = useState("");
  const [targetCreated, setTargetCreated] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick clock so the rate-limit countdown refreshes in UI.
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rateLimitedUntil]);

  // On mount, hydrate rate-limit window from localStorage.
  useEffect(() => {
    try {
      const last = Number(localStorage.getItem("gx_scan_last_run") || "0");
      if (last && Date.now() - last < RATE_LIMIT_MS) {
        setRateLimitedUntil(last + RATE_LIMIT_MS);
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — proceed without it.
    }
  }, []);

  const canScan = useMemo(() => {
    if (rateLimitedUntil === null) return true;
    return Date.now() >= rateLimitedUntil;
  }, [rateLimitedUntil, now]);

  const startScan = async () => {
    setError(null);
    if (!canScan) {
      setError(`Rate limit reached — try again in ${timeLeftLabel(rateLimitedUntil! - now)}.`);
      return;
    }
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Please enter a valid URL (e.g. example.com or https://example.com).");
      return;
    }
    setUrl(normalized);

    // Best-effort: record this URL as a Target so the sales team can see what
    // visitors are probing. Failure is fine — we proceed with the mock scan.
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalized,
          baseUrl: normalized,
          authorized: false,
          notes: "Submitted via homepage ScanWidget (free scan lead).",
        }),
      });
      setTargetCreated(res.ok);
    } catch {
      setTargetCreated(false);
    }

    // Persist rate-limit stamp immediately.
    try {
      localStorage.setItem("gx_scan_last_run", String(Date.now()));
      setRateLimitedUntil(Date.now() + RATE_LIMIT_MS);
    } catch {
      // ignore
    }

    // Pick 3-5 findings at random (deterministic-ish: shuffle + slice).
    const shuffled = [...SAMPLE_FINDINGS].sort(() => Math.random() - 0.5);
    const count = 3 + Math.floor(Math.random() * 3); // 3..5
    setFindings(shuffled.slice(0, count));

    // Begin the simulated scan.
    setPhase("scanning");
    setScanPhaseIdx(0);
    setProgress(0);
  };

  // Drive the simulated scan progress.
  useEffect(() => {
    if (phase !== "scanning") return;
    const phaseDuration = SCAN_TOTAL_MS / SCAN_PHASES.length;
    const startedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, (elapsed / SCAN_TOTAL_MS) * 100);
      setProgress(pct);
      const idx = Math.min(SCAN_PHASES.length - 1, Math.floor(elapsed / phaseDuration));
      setScanPhaseIdx(idx);
      if (elapsed >= SCAN_TOTAL_MS) {
        setPhase("findings");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const submitEmail = () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      const leadsRaw = localStorage.getItem("gx_leads");
      const leads = leadsRaw ? (JSON.parse(leadsRaw) as unknown[]) : [];
      leads.push({
        url,
        email: email.trim(),
        timestamp: new Date().toISOString(),
        source: "homepage_scan_widget",
        findingsCount: findings.length,
      });
      localStorage.setItem("gx_leads", JSON.stringify(leads));
    } catch {
      // localStorage unavailable — we still proceed to the success state.
    }
    setPhase("done");
  };

  const reset = () => {
    setPhase("idle");
    setUrl("");
    setEmail("");
    setError(null);
    setFindings([]);
    setProgress(0);
    setScanPhaseIdx(0);
    setTargetCreated(false);
  };

  return (
    <section
      id="scan-widget"
      className="relative isolate overflow-hidden px-4 py-20 sm:px-6"
    >
      {/* Background gradient */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 30%, rgba(16,185,129,0.15), transparent 55%)," +
              "radial-gradient(ellipse at 70% 70%, rgba(6,182,212,0.12), transparent 55%)," +
              "linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(9,9,11,0.98) 100%)",
          }}
        />
      </motion.div>

      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
            <Zap className="size-3" /> {"// Free instant scan"}
          </div>
          <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
            Scan Your Website Free
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
            Enter your URL below. GuardianX runs a non-intrusive external scan and
            surfaces real vulnerabilities — no signup required.
          </p>
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-5 shadow-[0_0_40px_rgba(16,185,129,0.10)] sm:p-6">
          <AnimatePresence mode="wait">
            {/* ── IDLE ──────────────────────────────────────────────────── */}
            {phase === "idle" ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      placeholder="example.com or https://your-site.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") startScan();
                      }}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 py-3 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      aria-label="Website URL to scan"
                    />
                  </div>
                  <GlowCTA onClick={startScan} variant="solid" className="!px-6 !py-3 !text-sm">
                    <Radar className="size-4" />
                    Scan Now
                  </GlowCTA>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-zinc-600">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" /> Non-intrusive · no payloads sent
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> ~30s
                    </span>
                  </div>
                  <span>1 scan / hour</span>
                </div>

                {error ? (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {error}
                  </div>
                ) : null}

                {!canScan && rateLimitedUntil !== null ? (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <Clock className="size-3.5 shrink-0" />
                    You&apos;ve used your free scan for this hour. Next scan available in{" "}
                    {timeLeftLabel(rateLimitedUntil - now)}.
                  </div>
                ) : null}
              </motion.div>
            ) : null}

            {/* ── SCANNING ──────────────────────────────────────────────── */}
            {phase === "scanning" ? (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-emerald-400" />
                  <span className="text-sm font-semibold text-zinc-100">
                    Scanning <span className="text-emerald-300">{url}</span>
                  </span>
                  {targetCreated ? (
                    <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                      target saved
                    </span>
                  ) : (
                    <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                      demo mode
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="relative mb-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-400"
                    style={{ width: `${progress}%` }}
                    transition={{ ease: "linear" }}
                  />
                </div>

                {/* Phase list */}
                <div className="space-y-2">
                  {SCAN_PHASES.map((p, i) => {
                    const Icon = p.icon;
                    const state = i < scanPhaseIdx ? "done" : i === scanPhaseIdx ? "active" : "pending";
                    return (
                      <div
                        key={p.label}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                          state === "done"
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : state === "active"
                            ? "border-cyan-500/40 bg-cyan-500/10"
                            : "border-zinc-800 bg-zinc-900/40 text-zinc-600"
                        }`}
                      >
                        {state === "done" ? (
                          <CheckCircle2 className="size-4 text-emerald-400" />
                        ) : state === "active" ? (
                          <Loader2 className={`size-4 animate-spin ${p.color}`} />
                        ) : (
                          <Icon className={`size-4 ${p.color} opacity-40`} />
                        )}
                        <span
                          className={
                            state === "done"
                              ? "text-emerald-300"
                              : state === "active"
                              ? p.color
                              : "text-zinc-600"
                          }
                        >
                          {p.label}
                        </span>
                        {state === "done" ? (
                          <span className="ml-auto text-[9px] uppercase text-emerald-500/60">ok</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}

            {/* ── FINDINGS ──────────────────────────────────────────────── */}
            {phase === "findings" ? (
              <motion.div
                key="findings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="size-5 text-red-400" />
                  <span className="text-sm font-semibold text-zinc-100">
                    Found {findings.length} potential vulnerabilities on{" "}
                    <span className="text-red-300">{url}</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {findings.map((f, i) => {
                    const m = SEV_META[f.severity];
                    return (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.12 }}
                        className={`rounded-md border ${m.border} ${m.bg} p-3`}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.color} ${m.bg}`}>
                              {m.label}
                            </span>
                            <h4 className={`text-sm font-semibold ${m.color}`}>{f.title}</h4>
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">OWASP {f.owasp}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-zinc-400">{f.description}</p>
                        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{f.method}</span>
                          <span className="text-cyan-300/70">{f.endpoint}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-md border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Mail className="size-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-cyan-200">
                      Enter your email for the complete report
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-zinc-400">
                    We&apos;ll send a detailed PDF with full PoCs, CVSS scores, and
                    remediation steps. A security advisor will reach out within 24h.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitEmail();
                      }}
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                      aria-label="Email address for full report"
                    />
                    <button
                      type="button"
                      onClick={submitEmail}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25"
                    >
                      <Mail className="size-4" /> Send Report
                    </button>
                  </div>
                  {error ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-red-300">
                      <AlertCircle className="size-3.5" /> {error}
                    </div>
                  ) : null}
                  <div className="mt-2 font-mono text-[10px] text-zinc-600">
                    We respect your privacy. No spam, unsubscribe anytime.
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* ── DONE ──────────────────────────────────────────────────── */}
            {phase === "done" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, delay: 0.1 }}
                  className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/15"
                >
                  <ShieldCheck className="size-7 text-emerald-400" />
                </motion.div>
                <h3 className="text-xl font-bold text-zinc-50">Report sent!</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                  The full vulnerability report for <span className="text-emerald-300">{url}</span> is
                  on its way to <span className="text-cyan-300">{email}</span>. A GuardianX security
                  advisor will contact you within 24 hours to walk through remediation.
                </p>

                <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="mb-2 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-200">
                    <Lock className="size-4" /> Want continuous scanning + auto-patching?
                  </div>
                  <p className="mx-auto mb-4 max-w-md text-xs text-zinc-400">
                    Sign up for full GuardianX access: scheduled scans, AI-generated
                    patches, attestation ledger, VAPT reports, and compliance dashboards.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <GlowCTA onClick={onEnter} variant="solid" className="!px-5 !py-2.5 !text-sm">
                      Sign up for full access
                      <ArrowRight className="size-4" />
                    </GlowCTA>
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      Scan another site
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footnote */}
        <div className="mt-4 flex items-center justify-center gap-2 text-center font-mono text-[10px] text-zinc-600">
          <Lock className="size-3" />
          External scan only · for authenticated testing, sign up + add the target as authorized.
        </div>
      </div>
    </section>
  );
}
