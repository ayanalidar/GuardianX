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
 * A prominent "Scan Your Website For Free" section. User enters a URL →
 * a REAL non-intrusive external scan runs server-side (POST
 * /api/public-scan/scan, ~10-20s) → real findings appear → user enters
 * email to receive the full report (POST /api/public-scan/send-report,
 * server emails a PDF) → success state with sign-up CTA.
 *
 * UX shape (unchanged from the mock version):
 *   idle → scanning → findings → email → done
 *
 * Important:
 *  - The scan is REAL — the server runs non-intrusive checks (DNS,
 *    headers, well-known paths, TLS). No payloads are sent to the
 *    target. Authenticated testing needs a sign-up + authorized target.
 *  - Rate-limited client-side: 1 scan per browser per hour via
 *    localStorage key `gx_scan_last_run`.
 *  - Phase labels cycle every ~2s while the API call is in flight so
 *    the user can see what the engine is doing.
 *  - Score is color-coded: 90+ emerald, 70-89 amber, 50-69 orange,
 *    <50 red. Same palette as the cinematic RecentScansCard.
 *  - The bottom CTA ("Enter Lab Console") calls the `onEnter` prop so
 *    users can jump into the full GuardianX lab without doing a scan.
 */

type Phase = "idle" | "scanning" | "findings" | "email" | "done";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  owasp?: string | null;
  endpoint: string;
  method?: string | null;
  description: string;
  remediation: string;
}

interface ScanResponse {
  scanId: string;
  url: string;
  score: number;
  findingsCount: number;
  findings: ScanFinding[];
  summary: string;
  completedAt: string;
}

const SCAN_PHASE_LABELS: { label: string; icon: typeof Radar; color: string }[] = [
  { label: "Resolving DNS…", icon: Globe, color: "text-cyan-400" },
  { label: "Fetching headers…", icon: Radar, color: "text-violet-400" },
  { label: "Probing well-known paths…", icon: Bug, color: "text-amber-400" },
  { label: "Analyzing TLS…", icon: Lock, color: "text-cyan-400" },
  { label: "Generating report…", icon: Terminal, color: "text-emerald-400" },
];

const SEV_META: Record<
  Severity,
  { color: string; bg: string; border: string; label: string }
> = {
  critical: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", label: "CRITICAL" },
  high: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "HIGH" },
  medium: { color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-500/40", label: "MEDIUM" },
  low: { color: "text-sky-300", bg: "bg-sky-500/15", border: "border-sky-500/40", label: "LOW" },
  info: { color: "text-zinc-300", bg: "bg-zinc-500/15", border: "border-zinc-500/40", label: "INFO" },
};

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 scan per hour
const PROGRESS_RAMP_MS = 18_000; // pseudo progress ramps 0→90% over 18s
const PHASE_CYCLE_MS = 2_000; // cycle phase labels every 2s
const PROGRESS_DONE_PCT = 100;

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

function scoreColor(score: number): { text: string; bg: string; border: string; label: string } {
  if (score >= 90) return { text: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/40", label: "STRONG" };
  if (score >= 70) return { text: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "FAIR" };
  if (score >= 50) return { text: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/40", label: "WEAK" };
  return { text: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", label: "CRITICAL" };
}

/** Defensive parser — the parallel API agent may return slightly
 * different shapes, so we coerce everything we read. */
function parseScanResponse(data: unknown): ScanResponse | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const findingsRaw = Array.isArray(raw.findings) ? raw.findings : [];
  const findings: ScanFinding[] = findingsRaw
    .map((f): ScanFinding | null => {
      if (!f || typeof f !== "object") return null;
      const o = f as Record<string, unknown>;
      const severity = (String(o.severity ?? "info").toLowerCase()) as Severity;
      const validSev: Severity =
        severity === "critical" || severity === "high" || severity === "medium" || severity === "low" || severity === "info"
          ? severity
          : "info";
      return {
        id: String(o.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        title: String(o.title ?? "Untitled finding"),
        severity: validSev,
        owasp: o.owasp == null ? null : String(o.owasp),
        endpoint: String(o.endpoint ?? "/"),
        method: o.method == null ? null : String(o.method),
        description: String(o.description ?? ""),
        remediation: String(o.remediation ?? ""),
      };
    })
    .filter((f): f is ScanFinding => f !== null);

  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? Math.max(0, Math.min(100, raw.score)) : 0;

  return {
    scanId: String(raw.scanId ?? raw.id ?? ""),
    url: String(raw.url ?? ""),
    score,
    findingsCount: typeof raw.findingsCount === "number" ? raw.findingsCount : findings.length,
    findings,
    summary: String(raw.summary ?? ""),
    completedAt: String(raw.completedAt ?? new Date().toISOString()),
  };
}

export function ScanWidget({ onEnter }: { onEnter: () => void }) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scanPhaseIdx, setScanPhaseIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0..100
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [scanId, setScanId] = useState<string>("");
  const [scannedUrl, setScannedUrl] = useState<string>("");
  const [sendingReport, setSendingReport] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const abortRef = useRef<AbortController | null>(null);

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
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const canScan = useMemo(() => {
    if (rateLimitedUntil === null) return true;
    return Date.now() >= rateLimitedUntil;
  }, [rateLimitedUntil, now]);

  // Cycle phase labels every 2s while scanning.
  useEffect(() => {
    if (phase !== "scanning") return;
    setScanPhaseIdx(0);
    const t = setInterval(() => {
      setScanPhaseIdx((i) => (i + 1) % SCAN_PHASE_LABELS.length);
    }, PHASE_CYCLE_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Drive pseudo progress (0→90%) while scanning, capped so it never
  // visually completes before the API responds.
  useEffect(() => {
    if (phase !== "scanning") return;
    const startedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      // Ease-out-ish: ramps quickly at first, slows near 90%.
      const ratio = Math.min(1, elapsed / PROGRESS_RAMP_MS);
      const pct = 90 * (1 - Math.pow(1 - ratio, 2));
      setProgress(pct);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const startScan = async () => {
    setError(null);
    if (!canScan) {
      setError(`Rate limit reached — try again in ${timeLeftLabel((rateLimitedUntil ?? now) - now)}.`);
      return;
    }
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Please enter a valid URL (e.g. example.com or https://example.com).");
      return;
    }
    setUrl(normalized);
    setScannedUrl(normalized);
    setFindings([]);
    setScore(null);
    setSummary("");
    setScanId("");
    setScanPhaseIdx(0);
    setProgress(0);

    // Persist rate-limit stamp immediately so the user can't spam the API.
    try {
      localStorage.setItem("gx_scan_last_run", String(Date.now()));
      setRateLimitedUntil(Date.now() + RATE_LIMIT_MS);
    } catch {
      // ignore
    }

    setPhase("scanning");

    // Call the REAL scan API.
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/public-scan/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
        signal: ctrl.signal,
      });

      const payload = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const msg =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as Record<string, unknown>).error)
            : res.status === 400
            ? "Invalid URL — please check the address and try again."
            : `Scan failed (HTTP ${res.status}). The engine may be busy — please retry in a moment.`;
        setProgress(PROGRESS_DONE_PCT);
        setError(msg);
        setPhase("idle");
        return;
      }

      const parsed = parseScanResponse(payload);
      if (!parsed) {
        setProgress(PROGRESS_DONE_PCT);
        setError("The scan returned an unexpected response. Please try again.");
        setPhase("idle");
        return;
      }

      // Snap progress to 100% before transitioning for a satisfying finish.
      setProgress(PROGRESS_DONE_PCT);
      setFindings(parsed.findings);
      setScore(parsed.score);
      setSummary(parsed.summary);
      setScanId(parsed.scanId);
      setScannedUrl(parsed.url || normalized);

      // Brief beat so the user sees the bar complete.
      setTimeout(() => setPhase("findings"), 280);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setProgress(PROGRESS_DONE_PCT);
      setError("Network error — couldn't reach the scan engine. Please check your connection and retry.");
      setPhase("idle");
    }
  };

  const submitEmail = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!scanId) {
      setError("No active scan to email — please run a scan first.");
      return;
    }
    setSendingReport(true);
    try {
      const res = await fetch("/api/public-scan/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, email: email.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const msg =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as Record<string, unknown>).error)
            : `Failed to send report (HTTP ${res.status}).`;
        setError(msg);
        setSendingReport(false);
        return;
      }
      setPhase("done");
    } catch {
      setError("Network error — couldn't reach the email service. Please retry.");
    } finally {
      setSendingReport(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setUrl("");
    setEmail("");
    setError(null);
    setFindings([]);
    setScore(null);
    setSummary("");
    setScanId("");
    setScannedUrl("");
    setProgress(0);
    setScanPhaseIdx(0);
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
            Scan Your Website For Free
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
            Enter your URL below. GuardianX runs a non-intrusive external scan and
            surfaces real vulnerabilities — no signup required.
          </p>
        </div>

        {/* Main card */}
        <div className="holo-card-sharp hud-corners rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-5 shadow-[0_0_40px_rgba(16,185,129,0.10)] sm:p-6">
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
                      <Clock className="size-3" /> ~15s
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
                    Scanning <span className="text-emerald-300">{scannedUrl}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    live scan
                  </span>
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
                  {SCAN_PHASE_LABELS.map((p, i) => {
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
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <ShieldAlert className="size-5 text-red-400" />
                  <span className="text-sm font-semibold text-zinc-100">
                    Found {findings.length} potential vulnerabilities on{" "}
                    <span className="text-red-300">{scannedUrl}</span>
                  </span>
                  {score !== null ? (
                    <div
                      className={`ml-auto flex items-center gap-2 rounded-md border ${scoreColor(score).border} ${scoreColor(score).bg} px-3 py-1.5`}
                    >
                      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                        score
                      </span>
                      <span className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(score).text}`}>
                        {Math.round(score)}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">/100</span>
                    </div>
                  ) : null}
                </div>

                {/* LLM-generated summary */}
                {summary ? (
                  <div className="mb-4 rounded-md border border-cyan-500/25 bg-cyan-500/5 p-3">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/80">
                      <Terminal className="size-3" /> Guardian AI summary
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-300">{summary}</p>
                  </div>
                ) : null}

                <div className="custom-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
                  {findings.length === 0 ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                      <ShieldCheck className="mb-1 size-4" />
                      No exposures detected on the external surface. The scan is point-in-time —
                      schedule recurring scans for continuous coverage.
                    </div>
                  ) : (
                    findings.map((f, i) => {
                      const m = SEV_META[f.severity];
                      return (
                        <motion.div
                          key={f.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.08 }}
                          className={`rounded-md border ${m.border} ${m.bg} p-3`}
                        >
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.color} ${m.bg}`}>
                                {m.label}
                              </span>
                              <h4 className={`text-sm font-semibold ${m.color}`}>{f.title}</h4>
                            </div>
                            {f.owasp ? (
                              <span className="font-mono text-[10px] text-zinc-500">OWASP {f.owasp}</span>
                            ) : null}
                          </div>
                          {f.description ? (
                            <p className="text-xs leading-relaxed text-zinc-400">{f.description}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-600">
                            {f.method ? (
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5">{f.method}</span>
                            ) : null}
                            <span className="text-cyan-300/70">{f.endpoint}</span>
                          </div>
                          {f.remediation ? (
                            <div className="mt-2 flex items-start gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400/80" />
                              <span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/70">
                                  Fix ·{" "}
                                </span>
                                {f.remediation}
                              </span>
                            </div>
                          ) : null}
                        </motion.div>
                      );
                    })
                  )}
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
                      disabled={sendingReport}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sendingReport ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          <Mail className="size-4" /> Send Report
                        </>
                      )}
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
                  The full vulnerability report for <span className="text-emerald-300">{scannedUrl}</span> is
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
                      Enter Lab Console
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

        {/* Footnote with persistent Enter Lab Console link */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-mono text-[10px] text-zinc-600">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" />
            External scan only · for authenticated testing, sign up + add the target as authorized.
          </span>
          <span className="text-zinc-700">·</span>
          <button
            type="button"
            onClick={onEnter}
            className="inline-flex items-center gap-1 text-emerald-400/80 transition-colors hover:text-emerald-300"
          >
            Enter Lab Console <ArrowRight className="size-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
