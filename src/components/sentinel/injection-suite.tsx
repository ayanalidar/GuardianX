"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Syringe,
  Code2,
  ShieldAlert,
  Globe,
  Loader2,
  Play,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Eye,
  Copy,
  Terminal,
  Bug,
  Activity,
  ChevronDown,
  Server,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

// ─── Types (mirror the API response) ────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Category = "HTML Injection" | "CSRF" | "CORS";

interface Finding {
  name: string;
  category: Category;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  payload: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  indicator: string;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
}

interface CategoryCount {
  tested: number;
  vulnerable: number;
}

interface InjectionSuiteResponse {
  engagementId?: string;
  targetId?: string;
  testedBy?: string;
  targetUrl?: string;
  crawlSummary?: { formsFound: number; linksFound: number };
  testedCount?: number;
  vulnerableCount?: number;
  criticalCount?: number;
  highCount?: number;
  categoryCounts?: Record<Category, CategoryCount>;
  findings?: Finding[];
  error?: string;
}

// ─── Style maps ─────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-red-500/60 bg-red-500/15 text-red-300",
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  info: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-red-400",
  medium: "bg-amber-500",
  low: "bg-zinc-500",
  info: "bg-zinc-600",
};

const CATEGORY_META: Record<
  Category,
  { icon: typeof Syringe; color: string; bar: string; chip: string; hex: string; label: string }
> = {
  "HTML Injection": {
    icon: Code2,
    color: "text-amber-400",
    bar: "bg-amber-500",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    hex: "#f59e0b",
    label: "HTML Injection",
  },
  CSRF: {
    icon: ShieldAlert,
    color: "text-red-400",
    bar: "bg-red-500",
    chip: "border-red-500/40 bg-red-500/10 text-red-300",
    hex: "#ef4444",
    label: "CSRF",
  },
  CORS: {
    icon: Globe,
    color: "text-violet-400",
    bar: "bg-violet-500",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    hex: "#8b5cf6",
    label: "CORS",
  },
};

const CATEGORIES: Category[] = ["HTML Injection", "CSRF", "CORS"];

// ─── Component ──────────────────────────────────────────────────────────

export function InjectionSuite() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("https://app.example.com");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<InjectionSuiteResponse | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/vapt/injection-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl }),
      });
      const data = (await res.json()) as InjectionSuiteResponse;
      setResult(data);

      if (data.error) {
        toast({ variant: "destructive", title: "Injection suite failed", description: data.error });
        return;
      }
      const vuln = data.vulnerableCount ?? 0;
      const crit = data.criticalCount ?? 0;
      if (crit > 0) {
        toast({
          variant: "destructive",
          title: `⚠ ${crit} CRITICAL finding(s)!`,
          description: `CORS credentials leak or XSS likely. ${vuln} total vulnerable.`,
        });
      } else if (vuln > 0) {
        toast({
          variant: "destructive",
          title: `${vuln} injection finding(s)`,
          description: `Target is exploitable across HTMLi / CSRF / CORS.`,
        });
      } else {
        toast({
          title: "Injection suite complete",
          description: `Tested ${data.testedCount ?? 0} cases. No confirmed vulnerabilities.`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Injection suite failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setRunning(false);
    }
  };

  const findings = result?.findings ?? [];
  const vulnerableFindings = findings.filter((f) => f.vulnerable);
  const hasCritical = (result?.criticalCount ?? 0) > 0;

  // Build pie chart data from categoryCounts
  const pieData = useMemo(() => {
    if (!result?.categoryCounts) return [];
    return CATEGORIES.map((cat) => ({
      name: CATEGORY_META[cat].label,
      value: result.categoryCounts?.[cat]?.vulnerable ?? 0,
      color: CATEGORY_META[cat].hex,
    })).filter((d) => d.value > 0);
  }, [result]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-red-500/70">
          <span className="size-1.5 rounded-full bg-red-500 pulse-dot" />
          guardianx@injection-suite:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Syringe className="size-5 text-red-400" />
          INJECTION SUITE
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Combined HTML Injection, CSRF, and CORS testing against a public target.
          Crawls forms + endpoints, then injects payloads, inspects CSRF tokens, and probes CORS headers.
        </p>
      </div>

      {/* Configuration */}
      <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          Injection Suite Configuration
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Target URL *</Label>
            <Input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://app.example.com"
              className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              The homepage / endpoint of the target app. The suite crawls for forms &amp; links, then
              tests each injection vector.
            </p>
          </div>
        </div>

        {/* Quick payload preview */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            Test vectors
          </div>
          <div className="custom-scrollbar flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {[
              { label: "HTMLi", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
              { label: "<h1>test</h1>", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "<b>bold</b>", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "<marquee>test</marquee>", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "<img src=x onerror=alert(1)>", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "CSRF", chip: "border-red-500/30 bg-red-500/10 text-red-300" },
              { label: "no Origin POST", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "cross-origin POST", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "missing CSRF token", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "CORS", chip: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
              { label: "Origin: evil.com", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "Origin: null", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "target.com.evil.com", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
              { label: "ACAO + credentials", chip: "border-zinc-700 bg-zinc-900/60 text-zinc-400" },
            ].map((p) => (
              <code
                key={p.label}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${p.chip}`}
              >
                {p.label}
              </code>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
          <span className="text-[10px] text-zinc-500 sm:mr-auto">
            CWE-79 (HTMLi) · CWE-352 (CSRF) · CWE-942 (CORS)
          </span>
          <Button
            onClick={run}
            disabled={running || !targetUrl}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Scanning..." : "Run Injection Tests"}
          </Button>
        </div>
      </Card>

      {/* Critical alert banner */}
      {hasCritical && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hud-corners gap-0 rounded-xl border-red-500/60 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-300">
                    CRITICAL — CORS Credential Leak Detected
                  </span>
                  <Badge className="border border-red-500/50 bg-red-500/20 text-[9px] text-red-300">
                    CWE-942
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-red-200/80">
                  The target is returning <code>Access-Control-Allow-Credentials: true</code> alongside
                  a permissive <code>Access-Control-Allow-Origin</code>. Any site on the internet can
                  make authenticated cross-origin requests to this target. Restrict the origin allow-list
                  immediately.
                </p>
                <div className="mt-2 space-y-1.5">
                  {vulnerableFindings
                    .filter((f) => f.severity === "critical")
                    .map((f, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-red-500/30 bg-black/40 p-2 font-mono text-[10px] text-red-200"
                      >
                        <span className="text-red-400">[{f.severity.toUpperCase()}]</span>{" "}
                        {f.payload} <span className="text-zinc-500">→ {f.indicator}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Summary tiles */}
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
              label: "High",
              value: result.highCount ?? 0,
              color: "text-amber-400",
              border: "border-amber-500/40",
              icon: Bug,
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

      {/* Crawl summary + category breakdown */}
      {result && !result.error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-3 lg:grid-cols-3"
        >
          {/* Crawl summary */}
          <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Server className="size-4 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">Crawl Summary</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                <span className="text-[10px] text-zinc-500">Forms discovered</span>
                <span className="font-mono text-sm text-amber-300">
                  {result.crawlSummary?.formsFound ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                <span className="text-[10px] text-zinc-500">Links discovered</span>
                <span className="font-mono text-sm text-zinc-300">
                  {result.crawlSummary?.linksFound ?? 0}
                </span>
              </div>
              {result.engagementId && (
                <div className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                    Engagement
                  </div>
                  <code className="font-mono text-[10px] text-zinc-400">
                    {result.engagementId.slice(0, 18)}…
                  </code>
                </div>
              )}
            </div>
          </Card>

          {/* Category breakdown chart */}
          <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <Activity className="size-4 text-violet-400" />
              <span className="text-xs font-semibold text-zinc-200">
                Category Breakdown — Vulnerable by Vector
              </span>
            </div>
            <div className="grid items-center gap-3 sm:grid-cols-[180px_1fr]">
              <div className="h-40">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={64}
                        paddingAngle={2}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} stroke="#0a0a0a" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#0a0a0a",
                          border: "1px solid #27272a",
                          borderRadius: 6,
                          fontSize: 11,
                          color: "#e4e4e7",
                        }}
                        itemStyle={{ color: "#e4e4e7" }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <ShieldCheck className="mb-1 size-6 text-emerald-400" />
                    <span className="text-[10px] text-zinc-500">No vulnerable vectors</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {CATEGORIES.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const Icon = meta.icon;
                  const cnt = result.categoryCounts?.[cat];
                  const vuln = cnt?.vulnerable ?? 0;
                  const tested = cnt?.tested ?? 0;
                  const ratio = tested > 0 ? (vuln / tested) * 100 : 0;
                  return (
                    <div
                      key={cat}
                      className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Icon className={`size-3.5 ${meta.color}`} />
                        <span className="text-[11px] font-semibold text-zinc-200">
                          {meta.label}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-zinc-500">
                          {vuln}/{tested}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${ratio}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className={`h-full ${meta.bar}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Findings table */}
      {result && !result.error && findings.length > 0 && (
        <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bug className="size-4 text-red-400" />
              <span className="text-sm font-bold text-zinc-100">Findings</span>
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

          {/* Group by category */}
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const catFindings = findings.filter((f) => f.category === cat);
              if (catFindings.length === 0) return null;
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const catVuln = catFindings.filter((f) => f.vulnerable).length;
              return (
                <div key={cat} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={`size-4 ${meta.color}`} />
                    <span className="text-xs font-semibold text-zinc-200">{meta.label}</span>
                    <span className="text-[10px] text-zinc-500">
                      ({catFindings.length} tested
                      {catVuln > 0 ? `, ${catVuln} vulnerable` : ""})
                    </span>
                    {catVuln > 0 && (
                      <span className="ml-auto size-1.5 rounded-full bg-red-500 pulse-dot" />
                    )}
                  </div>

                  {/* Table header (desktop only) */}
                  <div className="hidden gap-2 px-2 text-[9px] uppercase tracking-wider text-zinc-500 sm:grid sm:grid-cols-[1fr_160px_70px_50px_32px]">
                    <div>Payload / Indicator</div>
                    <div>Method · Status</div>
                    <div>Severity</div>
                    <div>CWE</div>
                    <div></div>
                  </div>

                  <div className="custom-scrollbar mt-1 max-h-[420px] space-y-1.5 overflow-y-auto">
                    {catFindings.map((f, i) => {
                      const isOpen = expanded === `${cat}-${i}`;
                      return (
                        <motion.div
                          key={`${cat}-${i}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={`rounded-md border p-2 transition-colors ${
                            f.vulnerable
                              ? f.severity === "critical"
                                ? "border-red-500/60 bg-red-500/10"
                                : "border-amber-500/40 bg-amber-500/5"
                              : "border-zinc-800 bg-zinc-900/30"
                          }`}
                        >
                          <button
                            onClick={() => setExpanded(isOpen ? null : `${cat}-${i}`)}
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
                                <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                                  {f.indicator}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <Badge
                                    className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}
                                  >
                                    {f.severity.toUpperCase()}
                                  </Badge>
                                  <span className="font-mono text-[9px] text-zinc-500">
                                    {f.method} · {f.status}
                                  </span>
                                  {f.vulnerable && (
                                    <AlertTriangle className="ml-auto size-3 text-red-400" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Desktop grid layout */}
                            <div className="hidden items-center gap-2 sm:grid sm:grid-cols-[1fr_160px_70px_50px_32px]">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                                />
                                <div className="min-w-0">
                                  <code className="block truncate font-mono text-[11px] text-zinc-300">
                                    {f.payload}
                                  </code>
                                  <span className="block truncate text-[10px] text-zinc-500">
                                    {f.indicator}
                                  </span>
                                </div>
                                {f.vulnerable && (
                                  <AlertTriangle className="size-3 shrink-0 text-red-400" />
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-500">
                                {f.method}
                                <br />
                                <span className="text-zinc-600">
                                  HTTP {f.status} · {f.durationMs}ms
                                </span>
                              </div>
                              <Badge
                                className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}
                              >
                                {f.severity.toUpperCase()}
                              </Badge>
                              <span className="font-mono text-[9px] text-zinc-500">{f.cwe}</span>
                              <ChevronDown
                                className={`size-3 text-zinc-500 transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
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
                                  Proof request
                                </div>
                                <pre className="custom-scrollbar mt-1 max-h-32 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                                  {f.proofRequest}
                                </pre>
                              </div>
                              <div>
                                <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                                  Proof response
                                </div>
                                <pre className="custom-scrollbar mt-1 max-h-48 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                                  {f.proofResponse}
                                </pre>
                              </div>
                              <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                                <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                                <div>
                                  <div className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                                    Remediation
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-zinc-400">{f.remediation}</p>
                                </div>
                              </div>
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
                                <span className="font-mono text-[9px] text-zinc-600">
                                  {f.endpoint}
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Live progress (during scan) */}
      {running && (
        <Card className="hud-corners gap-0 rounded-xl border-red-500/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-red-400" />
            <span className="text-sm font-semibold text-red-300">
              Injection suite in progress…
            </span>
          </div>
          <div className="space-y-2">
            {CATEGORIES.map((cat, i) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              return (
                <div
                  key={cat}
                  className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2"
                >
                  <Icon className={`size-3.5 ${meta.color}`} />
                  <span className="text-[11px] text-zinc-300">{meta.label}</span>
                  <div className="ml-2 flex-1">
                    <div className="h-1 overflow-hidden rounded bg-zinc-800">
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: ["0%", "100%", "0%"] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.3,
                        }}
                        className={`h-full ${meta.bar}`}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500">
                    {["CRAWL+INJECT", "TOKEN+ORIGIN", "PREFLIGHT+ACAO"][i]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-zinc-500">
            Crawling homepage → parsing forms → injecting HTML payloads → CSRF token + Origin
            checks → CORS preflight with evil/null/subdomain origins. Each probe 5s timeout, 30s route budget.
          </p>
        </Card>
      )}

      {/* Empty-state "all clear" banner */}
      <AnimatePresence>
        {result && !result.error && (result.vulnerableCount ?? 0) === 0 && !running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="hud-corners gap-0 rounded-xl border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-400" />
                <div>
                  <span className="text-sm font-bold text-emerald-300">
                    All Clear — no injection vulnerabilities
                  </span>
                  <p className="mt-0.5 text-[11px] text-emerald-200/80">
                    Tested {result.testedCount ?? 0} cases across HTMLi / CSRF / CORS. No payload was
                    reflected verbatim, all state-changing forms had CSRF tokens, and CORS headers
                    were not permissive.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {result?.error && (
        <Card className="hud-corners gap-0 rounded-xl border-red-500/30 p-5">
          <div className="flex items-center gap-2">
            <XCircle className="size-5 text-red-400" />
            <span className="text-sm font-bold text-red-300">Suite Failed</span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">{result.error}</p>
        </Card>
      )}
    </div>
  );
}
