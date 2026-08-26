"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Code2,
  Copy,
  Eye,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
  Clock,
} from "lucide-react";

// ── Types (mirror the API response) ────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";
type EngineTag =
  | "Jinja2"
  | "Twig"
  | "FreeMarker"
  | "Velocity"
  | "Smarty"
  | "ERB"
  | "Ruby"
  | "Thymeleaf"
  | "Spring"
  | "Unknown"
  | "Blind";

interface SstiFinding {
  payload: string;
  engine: EngineTag;
  vulnerable: boolean;
  blind: boolean;
  reflected: boolean;
  severity: Severity;
  cwe: string;
  status: number;
  durationMs: number;
  expected: string;
  actual: string;
  proofResponse: string;
  remediation: string;
  inputPoint: string;
}

interface SstiResponse {
  engagementId?: string;
  targetUrl?: string;
  inputPoints?: { type: string; name: string; url: string }[];
  testedCount?: number;
  vulnerableCount?: number;
  criticalCount?: number;
  highCount?: number;
  identifiedEngines?: EngineTag[];
  findings?: SstiFinding[];
  error?: string;
}

// ── Style maps ───────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-red-500/50 bg-red-500/10 text-red-300",
  high: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  info: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-zinc-500",
  info: "bg-zinc-600",
};

const ENGINE_STYLE: Record<string, string> = {
  Jinja2: "border-red-500/50 bg-red-500/10 text-red-300",
  Twig: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  FreeMarker: "border-violet-500/50 bg-violet-500/10 text-violet-300",
  Velocity: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300",
  Smarty: "border-sky-500/50 bg-sky-500/10 text-sky-300",
  ERB: "border-rose-500/50 bg-rose-500/10 text-rose-300",
  Ruby: "border-rose-500/50 bg-rose-500/10 text-rose-300",
  Thymeleaf: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  Spring: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  Unknown: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  Blind: "border-orange-500/50 bg-orange-500/10 text-orange-300",
};

// Live progress phases (the API is single-shot — we animate progress while
// the request is in flight so the user sees activity).
const PROGRESS_PHASES = [
  "Crawling target for input points",
  "Injecting detection payloads",
  "Identifying template engine",
  "Running blind SSTI time-based probes",
  "Persisting findings",
];

// Preview payloads for the input card.
const PAYLOAD_PREVIEW = [
  "{{7*7}}",
  "${7*7}",
  "<%= 7*7 %>",
  "#{7*7}",
  "{{=7*7}}",
  "${{7*7}}",
  "*{7*7}",
  "{{config}}",
  "${.version}",
  "#set($x=7*7)$x",
];

// ── Component ──────────────────────────────────────────────────────────────

export function SstiTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("https://app.example.com/search");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<SstiResponse | null>(null);

  const run = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({
        title: "Target URL required",
        description: "Enter the target URL (e.g. https://app.example.com/search).",
        variant: "destructive",
      });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(targetUrl.trim());
    } catch {
      toast({
        title: "Invalid URL",
        description: "Include the protocol (https://).",
        variant: "destructive",
      });
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      toast({ title: "Invalid scheme", description: "Only http/https.", variant: "destructive" });
      return;
    }
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(parsed.hostname)
    ) {
      toast({
        title: "SSRF guard",
        description: "Private/loopback hosts are not allowed.",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress(2);
    setPhaseIdx(0);

    // Animate progress + cycle phases while the API is in flight.
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 6, 92);
        if (next < 18) setPhaseIdx(0);
        else if (next < 50) setPhaseIdx(1);
        else if (next < 70) setPhaseIdx(2);
        else if (next < 88) setPhaseIdx(3);
        else setPhaseIdx(4);
        return next;
      });
    }, 400);

    try {
      const res = await fetch("/api/vapt/ssti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: targetUrl.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as SstiResponse;

      if (!res.ok || data.error) {
        const msg = data.error || `Request failed with HTTP ${res.status}`;
        toast({ title: "SSTI scan failed", description: msg, variant: "destructive" });
        setResult({ ...data, error: msg });
      } else {
        setResult(data);
        const vuln = data.vulnerableCount ?? 0;
        const crit = data.criticalCount ?? 0;
        if (crit > 0) {
          toast({
            variant: "destructive",
            title: `⚠ ${crit} CRITICAL SSTI finding(s)!`,
            description: `Template engine evaluating user input — likely RCE-class. ${vuln} total vulnerable.`,
          });
        } else if (vuln > 0) {
          toast({
            variant: "destructive",
            title: `${vuln} SSTI finding(s)`,
            description: "Blind or non-critical SSTI confirmed.",
          });
        } else {
          toast({
            title: "SSTI scan complete",
            description: `Tested ${data.testedCount ?? 0} payloads. No SSTI confirmed.`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast({ title: "SSTI scan failed", description: msg, variant: "destructive" });
      setResult({ error: msg });
    } finally {
      clearInterval(interval);
      setProgress(100);
      setRunning(false);
      setTimeout(() => setProgress(0), 1200);
    }
  }, [targetUrl, toast]);

  const reset = () => {
    setResult(null);
    setExpanded(null);
    setProgress(0);
    setPhaseIdx(0);
  };

  const findings = result?.findings ?? [];
  const vulnerableFindings = findings.filter((f) => f.vulnerable);
  const identifiedEngines = result?.identifiedEngines ?? [];
  const hasCritical = (result?.criticalCount ?? 0) > 0;

  return (
    <div className="space-y-5 px-3 pb-10 pt-4 sm:px-5 md:px-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="hud-corners relative overflow-hidden rounded-xl border border-red-500/20 bg-zinc-950/60 p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.10),transparent_55%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
              <Code2 className="size-6 text-red-400" />
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
                SSTI TESTING
                <Badge
                  variant="outline"
                  className="border-red-500/30 bg-red-500/10 text-[10px] text-red-300"
                >
                  <Zap className="size-3" /> RCE-CLASS
                </Badge>
              </h2>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                Server-Side Template Injection — crawls the target for input points and injects
                Jinja2 / Twig / FreeMarker / Velocity / Smarty / ERB / Thymeleaf / Spring probes,
                identifies the engine, and falls back to time-based blind SSTI when no reflection
                is observed.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400"
            >
              <Terminal className="size-3" /> CWE-94
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
            >
              <ShieldAlert className="size-3" /> Authorized
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Input form ─────────────────────────────────────────────────── */}
      <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          SSTI Test Configuration
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label htmlFor="ssti-target-url" className="text-xs font-medium text-zinc-300">
              Target URL <span className="text-red-400">*</span>
            </Label>
            <Input
              id="ssti-target-url"
              placeholder="https://app.example.com/search?q=test"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              disabled={running}
              className="mt-1.5 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-red-500/50 focus-visible:ring-red-500/20"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              The target URL. GuardianX crawls the page for input points (URL params + form
              fields) and injects SSTI probes. Private IPs are rejected (SSRF guard).
            </p>
          </div>
          <div className="flex items-end">
            <Button
              onClick={run}
              disabled={running || !targetUrl.trim()}
              className="w-full gap-2 border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:text-red-100"
              variant="outline"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Scanning…
                </>
              ) : (
                <>
                  <Play className="size-4" /> Run SSTI Tests
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Payload preview */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            Detection payloads (sample)
          </div>
          <div className="custom-scrollbar flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {PAYLOAD_PREVIEW.map((p) => (
              <code
                key={p}
                className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {p}
              </code>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Live progress (during scan) ────────────────────────────────── */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="hud-corners gap-0 rounded-xl border-red-500/30 bg-zinc-950/70 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-red-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    {PROGRESS_PHASES[phaseIdx]}…
                  </span>
                </div>
                <Badge className="border-red-500/30 bg-red-500/10 text-red-300">
                  {Math.round(progress)}%
                </Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-red-500 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.3 }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Clock className="size-3" /> ~30s ETA
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Code2 className="size-3" /> 7 detection probes
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Eye className="size-3" /> 5s per-request timeout
                </Badge>
              </div>
              {/* Payload activity feed */}
              <div className="mt-4 space-y-1.5">
                {PROGRESS_PHASES.map((p, i) => (
                  <div
                    key={p}
                    className={`flex items-center gap-2 rounded border p-2 transition-colors ${
                      i < phaseIdx
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : i === phaseIdx
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-zinc-800 bg-zinc-900/30"
                    }`}
                  >
                    {i < phaseIdx ? (
                      <ShieldCheck className="size-3.5 text-emerald-400" />
                    ) : i === phaseIdx ? (
                      <Loader2 className="size-3.5 animate-spin text-red-400" />
                    ) : (
                      <span className="size-3.5 rounded-full border border-zinc-700" />
                    )}
                    <span className="text-[11px] text-zinc-300">{p}</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {result?.error && !running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
          >
            <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Scan failed</p>
              <p className="mt-0.5 text-xs text-zinc-300">{result.error}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="text-zinc-400 hover:text-zinc-200">
              <RefreshCw className="size-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Critical alert ──────────────────────────────────────────────── */}
      {hasCritical && !running && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hud-corners gap-0 rounded-xl border-red-500/60 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-300">
                    CRITICAL — SSTI Confirmed (RCE-class)
                  </span>
                  <Badge className="border border-red-500/50 bg-red-500/20 text-[9px] text-red-300">
                    CWE-94
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-red-200/80">
                  The target rendered at least one of our template-expression probes —
                  the server passes user input into template <em>source</em> rather than as
                  a context variable. For most engines this is a direct path to Remote Code
                  Execution. Patch immediately by passing user input as a context variable and
                  using a sandboxed template engine.
                </p>
                {identifiedEngines.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {identifiedEngines.map((e) => (
                      <Badge
                        key={e}
                        className={`border text-[10px] ${ENGINE_STYLE[e] || ENGINE_STYLE.Unknown}`}
                      >
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Summary tiles ──────────────────────────────────────────────── */}
      {result && !result.error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {[
            {
              label: "Tested",
              value: result.testedCount ?? 0,
              color: "text-zinc-100",
              border: "border-zinc-800",
              icon: Terminal,
            },
            {
              label: "Vulnerable",
              value: result.vulnerableCount ?? 0,
              color: (result.vulnerableCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400",
              border: (result.vulnerableCount ?? 0) > 0 ? "border-red-500/40" : "border-emerald-500/40",
              icon: (result.vulnerableCount ?? 0) > 0 ? ShieldAlert : ShieldCheck,
            },
            {
              label: "Critical",
              value: result.criticalCount ?? 0,
              color: "text-red-400",
              border: "border-red-500/40",
              icon: AlertTriangle,
            },
            {
              label: "Engines Found",
              value: identifiedEngines.length,
              color: "text-amber-400",
              border: "border-amber-500/40",
              icon: Code2,
            },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                className={`hud-corners rounded-lg border ${m.border} bg-zinc-900/40 p-3 text-center`}
              >
                <Icon className="mx-auto mb-1 size-3.5 text-zinc-500" />
                <div className={`font-mono text-2xl font-bold ${m.color}`}>{m.value}</div>
                <div className="text-[9px] uppercase tracking-wide text-zinc-500">{m.label}</div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* ── Engines identified badges ───────────────────────────────────── */}
      {identifiedEngines.length > 0 && !running && (
        <Card className="hud-corners gap-0 rounded-xl border-amber-500/30 bg-zinc-950/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Code2 className="size-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-100">Template Engines Identified</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {identifiedEngines.map((e) => (
              <Badge
                key={e}
                className={`border px-2 py-1 text-[11px] ${ENGINE_STYLE[e] || ENGINE_STYLE.Unknown}`}
              >
                {e}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* ── Findings table ─────────────────────────────────────────────── */}
      {result && !result.error && findings.length > 0 && (
        <Card className="hud-corners gap-0 rounded-xl p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-red-400" />
              <span className="text-sm font-bold text-zinc-100">Probe Results</span>
              <Badge className="border border-zinc-700 bg-zinc-900/50 text-[9px] text-zinc-400">
                {findings.length} tested
              </Badge>
              {vulnerableFindings.length > 0 && (
                <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                  {vulnerableFindings.length} vulnerable
                </Badge>
              )}
            </div>
            {result.engagementId && (
              <code className="font-mono text-[9px] text-zinc-500">
                engagement: {result.engagementId.slice(0, 12)}…
              </code>
            )}
          </div>

          {/* Desktop table header */}
          <div className="hidden gap-2 px-2 text-[9px] uppercase tracking-wider text-zinc-500 sm:grid sm:grid-cols-[1fr_120px_100px_70px_60px_40px]">
            <div>Payload</div>
            <div>Engine / Input</div>
            <div>Expected → Actual</div>
            <div>Severity</div>
            <div>CWE</div>
            <div></div>
          </div>

          <div className="custom-scrollbar mt-1 max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
            {findings.map((f, i) => {
              const isOpen = expanded === `f-${i}`;
              return (
                <motion.div
                  key={`f-${i}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.015 }}
                  className={`rounded-md border p-2 transition-colors ${
                    f.vulnerable
                      ? f.blind
                        ? "border-orange-500/40 bg-orange-500/5"
                        : "border-red-500/60 bg-red-500/10"
                      : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : `f-${i}`)}
                    className="block w-full text-left"
                  >
                    {/* Mobile layout */}
                    <div className="flex items-start gap-2 sm:hidden">
                      <span
                        className={`mt-1 size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[10px] text-zinc-300">
                          {f.payload}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={`border text-[8px] ${ENGINE_STYLE[f.engine] || ENGINE_STYLE.Unknown}`}
                          >
                            {f.engine}
                            {f.blind && " (blind)"}
                          </Badge>
                          <Badge className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}>
                            {f.severity.toUpperCase()}
                          </Badge>
                          <span className="font-mono text-[9px] text-zinc-500">
                            HTTP {f.status} · {f.durationMs}ms
                          </span>
                          {f.vulnerable && (
                            <AlertTriangle className="ml-auto size-3 text-red-400" />
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[9px] text-zinc-500">
                          expected {f.expected} → got {f.actual}
                        </div>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden items-center gap-2 sm:grid sm:grid-cols-[1fr_120px_100px_70px_60px_40px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                        />
                        <code className="truncate font-mono text-[11px] text-zinc-300">
                          {f.payload}
                        </code>
                        {f.vulnerable && (
                          <AlertTriangle className="size-3 shrink-0 text-red-400" />
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        <Badge
                          className={`border text-[8px] ${ENGINE_STYLE[f.engine] || ENGINE_STYLE.Unknown}`}
                        >
                          {f.engine}
                          {f.blind && " · blind"}
                        </Badge>
                        <div className="mt-0.5 truncate text-zinc-600">{f.inputPoint}</div>
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        <div className="text-emerald-400/70">{f.expected}</div>
                        <div className="text-red-300">→ {f.actual}</div>
                      </div>
                      <Badge className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}>
                        {f.severity.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-[9px] text-zinc-500">
                        {f.cwe || "—"}
                      </span>
                      <Eye className="size-3 text-zinc-500 hover:text-red-300" />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2 space-y-2 border-t border-zinc-800 pt-2"
                    >
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Input point
                        </div>
                        <code className="mt-0.5 block break-all font-mono text-[10px] text-zinc-300">
                          {f.inputPoint}
                        </code>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Expected vs Actual
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-3 font-mono text-[10px]">
                          <span className="text-emerald-400">expected: {f.expected}</span>
                          <span className="text-red-300">actual: {f.actual}</span>
                          <span className="text-zinc-500">HTTP {f.status} · {f.durationMs}ms</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Target response
                        </div>
                        <pre className="custom-scrollbar mt-1 max-h-48 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                          {f.proofResponse}
                        </pre>
                      </div>
                      {f.vulnerable && f.remediation && (
                        <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                          <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                          <div>
                            <div className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                              Remediation
                            </div>
                            <p className="mt-0.5 text-[10px] text-zinc-400">{f.remediation}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(f.payload);
                            toast({ title: "Copied payload", description: f.payload });
                          }}
                          className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[9px] text-zinc-400 hover:border-red-500/40 hover:text-red-300"
                        >
                          <Copy className="size-2.5" /> Copy payload
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Reset button ───────────────────────────────────────────────── */}
      {result && !running && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="size-3.5" /> New run
          </Button>
        </div>
      )}
    </div>
  );
}
