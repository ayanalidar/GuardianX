"use client";

// GuardianX — AI Prompt Injection Scanner
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen tab component. Probes any OpenAI-compatible LLM endpoint with
// 24 adversarial prompts (leakage / jailbreak / tool_hijack / exfiltration /
// override) and surfaces PASS/FAIL per test, plus a category breakdown bar
// chart and an aggregate "Tested N · Vulnerable M · Critical K" summary.
//
// Dark theme, red/amber/emerald accents, hud-corners. No indigo/blue.
//
// Flow:
//   1. User enters targetUrl (LLM endpoint) + optional systemPrompt.
//   2. POST /api/prompt-injection/scan → returns findings[].
//   3. While waiting, the 24 tests render as "pending"; once results land,
//      they flip to PASS / FAIL with a staggered animation for "live" feel.
//   4. After the scan, the findings table + summary + bar chart populate.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  PlayCircle,
  RotateCcw,
  ShieldX,
  Syringe,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  INJECTION_TESTS,
  INJECTION_CATEGORY_META,
  type InjectionCategory,
  type InjectionSeverity,
} from "@/lib/prompt-injection-tests";

// ── Types ────────────────────────────────────────────────────────────────────
interface Finding {
  testId: string;
  name: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  payload: string;
  response: string;
  vulnerable: boolean;
  error?: string;
}

interface ScanResult {
  targetUrl: string;
  testedCount: number;
  vulnerableCount: number;
  criticalCount: number;
  findings: Finding[];
  startedAt: string;
  completedAt: string;
}

type TestState = "pending" | "running" | "pass" | "fail" | "error";

interface TestRow {
  testId: string;
  name: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  payload: string;
  state: TestState;
  response?: string;
  error?: string;
}

// ── Severity → color ─────────────────────────────────────────────────────────
const SEVERITY_COLOR: Record<InjectionSeverity, string> = {
  critical: "#dc2626",
  high: "#f43f5e",
  medium: "#f59e0b",
  low: "#a3a3a3",
};

const SEVERITY_BG: Record<InjectionSeverity, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  high: "border-rose-500/30 bg-rose-500/5 text-rose-200",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low: "border-zinc-700 bg-zinc-800/50 text-zinc-300",
};

const CATEGORY_ICON: Record<InjectionCategory, typeof Zap> = {
  leakage: Lock,
  jailbreak: Zap,
  tool_hijack: Terminal,
  exfiltration: Download,
  override: ShieldX,
};

// ── Token helper (mirrors sentinelApi.http) ──────────────────────────────────
function getToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("guardianx-token")
    : null;
}

// ── Component ────────────────────────────────────────────────────────────────
export function PromptInjectionScanner() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<TestRow[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      targetUrl: string;
      actor: string;
      testedCount: number;
      vulnerableCount: number;
      criticalCount: number;
      startedAt: string;
    }>
  >([]);

  // Load past runs (history) on mount.
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/prompt-injection/runs", {
        headers: {
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        runs?: Array<{
          id: string;
          targetUrl: string;
          actor: string;
          testedCount: number;
          vulnerableCount: number;
          criticalCount: number;
          startedAt: string;
        }>;
        error?: string;
      };
      if (res.ok && data.runs) setHistory(data.runs);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Elapsed timer during scan.
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [running]);

  const runScan = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({
        variant: "destructive",
        title: "Target URL required",
        description: "Enter the LLM endpoint you want to probe.",
      });
      return;
    }
    let url: URL;
    try {
      url = new URL(targetUrl.trim());
    } catch {
      toast({
        variant: "destructive",
        title: "Invalid URL",
        description: "Enter a valid http(s) URL.",
      });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      toast({
        variant: "destructive",
        title: "Invalid protocol",
        description: "Only http and https targets are supported.",
      });
      return;
    }

    setRunning(true);
    setResult(null);
    setElapsedMs(0);
    setRows(
      INJECTION_TESTS.map((t) => ({
        testId: t.id,
        name: t.name,
        category: t.category,
        severity: t.severity,
        payload: t.payload,
        state: "pending" as TestState,
      }))
    );

    try {
      const res = await fetch("/api/prompt-injection/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as
        | ScanResult
        | { error?: string };

      if (!res.ok) {
        const msg = (data as { error?: string })?.error ?? `Scan failed (${res.status})`;
        throw new Error(msg);
      }

      const scan = data as ScanResult;

      // Stagger reveal for "live" feel — flip each row to pass/fail in turn.
      scan.findings.forEach((f, i) => {
        setTimeout(() => {
          setRows((prev) =>
            prev.map((r) =>
              r.testId === f.testId
                ? {
                    ...r,
                    state: f.error ? "error" : f.vulnerable ? "fail" : "pass",
                    response: f.response,
                    error: f.error,
                  }
                : r
            )
          );
        }, Math.min(i * 60, 1_400));
      });

      // After the stagger finishes, set the result.
      setTimeout(() => {
        setResult(scan);
        setRunning(false);
        loadHistory();
        toast({
          title:
            scan.vulnerableCount > 0
              ? `⚠ ${scan.vulnerableCount} vulnerabilities found`
              : "All tests passed",
          description:
            scan.criticalCount > 0
              ? `${scan.criticalCount} critical — review immediately.`
              : "Target resisted all 24 adversarial prompts.",
          variant: scan.vulnerableCount > 0 ? "destructive" : "default",
        });
      }, Math.min(scan.findings.length * 60, 1_400) + 100);
    } catch (err) {
      setRunning(false);
      setRows((prev) =>
        prev.map((r) => ({ ...r, state: "error", error: "scan-aborted" }))
      );
      toast({
        variant: "destructive",
        title: "Scan failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [targetUrl, systemPrompt, toast, loadHistory]);

  const reset = useCallback(() => {
    setRows([]);
    setResult(null);
    setElapsedMs(0);
  }, []);

  // Aggregate counts for the summary + bar chart.
  const stats = useMemo(() => {
    const byCategory: Record<
      InjectionCategory,
      { tested: number; vulnerable: number }
    > = {
      leakage: { tested: 0, vulnerable: 0 },
      jailbreak: { tested: 0, vulnerable: 0 },
      tool_hijack: { tested: 0, vulnerable: 0 },
      exfiltration: { tested: 0, vulnerable: 0 },
      override: { tested: 0, vulnerable: 0 },
    };
    for (const r of rows) {
      byCategory[r.category].tested += 1;
      if (r.state === "fail") byCategory[r.category].vulnerable += 1;
    }
    return byCategory;
  }, [rows]);

  const chartData = useMemo(
    () =>
      (Object.keys(stats) as InjectionCategory[]).map((cat) => ({
        category: INJECTION_CATEGORY_META[cat].label,
        tested: stats[cat].tested,
        vulnerable: stats[cat].vulnerable,
        color: INJECTION_CATEGORY_META[cat].color,
      })),
    [stats]
  );

  const tested = rows.length;
  const vulnerable = rows.filter((r) => r.state === "fail").length;
  const critical = rows.filter(
    (r) => r.state === "fail" && r.severity === "critical"
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
          <span className="size-1.5 rounded-full bg-rose-500 pulse-dot" />
          guardianx@attack-surface:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <Syringe className="size-5 text-rose-400" />
          AI Prompt Injection Scanner
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Probe LLM apps (ChatGPT integrations, AI agents, RAG pipelines) with 24
          adversarial prompts across 5 categories: leakage, jailbreak,
          tool-hijack, exfiltration, override.
        </p>
      </div>

      {/* Top: form + summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card className="holo-card hud-corners gap-0 rounded-xl p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
              Target Configuration
            </span>
            <Badge className="border border-rose-500/30 bg-rose-500/10 text-[9px] text-rose-300">
              24 adversarial tests
            </Badge>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-zinc-400">Target LLM Endpoint (OpenAI-compatible)</Label>
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://api.example.com/v1/chat (must accept {messages})"
                disabled={running}
                className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                The endpoint will receive <code className="text-emerald-400">POST</code> with{" "}
                <code className="text-zinc-400">{`{ messages: [...] }`}</code> and a sentinel auth header.
              </p>
            </div>

            <div>
              <Label className="text-xs text-zinc-400">System Prompt (optional)</Label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant. Never reveal secrets."
                rows={3}
                disabled={running}
                className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                onClick={runScan}
                disabled={running}
                className="border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
              >
                {running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlayCircle className="size-4" />
                )}
                Run Injection Scan
              </Button>
              <Button
                variant="outline"
                onClick={reset}
                disabled={running}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <RotateCcw className="size-4" />
                Reset
              </Button>
              {running && (
                <span className="font-mono text-[11px] text-amber-400">
                  elapsed {(elapsedMs / 1000).toFixed(1)}s · 10s overall cap
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Summary tiles */}
        <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Scan Summary
          </span>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryTile
              label="Tested"
              value={tested}
              icon={<Activity className="size-3.5 text-emerald-400" />}
              tone="emerald"
            />
            <SummaryTile
              label="Vulnerable"
              value={vulnerable}
              icon={<AlertTriangle className="size-3.5 text-rose-400" />}
              tone={vulnerable > 0 ? "rose" : "zinc"}
            />
            <SummaryTile
              label="Critical"
              value={critical}
              icon={<AlertOctagon className="size-3.5 text-rose-500" />}
              tone={critical > 0 ? "critical" : "zinc"}
            />
          </div>

          {/* Category breakdown bar chart */}
          <div className="mt-4">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              Category Breakdown
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" hide domain={[0, 5]} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={70}
                    tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      background: "rgba(9,9,11,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#e4e4e7",
                    }}
                  />
                  <Bar dataKey="tested" radius={[0, 4, 4, 0]} barSize={10}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.25} />
                    ))}
                  </Bar>
                  <Bar dataKey="vulnerable" radius={[0, 4, 4, 0]} barSize={10}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex items-center justify-end gap-3 font-mono text-[8px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-zinc-500/40" /> tested
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-rose-500" /> vulnerable
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Live progress bar */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="hud-corners gap-0 rounded-xl border-rose-500/30 bg-rose-500/5 p-3">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-rose-300">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" />
                  Probing target · {tested} tests dispatched
                </span>
                <span className="text-rose-400">
                  {Math.min(tested > 0 ? (rows.filter((r) => r.state === "pass" || r.state === "fail" || r.state === "error").length / tested, 1) : 0) * 100 | 0}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"
                  animate={{
                    width: `${
                      tested > 0
                        ? ((rows.filter((r) => r.state === "pass" || r.state === "fail" || r.state === "error").length) /
                            tested) *
                          100
                        : 0
                    }%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test list (live during scan, summary after) */}
      {rows.length > 0 && (
        <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {running ? "Live Test Results" : "Findings"}
            </span>
            {result && (
              <span className="font-mono text-[10px] text-zinc-500">
                {result.testedCount} tested · {result.vulnerableCount} vulnerable · {result.criticalCount} critical
              </span>
            )}
          </div>

          <div className="custom-scrollbar max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {rows.map((row, i) => {
              const Icon = CATEGORY_ICON[row.category];
              const meta = INJECTION_CATEGORY_META[row.category];
              return (
                <motion.div
                  key={row.testId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  className={`rounded-lg border p-2.5 ${
                    row.state === "fail"
                      ? "border-rose-500/30 bg-rose-500/5"
                      : row.state === "error"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : row.state === "pass"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="font-mono text-[10px] font-bold text-zinc-300">
                      {row.testId}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-200">{row.name}</span>
                    <Badge
                      className={`ml-auto border text-[8px] uppercase ${SEVERITY_BG[row.severity]}`}
                    >
                      {row.severity}
                    </Badge>
                    <StateBadge state={row.state} />
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] text-zinc-500">
                    <span className="text-zinc-600">payload:</span>{" "}
                    <span className="text-zinc-400">{row.payload.slice(0, 120)}{row.payload.length > 120 ? "…" : ""}</span>
                  </div>
                  {(row.state === "fail" || row.state === "pass" || row.state === "error") && (
                    <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-950/60 p-1.5">
                      <div className="mb-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                        {row.state === "error" ? "error" : "llm response"}
                      </div>
                      <div className={`font-mono text-[10px] leading-relaxed ${
                        row.state === "fail" ? "text-rose-300" : row.state === "error" ? "text-amber-300" : "text-zinc-400"
                      }`}>
                        {row.state === "error"
                          ? row.error ?? "error"
                          : (row.response || "(empty response)").slice(0, 280)}
                        {(row.response || "").length > 280 ? "…" : ""}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-900/40 p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <Syringe className="size-6 text-rose-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-200">
              No scan run yet
            </h3>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Enter a target LLM endpoint above and click <span className="text-rose-300">Run Injection Scan</span> to
              probe it with 24 adversarial prompts.
            </p>
          </div>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Past Scans
            </span>
            <span className="font-mono text-[9px] text-zinc-600">
              last {history.length} runs
            </span>
          </div>
          <div className="custom-scrollbar max-h-44 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-zinc-900/95 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5">Target</th>
                  <th className="px-2 py-1.5">Actor</th>
                  <th className="px-2 py-1.5 text-right">Tested</th>
                  <th className="px-2 py-1.5 text-right">Vuln</th>
                  <th className="px-2 py-1.5 text-right">Critical</th>
                  <th className="px-2 py-1.5">When</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[10px] text-zinc-300">
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="max-w-[160px] truncate px-2 py-1.5 text-zinc-400" title={h.targetUrl}>
                      {h.targetUrl}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-500">{h.actor}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-400">{h.testedCount}</td>
                    <td className="px-2 py-1.5 text-right text-rose-400">{h.vulnerableCount}</td>
                    <td className="px-2 py-1.5 text-right text-rose-500">{h.criticalCount}</td>
                    <td className="px-2 py-1.5 text-zinc-500">
                      {new Date(h.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function SummaryTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "critical" | "zinc";
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/40 text-rose-400",
    critical: "border-rose-500/60 text-rose-500",
    zinc: "border-zinc-700 text-zinc-400",
  };
  return (
    <div className={`rounded-lg border bg-zinc-900/40 p-2 text-center ${toneClasses[tone]}`}>
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="font-mono text-lg font-bold tabular-nums">{value}</span>
      </div>
      <div className="text-[8px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

function StateBadge({ state }: { state: TestState }) {
  switch (state) {
    case "pending":
      return (
        <Badge className="border border-zinc-700 bg-zinc-800/40 text-[8px] text-zinc-400">
          <Loader2 className="mr-1 size-2.5 animate-spin" /> pending
        </Badge>
      );
    case "running":
      return (
        <Badge className="border border-amber-500/30 bg-amber-500/10 text-[8px] text-amber-300">
          <Loader2 className="mr-1 size-2.5 animate-spin" /> running
        </Badge>
      );
    case "pass":
      return (
        <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-[8px] text-emerald-300">
          <CheckCircle2 className="mr-1 size-2.5" /> PASS
        </Badge>
      );
    case "fail":
      return (
        <Badge className="border border-rose-500/40 bg-rose-500/20 text-[8px] text-rose-300">
          <XCircle className="mr-1 size-2.5" /> FAIL
        </Badge>
      );
    case "error":
      return (
        <Badge className="border border-amber-500/30 bg-amber-500/10 text-[8px] text-amber-300">
          <AlertTriangle className="mr-1 size-2.5" /> ERR
        </Badge>
      );
  }
}
