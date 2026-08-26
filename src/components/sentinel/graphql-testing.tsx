"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Network,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  AlertTriangle,
  Info,
  Terminal,
  Zap,
  Bug,
  Activity,
  Lock,
  Server,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers,
  Boxes,
  Lightbulb,
  Copy,
  Radio,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────────────────

type Category =
  | "Introspection"
  | "Query Depth"
  | "Batching"
  | "Field Suggestions"
  | "Alias"
  | "Mutation"
  | "Subscription";

type Severity = "info" | "low" | "medium" | "high" | "critical";

interface FindingDto {
  name: string;
  category: Category;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
}

interface ApiResponse {
  engagementId: string;
  graphqlUrl: string;
  testedCount: number;
  vulnerableCount: number;
  criticalCount: number;
  findings: FindingDto[];
  error?: string;
}

interface StageState {
  category: Category;
  label: string;
  status: "queued" | "scanning" | "done";
}

// ─── Category → Color mapping ──────────────────────────────────────────
// NO indigo/blue. Sky is explicitly requested for Field Suggestions.
const CAT_COLOR: Record<Category, { text: string; bg: string; border: string; dot: string }> = {
  Introspection: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40", dot: "bg-amber-500" },
  "Query Depth": { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40", dot: "bg-red-500" },
  Batching: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/40", dot: "bg-orange-500" },
  "Field Suggestions": { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/40", dot: "bg-sky-500" },
  Alias: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/40", dot: "bg-violet-500" },
  Mutation: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40", dot: "bg-red-500" },
  Subscription: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/40", dot: "bg-cyan-500" },
};

const CAT_ICON: Record<Category, typeof Network> = {
  Introspection: Eye,
  "Query Depth": Layers,
  Batching: Boxes,
  "Field Suggestions": Lightbulb,
  Alias: Copy,
  Mutation: Zap,
  Subscription: Radio,
};

const SEV_ICON: Record<Severity, typeof Info> = {
  info: Info,
  low: Info,
  medium: AlertTriangle,
  high: ShieldAlert,
  critical: ShieldAlert,
};

const SEV_COLOR: Record<Severity, string> = {
  info: "text-zinc-400",
  low: "text-sky-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

// Lazy imports removed — icons imported above.

const STAGE_ORDER: StageState[] = [
  { category: "Introspection", label: "Probing __schema + __type introspection", status: "queued" },
  { category: "Query Depth", label: "Sending nested queries (depth 5, 10, 15, 20)", status: "queued" },
  { category: "Batching", label: "Firing 100 then 1000-query batches", status: "queued" },
  { category: "Field Suggestions", label: "Probing 'Did you mean' leak", status: "queued" },
  { category: "Alias", label: "Sending 100-alias query", status: "queued" },
  { category: "Mutation", label: "Trying unauthenticated mutations", status: "queued" },
  { category: "Subscription", label: "Probing subscription transport", status: "queued" },
];

// ─── Component ──────────────────────────────────────────────────────────

export function GraphQLTesting() {
  const { toast } = useToast();
  const [url, setUrl] = useState("https://api.example.com/graphql");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageState[]>(STAGE_ORDER);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const runTests = useCallback(async () => {
    if (!url.trim()) {
      toast({
        title: "URL required",
        description: "Enter a GraphQL endpoint URL first.",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    setResult(null);
    setExpanded({});
    setStages(STAGE_ORDER.map((s) => ({ ...s, status: "queued" })));

    // Simulate progressive stage reveal while the request is in flight.
    let i = 0;
    stageTimer.current = setInterval(() => {
      i = Math.min(i + 1, STAGE_ORDER.length);
      setStages((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i ? "scanning" : "queued",
        }))
      );
    }, 350);

    try {
      const res = await fetch("/api/vapt/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graphqlUrl: url.trim() }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(data);
      setStages((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: "done",
        }))
      );
      toast({
        title: "GraphQL scan complete",
        description: `${data.testedCount} tests · ${data.vulnerableCount} vulnerable · ${data.criticalCount} critical`,
      });
    } catch (err) {
      toast({
        title: "GraphQL scan failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setStages((prev) => prev.map((s) => ({ ...s, status: "done" })));
    } finally {
      if (stageTimer.current) {
        clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
      setRunning(false);
    }
  }, [url, toast]);

  useEffect(() => {
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, []);

  const toggleExpand = (name: string) =>
    setExpanded((p) => ({ ...p, [name]: !p[name] }));

  const testedCount = result?.testedCount ?? 0;
  const vulnCount = result?.vulnerableCount ?? 0;
  const critCount = result?.criticalCount ?? 0;

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* ─── Header ───────────────────────────────────────────────── */}
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">
              <span className="size-1.5 rounded-full bg-cyan-500 pulse-dot" />
              sentinel@graphql-vapt:~$
            </div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight neon-cyan sm:text-3xl">
              <Network className="size-7 text-cyan-400" />
              GRAPHQL TESTING
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
              VAPT module for GraphQL endpoints. Detects introspection leaks,
              query depth abuse, batching DoS, field suggestion information
              disclosure, alias abuse, unauthenticated mutations, and subscription
              exposure.
            </p>
          </div>
        </header>

        {/* ─── Input Bar ────────────────────────────────────────────── */}
        <Card className="holo-card-sharp hud-corners mb-6 border border-cyan-500/20 bg-zinc-900/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2.5">
              <Terminal className="size-5 shrink-0 text-violet-400" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/graphql"
                disabled={running}
                className="border-violet-500/30 bg-zinc-950/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/20"
                aria-label="GraphQL endpoint URL"
              />
            </div>
            <Button
              onClick={runTests}
              disabled={running}
              className="bg-cyan-500/90 text-zinc-950 hover:bg-cyan-400"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Run GraphQL Tests
                </>
              )}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
            {STAGE_ORDER.map((s) => {
              const c = CAT_COLOR[s.category];
              return (
                <Badge
                  key={s.category}
                  variant="outline"
                  className={`gap-1.5 border ${c.border} ${c.bg} ${c.text} font-mono`}
                >
                  <span className={`size-1.5 rounded-full ${c.dot}`} />
                  {s.category}
                </Badge>
              );
            })}
          </div>
        </Card>

        {/* ─── Summary Tiles (after run) ──────────────────────────── */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            <SummaryTile
              icon={<Activity className="size-5 text-cyan-400" />}
              label="TESTS RUN"
              value={testedCount}
              accent="cyan"
            />
            <SummaryTile
              icon={<ShieldAlert className="size-5 text-amber-400" />}
              label="VULNERABLE"
              value={vulnCount}
              accent="amber"
            />
            <SummaryTile
              icon={<Bug className="size-5 text-red-400" />}
              label="CRITICAL"
              value={critCount}
              accent="red"
            />
            <SummaryTile
              icon={<Lock className="size-5 text-emerald-400" />}
              label="PASSED"
              value={Math.max(0, testedCount - vulnCount)}
              accent="emerald"
            />
          </motion.div>
        )}

        {/* ─── Live Stage Results ──────────────────────────────────── */}
        {(running || result) && (
          <div className="mb-6 space-y-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-violet-400/70">
              <span className="size-1.5 rounded-full bg-violet-500 pulse-dot" />
              test pipeline
            </div>
            <AnimatePresence>
              {stages.map((stage, idx) => {
                const color = CAT_COLOR[stage.category];
                const Icon = CAT_ICON[stage.category];
                const finding = result?.findings.find((f) => f.category === stage.category);
                const isVulnerable = finding?.vulnerable ?? false;
                const status = stage.status;
                return (
                  <motion.div
                    key={stage.category}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`holo-card-sharp hud-corners border ${color.border} ${color.bg} p-3 sm:p-4`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${color.border} ${color.bg}`}>
                        <Icon className={`size-4 ${color.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs uppercase tracking-wider ${color.text}`}>
                            {stage.category}
                          </span>
                          <span className="text-[10px] text-zinc-500">·</span>
                          <span className="truncate font-mono text-[10px] text-zinc-500">
                            {stage.label}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium text-zinc-200">
                          {finding?.name ?? (status === "scanning" ? "Running…" : status === "queued" ? "Queued" : "—")}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {status === "done" ? (
                          finding ? (
                            isVulnerable ? (
                              <Badge variant="outline" className="gap-1 border-red-500/40 bg-red-500/10 text-red-400">
                                <XCircle className="size-3.5" /> FAIL
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                                <CheckCircle2 className="size-3.5" /> PASS
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="gap-1 border-zinc-600/40 bg-zinc-700/10 text-zinc-400">
                              <Info className="size-3.5" /> N/A
                            </Badge>
                          )
                        ) : status === "scanning" ? (
                          <Loader2 className="size-4.5 animate-spin text-cyan-400" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-zinc-600" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* ─── Findings Table ──────────────────────────────────────── */}
        {result && result.findings.length > 0 && (
          <Card className="holo-card-sharp hud-corners border border-violet-500/20 bg-zinc-900/60 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-violet-400/70">
              <span className="size-1.5 rounded-full bg-violet-500 pulse-dot" />
              findings ledger
            </div>
            <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-950/90 font-mono text-[10px] uppercase tracking-wider text-zinc-500 backdrop-blur">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 font-medium">Finding</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Category</th>
                    <th className="px-3 py-2 font-medium">CWE</th>
                    <th className="px-3 py-2 font-medium">Severity</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {result.findings.map((f, i) => {
                    const c = CAT_COLOR[f.category];
                    const isOpen = !!expanded[f.name];
                    const SevIcon = SEV_ICON[f.severity];
                    return (
                      <Fragment key={f.name + i}>
                        <tr
                          className="cursor-pointer transition-colors hover:bg-zinc-800/30"
                          onClick={() => toggleExpand(f.name)}
                        >
                          <td className="px-3 py-2.5 align-top">
                            <div className="flex items-center gap-2">
                              {isOpen ? (
                                <ChevronDown className="size-3.5 shrink-0 text-zinc-500" />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />
                              )}
                              <span className="text-zinc-200">{f.name}</span>
                            </div>
                          </td>
                          <td className="hidden px-3 py-2.5 align-top sm:table-cell">
                            <Badge
                              variant="outline"
                              className={`gap-1 border ${c.border} ${c.bg} ${c.text}`}
                            >
                              <span className={`size-1.5 rounded-full ${c.dot}`} />
                              {f.category}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 align-top font-mono text-xs text-zinc-400">
                            {f.cwe}
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <span className={`inline-flex items-center gap-1 font-mono text-xs uppercase ${SEV_COLOR[f.severity]}`}>
                              <SevIcon className="size-3.5" />
                              {f.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {f.vulnerable ? (
                              <Badge variant="outline" className="gap-1 border-red-500/40 bg-red-500/10 text-red-400">
                                <XCircle className="size-3" /> VULN
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                                <CheckCircle2 className="size-3" /> OK
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top font-mono text-[10px] text-zinc-500">
                            #{i + 1}
                          </td>
                        </tr>
                        <AnimatePresence>
                          {isOpen && (
                            <tr className="bg-zinc-950/50">
                              <td colSpan={6} className="px-3 pb-3 pt-1">
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="grid gap-3 lg:grid-cols-2"
                                >
                                  <ProofBlock
                                    title="Request"
                                    icon={<Terminal className="size-3.5 text-cyan-400" />}
                                    body={f.proofRequest}
                                  />
                                  <ProofBlock
                                    title="Response"
                                    icon={<Server className="size-3.5 text-violet-400" />}
                                    body={f.proofResponse}
                                  />
                                  <ProofBlock
                                    title="Remediation"
                                    icon={<ShieldAlert className="size-3.5 text-amber-400" />}
                                    body={f.remediation}
                                  />
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {result.engagementId && (
              <div className="mt-3 border-t border-zinc-800 pt-3 font-mono text-[10px] text-zinc-500">
                engagement <span className="text-cyan-400">{result.engagementId}</span> · endpoint{" "}
                <span className="text-violet-400">{result.graphqlUrl}</span>
              </div>
            )}
          </Card>
        )}

        {/* ─── Empty State ────────────────────────────────────────── */}
        {!running && !result && (
          <Card className="holo-card-sharp hud-corners border border-zinc-800 bg-zinc-900/40 p-8 text-center sm:p-12">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10">
              <Network className="size-7 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">
              Ready to test GraphQL endpoints
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-400">
              Enter a public GraphQL endpoint URL above and run the test battery.
              All findings are persisted to the engagement ledger.
            </p>
            <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-2">
              {STAGE_ORDER.map((s) => {
                const c = CAT_COLOR[s.category];
                return (
                  <Badge
                    key={s.category}
                    variant="outline"
                    className={`gap-1.5 border ${c.border} ${c.bg} ${c.text} font-mono`}
                  >
                    <span className={`size-1.5 rounded-full ${c.dot}`} />
                    {s.category}
                  </Badge>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function SummaryTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: "cyan" | "amber" | "red" | "emerald" | "violet";
}) {
  const accentMap: Record<"cyan" | "amber" | "red" | "emerald" | "violet", string> = {
    cyan: "border-cyan-500/30 text-cyan-400",
    amber: "border-amber-500/30 text-amber-400",
    red: "border-red-500/30 text-red-400",
    emerald: "border-emerald-500/30 text-emerald-400",
    violet: "border-violet-500/30 text-violet-400",
  };
  return (
    <Card className={`holo-card-sharp hud-corners border bg-zinc-900/60 p-3 sm:p-4 ${accentMap[accent]}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums sm:text-3xl">
        {value.toString().padStart(2, "0")}
      </div>
    </Card>
  );
}

function ProofBlock({
  title,
  icon,
  body,
}: {
  title: string;
  icon: ReactNode;
  body: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950/80">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          {title}
        </span>
      </div>
      <pre className="max-h-64 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
        {body}
      </pre>
    </div>
  );
}
