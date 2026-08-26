"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Crown,
  Database,
  Filter,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Terminal,
  TrendingUp,
  Unlock,
  XCircle,
  Zap,
} from "lucide-react";

// ── Types (mirror the API response) ─────────────────────────────────────────
type Category =
  | "idor"
  | "price_manipulation"
  | "workflow_bypass"
  | "rate_limit"
  | "privilege_escalation"
  | "mass_assignment";

interface Finding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  category: string;
  endpoint: string;
  method: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  payload: string;
  owasp: string;
}

interface TestResult {
  testId: string;
  name: string;
  category: string;
  endpoint: string;
  method: string;
  payload: string;
  responseStatus: number;
  responseSnippet: string;
  vulnerable: boolean;
  severity: string;
  cwe: string;
}

interface CategoryBreakdownItem {
  category: Category;
  label: string;
  tested: number;
  vulnerable: number;
  severity: string;
}

interface BusinessLogicResponse {
  engagementId: string;
  targetUrl?: string;
  testSource?: "llm" | "heuristic" | string;
  discoveryLog?: string[];
  endpointsDiscovered?: number;
  testedCount: number;
  vulnerableCount: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  findings: Finding[];
  results?: TestResult[];
  categoryBreakdown?: CategoryBreakdownItem[];
  message?: string;
  error?: string;
}

// ── Category metadata (icon, color, label) ───────────────────────────────────
const CATEGORY_META: Record<
  Category,
  { label: string; icon: typeof KeyRound; color: string; hex: string; cwe: string }
> = {
  idor: {
    label: "IDOR / BOLA",
    icon: KeyRound,
    color: "emerald",
    hex: "#10b981",
    cwe: "CWE-639",
  },
  price_manipulation: {
    label: "Price Manipulation",
    icon: TrendingUp,
    color: "red",
    hex: "#ef4444",
    cwe: "CWE-841",
  },
  workflow_bypass: {
    label: "Workflow Bypass",
    icon: Filter,
    color: "amber",
    hex: "#f59e0b",
    cwe: "CWE-841",
  },
  rate_limit: {
    label: "Rate-Limit Bypass",
    icon: Gauge,
    color: "cyan",
    hex: "#06b6d4",
    cwe: "CWE-770",
  },
  privilege_escalation: {
    label: "Privilege Escalation",
    icon: Crown,
    color: "rose",
    hex: "#f43f5e",
    cwe: "CWE-269",
  },
  mass_assignment: {
    label: "Mass Assignment",
    icon: Database,
    color: "violet",
    hex: "#8b5cf6",
    cwe: "CWE-915",
  },
};

function resolveCategory(raw: string): Category {
  const r = (raw || "").toLowerCase();
  if (r.includes("idor") || r.includes("bola")) return "idor";
  if (r.includes("price") || r.includes("quantity")) return "price_manipulation";
  if (r.includes("workflow") || r.includes("skip")) return "workflow_bypass";
  if (r.includes("rate") || r.includes("limit")) return "rate_limit";
  if (r.includes("privilege") || r.includes("admin")) return "privilege_escalation";
  if (r.includes("mass") || r.includes("assignment")) return "mass_assignment";
  return "idor";
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  info: "border-zinc-700 bg-zinc-800/50 text-zinc-400",
};

// ── Component ────────────────────────────────────────────────────────────────
export function BusinessLogicTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [apiSpec, setApiSpec] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "discovering" | "generating" | "executing" | "done">("idle");
  const [result, setResult] = useState<BusinessLogicResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulated live progress while the API call is in-flight (the API is
  // single-shot — it returns only when fully complete — so we animate the
  // progress bar to keep the user informed that the engine is working).
  useEffect(() => {
    if (!running) {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      return;
    }
    progressTimer.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 7, 95);
        // Drift the phase label to give the user a sense of where we are.
        if (next < 25) setPhase("discovering");
        else if (next < 55) setPhase("generating");
        else if (next < 95) setPhase("executing");
        return next;
      });
    }, 350);
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [running]);

  const runTests = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({
        title: "Target URL required",
        description: "Enter the base URL of the target application.",
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
        description: "Could not parse the target URL. Include http:// or https://.",
        variant: "destructive",
      });
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      toast({
        title: "Invalid scheme",
        description: "Only http and https targets are supported.",
        variant: "destructive",
      });
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
    setProgress(2);
    setPhase("discovering");
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/vapt/business-logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          apiSpec: apiSpec.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as BusinessLogicResponse;

      if (!res.ok) {
        const msg = data.error || `Request failed with HTTP ${res.status}`;
        setError(msg);
        toast({ title: "Business Logic Testing failed", description: msg, variant: "destructive" });
      } else {
        setResult(data);
        setPhase("done");
        toast({
          title: "Business Logic Testing complete",
          description: `Tested ${data.testedCount} · ${data.vulnerableCount} vulnerable · ${data.criticalCount || 0} critical`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      toast({ title: "Business Logic Testing failed", description: msg, variant: "destructive" });
    } finally {
      setProgress(100);
      setRunning(false);
      // Drop the progress bar back to zero shortly after completion so a
      // subsequent run starts fresh.
      setTimeout(() => setProgress(0), 1200);
    }
  }, [targetUrl, apiSpec, toast]);

  const reset = () => {
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase("idle");
  };

  const totalTested = result?.results?.length ?? result?.testedCount ?? 0;
  const totalVulnerable = result?.vulnerableCount ?? 0;
  const totalCritical = result?.criticalCount ?? 0;
  const totalHigh = result?.highCount ?? 0;
  const totalMedium = result?.mediumCount ?? 0;
  const categoryData =
    result?.categoryBreakdown ||
    deriveCategoryBreakdown(result?.results || []);

  const phaseLabel =
    phase === "discovering"
      ? "Discovering API endpoints"
      : phase === "generating"
        ? "AI generating business-logic test cases"
        : phase === "executing"
          ? "Executing tests against target"
          : "Idle";

  return (
    <div className="space-y-5 px-3 pb-10 pt-4 sm:px-5 md:px-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="hud-corners relative overflow-hidden rounded-xl border border-emerald-500/20 bg-zinc-950/60 p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_55%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Brain className="size-6 text-emerald-400 neon-emerald" />
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
                BUSINESS LOGIC TESTING
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300"
                >
                  AI-DRIVEN
                </Badge>
              </h2>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                AI understands your target&apos;s API schema and probes for authorization bypass,
                price manipulation, workflow bypass, IDOR, rate-limit bypass, and mass assignment —
                the vulnerabilities traditional scanners miss.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400"
            >
              <Activity className="size-3" /> OWASP ASVS L2
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
            >
              <ShieldAlert className="size-3" /> Authorized Testing
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Input form ─────────────────────────────────────────────────────── */}
      <Card className="hud-corners relative border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label htmlFor="bl-target-url" className="text-xs font-medium text-zinc-300">
              Target URL <span className="text-red-400">*</span>
            </Label>
            <Input
              id="bl-target-url"
              placeholder="https://example.com"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              disabled={running}
              className="mt-1.5 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              The base URL of the target application. Private IPs are rejected (SSRF guard).
            </p>
          </div>
          <div className="flex items-end">
            <Button
              onClick={runTests}
              disabled={running || !targetUrl.trim()}
              className="w-full gap-2 border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
              variant="outline"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Testing…
                </>
              ) : (
                <>
                  <Play className="size-4" /> Run Business Logic Tests
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="bl-api-spec" className="text-xs font-medium text-zinc-300">
            Optional API Spec{" "}
            <span className="text-zinc-500">(OpenAPI JSON / endpoint list)</span>
          </Label>
          <Textarea
            id="bl-api-spec"
            placeholder={
              "Paste OpenAPI/Swagger JSON, or one endpoint per line:\n" +
              "GET /api/users\nPOST /api/orders\nGET /api/admin/users"
            }
            value={apiSpec}
            onChange={(e) => setApiSpec(e.target.value)}
            disabled={running}
            className="mt-1.5 max-h-48 min-h-24 overflow-y-auto border-zinc-700 bg-zinc-900/60 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            If omitted, GuardianX probes <code className="text-zinc-400">/api</code>,{" "}
            <code className="text-zinc-400">/api/v1</code>,{" "}
            <code className="text-zinc-400">/api/users</code>,{" "}
            <code className="text-zinc-400">/api/orders</code>,{" "}
            <code className="text-zinc-400">/api/admin</code> + 11 more common paths.
          </p>
        </div>
      </Card>

      {/* ── Progress (during run) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="hud-corners relative border-emerald-500/30 bg-zinc-950/70 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-emerald-400" />
                  <span className="text-sm font-medium text-zinc-200">{phaseLabel}</span>
                </div>
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  {Math.round(progress)}%
                </Badge>
              </div>
              <Progress
                value={progress}
                className="mt-3 h-2 bg-zinc-800 [&>*]:bg-gradient-to-r [&>*]:from-emerald-500 [&>*]:to-cyan-400"
              />
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Clock className="size-3" /> ~30s ETA
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Brain className="size-3" /> LLM + heuristics
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <ShieldCheck className="size-3" /> 6 vuln classes
                </Badge>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && !running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
          >
            <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Testing failed</p>
              <p className="mt-0.5 text-xs text-zinc-300">{error}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="text-zinc-400 hover:text-zinc-200">
              <RefreshCw className="size-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && !running && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-5"
        >
          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              icon={Activity}
              label="Tested"
              value={totalTested}
              accent="emerald"
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Vulnerable"
              value={totalVulnerable}
              accent="amber"
            />
            <SummaryCard
              icon={Skull}
              label="Critical"
              value={totalCritical}
              accent="red"
            />
            <SummaryCard
              icon={ShieldAlert}
              label="High"
              value={totalHigh}
              accent="rose"
            />
          </section>

          {/* ── Meta row ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
              <Terminal className="size-3" /> Engagement:{" "}
              <span className="ml-1 font-mono text-zinc-300">{result.engagementId.slice(0, 12)}…</span>
            </Badge>
            {result.endpointsDiscovered !== undefined && (
              <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                <Database className="size-3" /> {result.endpointsDiscovered} endpoints discovered
              </Badge>
            )}
            {result.testSource && (
              <Badge
                variant="outline"
                className={
                  result.testSource === "llm"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }
              >
                <Brain className="size-3" /> {result.testSource === "llm" ? "AI-generated" : "Heuristic"}
              </Badge>
            )}
            {totalMedium > 0 && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                {totalMedium} medium
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              className="ml-auto text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className="size-3.5" /> New run
            </Button>
          </div>

          {/* ── Category breakdown bar chart ────────────────────────────── */}
          <Card className="hud-corners relative border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Category Breakdown</h3>
              </div>
              <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400">
                <Unlock className="size-3" /> Tested vs Vulnerable
              </Badge>
            </div>

            <div className="h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryData.map((c) => ({
                    name: (CATEGORY_META[c.category]?.label || c.label || c.category).split(" ")[0],
                    fullName: CATEGORY_META[c.category]?.label || c.label,
                    Tested: c.tested,
                    Vulnerable: c.vulnerable,
                    color: CATEGORY_META[c.category]?.hex || "#10b981",
                    cwe: CATEGORY_META[c.category]?.cwe || c.category,
                  }))}
                  margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#a1a1aa", fontSize: 10 }}
                    tickLine={{ stroke: "#3f3f46" }}
                    axisLine={{ stroke: "#3f3f46" }}
                  />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 10 }}
                    tickLine={{ stroke: "#3f3f46" }}
                    axisLine={{ stroke: "#3f3f46" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #3f3f46",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#fafafa", fontWeight: 600 }}
                    labelFormatter={(_, payload) =>
                      payload && payload[0] ? `${payload[0].payload.fullName} · ${payload[0].payload.cwe}` : ""
                    }
                  />
                  <Bar dataKey="Tested" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {categoryData.map((c, i) => (
                      <Cell key={`tested-${i}`} fill={CATEGORY_META[c.category]?.hex || "#10b981"} fillOpacity={0.35} />
                    ))}
                  </Bar>
                  <Bar dataKey="Vulnerable" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {categoryData.map((c, i) => (
                      <Cell key={`vuln-${i}`} fill={CATEGORY_META[c.category]?.hex || "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {categoryData.map((c) => {
                const meta = CATEGORY_META[c.category];
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <div
                    key={c.category}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1.5"
                  >
                    <Icon className="size-3.5 shrink-0" style={{ color: meta.hex }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-medium text-zinc-300">{meta.label}</div>
                      <div className="text-[10px] text-zinc-500">
                        {c.vulnerable}/{c.tested} vuln
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Live test results (per-test PASS/FAIL) ────────────────────── */}
          {result.results && result.results.length > 0 && (
            <Card className="hud-corners relative border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Test Execution Log</h3>
                </div>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400">
                  {result.results.length} tests
                </Badge>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {result.results.map((r, i) => {
                  const cat = resolveCategory(r.category);
                  const meta = CATEGORY_META[cat];
                  const Icon = meta?.icon || Code2;
                  return (
                    <motion.div
                      key={`${r.testId}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4) }}
                      className={`flex items-start gap-3 rounded-md border p-2.5 ${
                        r.vulnerable
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-emerald-500/20 bg-emerald-500/5"
                      }`}
                    >
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60">
                        <Icon className="size-3.5" style={{ color: meta?.hex }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-zinc-500">{r.testId}</span>
                          <Badge
                            variant="outline"
                            className="border-zinc-700 bg-zinc-900/60 text-[9px] text-zinc-400"
                          >
                            {r.method}
                          </Badge>
                          <span
                            className="truncate text-xs font-medium text-zinc-200"
                            title={r.name}
                          >
                            {r.name}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-zinc-500" title={r.endpoint}>
                          {r.endpoint}
                        </div>
                        {r.payload && r.payload !== "(none)" && (
                          <div className="mt-1 truncate font-mono text-[10px] text-amber-300/80" title={r.payload}>
                            → {r.payload}
                          </div>
                        )}
                        <div className="mt-1 text-[10px] text-zinc-500">
                          HTTP {r.responseStatus || "—"} ·{" "}
                          <span className={r.vulnerable ? "text-red-300" : "text-emerald-300"}>
                            {r.vulnerable ? "VULNERABLE" : "PASS"}
                          </span>{" "}
                          · {r.cwe}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {r.vulnerable ? (
                          <XCircle className="size-4 text-red-400" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-400" />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Findings table ───────────────────────────────────────────── */}
          {result.findings.length > 0 && (
            <Card className="hud-corners relative border-red-500/20 bg-zinc-950/60 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Confirmed Findings
                  </h3>
                </div>
                <Badge className="border-red-500/30 bg-red-500/10 text-red-300">
                  {result.findings.length} vuln{result.findings.length === 1 ? "" : "s"}
                </Badge>
              </div>

              {/* Desktop: table; Mobile: stacked cards */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Severity</th>
                      <th className="px-2 py-2 font-medium">Title</th>
                      <th className="px-2 py-2 font-medium">Endpoint</th>
                      <th className="px-2 py-2 font-medium">CWE</th>
                      <th className="px-2 py-2 font-medium">Payload</th>
                      <th className="px-2 py-2 font-medium text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {result.findings.map((f) => {
                      const cat = resolveCategory(
                        f.title.toLowerCase().includes("price")
                          ? "price"
                          : f.title.toLowerCase().includes("rate")
                            ? "rate"
                            : f.title.toLowerCase().includes("admin") || f.title.toLowerCase().includes("privilege")
                              ? "privilege"
                              : f.title.toLowerCase().includes("mass") || f.title.toLowerCase().includes("role")
                                ? "mass"
                                : f.title.toLowerCase().includes("workflow") || f.title.toLowerCase().includes("skip")
                                  ? "workflow"
                                  : "idor",
                      );
                      const meta = CATEGORY_META[cat];
                      const Icon = meta?.icon || Code2;
                      return (
                        <tr
                          key={f.id}
                          className="group transition-colors hover:bg-zinc-900/40"
                        >
                          <td className="px-2 py-2 align-top">
                            <Badge className={`border ${SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info}`}>
                              {f.severity}
                            </Badge>
                          </td>
                          <td className="max-w-[260px] px-2 py-2 align-top">
                            <div className="flex items-start gap-1.5">
                              <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: meta?.hex }} />
                              <span className="text-zinc-200">{f.title}</span>
                            </div>
                          </td>
                          <td className="max-w-[180px] px-2 py-2 align-top">
                            <span className="font-mono text-[10px] text-zinc-400">
                              {f.method} {f.endpoint}
                            </span>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400">
                              {f.owasp}
                            </Badge>
                          </td>
                          <td className="max-w-[200px] px-2 py-2 align-top">
                            <code className="block max-h-12 overflow-hidden text-[10px] text-amber-300/80" title={f.payload}>
                              {f.payload.slice(0, 120)}
                              {f.payload.length > 120 ? "…" : ""}
                            </code>
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
                              className="h-7 px-2 text-[10px] text-zinc-400 hover:text-emerald-300"
                            >
                              {expandedFinding === f.id ? "Hide" : "View"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: stacked cards */}
              <div className="space-y-2 md:hidden">
                {result.findings.map((f) => (
                  <div key={f.id} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge className={`border ${SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info}`}>
                        {f.severity}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400">
                        {f.owasp}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs font-medium text-zinc-200">{f.title}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">
                      {f.method} {f.endpoint}
                    </p>
                    {f.payload && f.payload !== "(none)" && (
                      <pre className="mt-2 max-h-24 overflow-auto rounded bg-zinc-950/80 p-2 font-mono text-[10px] text-amber-300/80">
                        {f.payload.slice(0, 240)}
                      </pre>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
                      className="mt-2 h-7 px-2 text-[10px] text-zinc-400 hover:text-emerald-300"
                    >
                      {expandedFinding === f.id ? "Hide details" : "View proof"}
                    </Button>
                    <AnimatePresence>
                      {expandedFinding === f.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 space-y-2 overflow-hidden"
                        >
                          <ProofBlock label="HTTP Request" content={f.proofRequest} icon={Code2} />
                          <ProofBlock label="HTTP Response" content={f.proofResponse} icon={Terminal} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Expanded proof (desktop) */}
              <AnimatePresence>
                {expandedFinding && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 hidden overflow-hidden md:block"
                  >
                    {(() => {
                      const f = result.findings.find((x) => x.id === expandedFinding);
                      if (!f) return null;
                      return (
                        <div className="space-y-2">
                          <ProofBlock label="HTTP Request" content={f.proofRequest} icon={Code2} />
                          <ProofBlock label="HTTP Response" content={f.proofResponse} icon={Terminal} />
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )}

          {/* ── Discovery log ──────────────────────────────────────────────── */}
          {result.discoveryLog && result.discoveryLog.length > 0 && (
            <Card className="hud-corners relative border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2">
                <Database className="size-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Endpoint Discovery Log</h3>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded bg-zinc-950/80 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
                {result.discoveryLog.join("\n")}
              </pre>
            </Card>
          )}
        </motion.div>
      )}

      {/* ── Empty state (when nothing has run yet) ─────────────────────────── */}
      {!result && !running && !error && (
        <Card className="hud-corners relative border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center sm:p-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <Brain className="size-7 text-emerald-400 neon-emerald" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">
            Ready to find business-logic flaws
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-400 sm:text-sm">
            GuardianX&apos;s AI understands your target&apos;s API schema and crafts 10 tailored
            test cases for authorization bypass, price manipulation, workflow bypass, IDOR,
            rate-limit bypass, and mass assignment.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {Object.values(CATEGORY_META).map((meta) => {
              const Icon = meta.icon;
              return (
                <Badge
                  key={meta.label}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-300"
                >
                  <Icon className="size-3" style={{ color: meta.hex }} />
                  {meta.label}
                </Badge>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
            <Lock className="size-3" />
            Authorization required · Scope testing only · SSRF-guarded
            <Zap className="size-3 text-amber-400" />
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Brain;
  label: string;
  value: number;
  accent: "emerald" | "amber" | "red" | "rose";
}) {
  const styles: Record<typeof accent, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    red: "border-red-500/30 bg-red-500/5 text-red-300",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-300",
  };
  const iconColor: Record<typeof accent, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    rose: "text-rose-400",
  };
  return (
    <Card className={`hud-corners relative p-3 sm:p-4 ${styles[accent]}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${iconColor[accent]}`} />
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold sm:text-3xl">{value}</div>
    </Card>
  );
}

function ProofBlock({
  label,
  content,
  icon: Icon,
}: {
  label: string;
  content: string;
  icon: typeof Terminal;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/80 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        <Icon className="size-3" />
        {label}
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-zinc-300">
        {content.slice(0, 1800)}
        {content.length > 1800 ? "\n… (truncated)" : ""}
      </pre>
    </div>
  );
}

// ── Derive category breakdown from results when API didn't provide one ───────
function deriveCategoryBreakdown(results: TestResult[]): CategoryBreakdownItem[] {
  const order: Category[] = [
    "idor",
    "price_manipulation",
    "workflow_bypass",
    "rate_limit",
    "privilege_escalation",
    "mass_assignment",
  ];
  return order.map((cat) => {
    const matched = results.filter((r) => resolveCategory(r.category) === cat);
    return {
      category: cat,
      label: CATEGORY_META[cat].label,
      tested: matched.length,
      vulnerable: matched.filter((r) => r.vulnerable).length,
      severity: CATEGORY_META[cat].severity,
    };
  });
}

export default BusinessLogicTesting;
