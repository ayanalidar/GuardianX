"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import {
  Cpu, Activity, ShieldCheck, ShieldAlert, Heart, Zap, RefreshCw,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Play, Send, Bot,
  User, FileText, Folder, FolderOpen, Code, Terminal, Database,
  Server, Wrench, RotateCw, Trash2, Sparkles, ChevronRight,
  ChevronDown, Bug, Gauge, Clock, Layers, Hash, Search, Download,
  FileCode, Settings, Power, RefreshCcw, Package, Database as DbIcon,
  ScrollText, Eye, Copy, Network, HardDrive, GitBranch, Boxes,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type ProbeCategory = "api" | "db" | "engine" | "mini-service" | "system";

interface HealthProbe {
  name: string;
  category: ProbeCategory;
  ok: boolean;
  latencyMs: number;
  status?: number;
  detail?: string;
}

interface HealthReport {
  ok: boolean;
  scannedAt: string;
  baseUrl: string;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    byCategory: Record<string, { ok: number; fail: number }>;
  };
  probes: HealthProbe[];
  durationMs: number;
}

interface Diagnosis {
  component: string;
  error: string;
  rootCause: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  suggestedFixes: Array<{
    action: string;
    description: string;
    autoExecutable: boolean;
  }>;
  relatedFiles: string[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CodebaseFile {
  relativePath: string;
  lines: number;
  type: "typescript" | "tsx" | "javascript" | "json" | "css" | "prisma" | "markdown" | "other";
}

interface CodebaseRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  path: string;
  file: string;
  hasAuth: boolean;
}

interface CodebaseIndex {
  files: CodebaseFile[];
  routes: CodebaseRoute[];
  components: Array<{ name: string; kind: string; file: string }>;
  libs: Array<{ name: string; kind: string; file: string }>;
  pages: Array<{ path: string; file: string; isDynamic: boolean }>;
  models: Array<{ name: string; fields: string[] }>;
  summary: {
    totalFiles: number;
    totalLines: number;
    routeCount: number;
    componentCount: number;
    libCount: number;
    pageCount: number;
    modelCount: number;
    scannedAt: string;
  };
}

interface FixResult {
  action: string;
  ok: boolean;
  message: string;
  details?: unknown;
  durationMs: number;
}

// ── Style maps ───────────────────────────────────────────────────────────────
const CATEGORY_META: Record<ProbeCategory, { label: string; icon: typeof Activity; color: string; bg: string; border: string }> = {
  api:          { label: "API Routes",    icon: Network,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  db:           { label: "Database",      icon: DbIcon,      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  engine:       { label: "Sentinel Engine", icon: Cpu,        color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
  "mini-service": { label: "Mini Services", icon: Server,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  system:       { label: "System",        icon: Activity,    color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30" },
};

const SEVERITY_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/40" },
  high:     { text: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/40" },
  medium:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/40" },
  low:      { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/40" },
  info:     { text: "text-zinc-400",   bg: "bg-zinc-500/10",   border: "border-zinc-500/40" },
};

const FILE_TYPE_ICON: Record<CodebaseFile["type"], typeof FileCode> = {
  typescript: FileCode,
  tsx: Code,
  javascript: FileCode,
  json: Settings,
  css: Hash,
  prisma: Database,
  markdown: FileText,
  other: FileText,
};

const FILE_TYPE_COLOR: Record<CodebaseFile["type"], string> = {
  typescript: "text-blue-400",
  tsx:        "text-cyan-400",
  javascript: "text-yellow-400",
  json:       "text-amber-400",
  css:        "text-pink-400",
  prisma:     "text-emerald-400",
  markdown:   "text-zinc-400",
  other:      "text-zinc-500",
};

// ── Self-heal action definitions ─────────────────────────────────────────────
interface SelfHealAction {
  id: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  color: string;
  border: string;
  bg: string;
}

const SELF_HEAL_ACTIONS: SelfHealAction[] = [
  { id: "restart_engine",         label: "Restart Engine",         description: "Restart the Sentinel engine mini-service", icon: Power,        color: "text-red-400",    border: "border-red-500/40",    bg: "bg-red-500/10" },
  { id: "rerun_migration",        label: "Rerun Migration",        description: "Re-apply Prisma schema + seed baseline",    icon: Database,     color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  { id: "clear_cache",            label: "Clear Cache",            description: "Invalidate all in-memory caches",            icon: Trash2,       color: "text-amber-400",   border: "border-amber-500/40",   bg: "bg-amber-500/10" },
  { id: "fix_env",                label: "Fix Env Vars",           description: "Verify required env vars are set",          icon: Settings,     color: "text-cyan-400",    border: "border-cyan-500/40",    bg: "bg-cyan-500/10" },
  { id: "reinstall_deps",         label: "Reinstall Deps",         description: "Run bun install to refresh node_modules",    icon: Package,      color: "text-violet-400",  border: "border-violet-500/40",  bg: "bg-violet-500/10" },
  { id: "reseed_siem_rules",      label: "Reseed SIEM Rules",      description: "Re-import the 4 default correlation rules", icon: ScrollText,   color: "text-rose-400",    border: "border-rose-500/40",    bg: "bg-rose-500/10" },
  { id: "reindex_codebase",       label: "Reindex Codebase",       description: "Rebuild the codebase index for AI diagnostics", icon: GitBranch,  color: "text-sky-400",     border: "border-sky-500/40",     bg: "bg-sky-500/10" },
  { id: "evaluate_correlations",  label: "Evaluate Correlations",  description: "Run all active SIEM correlation rules now",  icon: Zap,         color: "text-yellow-400",  border: "border-yellow-500/40",  bg: "bg-yellow-500/10" },
  { id: "run_retention_cleanup",  label: "Retention Cleanup",      description: "Delete records past the cold retention tier", icon: HardDrive,   color: "text-orange-400",  border: "border-orange-500/40",  bg: "bg-orange-500/10" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTimestamp(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
}

function categorizeFile(relPath: string): string {
  if (relPath.startsWith("src/app/api/")) return "API Routes";
  if (relPath.startsWith("src/components/sentinel/")) return "UI Components";
  if (relPath.startsWith("src/components/ui/")) return "UI Primitives";
  if (relPath.startsWith("src/lib/siem/")) return "SIEM Lib";
  if (relPath.startsWith("src/lib/ai-ops/")) return "AI Ops Lib";
  if (relPath.startsWith("src/lib/integrations/")) return "Integrations Lib";
  if (relPath.startsWith("src/lib/sentinel/")) return "Sentinel Lib";
  if (relPath.startsWith("src/lib/")) return "Other Lib";
  if (relPath.startsWith("src/app/")) return "Pages";
  if (relPath.startsWith("prisma/")) return "Schema";
  if (relPath.startsWith("mini-services/")) return "Mini Services";
  return "Root";
}

const CATEGORY_ORDER = [
  "API Routes", "UI Components", "UI Primitives", "Pages",
  "SIEM Lib", "AI Ops Lib", "Integrations Lib", "Sentinel Lib", "Other Lib",
  "Schema", "Mini Services", "Root",
];

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export function AiOpsAgent() {
  const [tab, setTab] = useState<"health" | "chat" | "codebase" | "heal">("health");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          ai-ops@guardianx:~$ ./autonomous-agent --self-heal
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Bot className="size-5 text-emerald-400" />
          AI Ops Agent
          <span className="font-mono text-sm text-zinc-500">{"// Autonomous SRE + self-healing"}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Continuously scans every API route, DB table, and mini-service. Diagnoses failures with LLM and executes self-heal actions.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-1.5">
        {([
          { id: "health",   label: "Health Dashboard",   icon: Heart,     color: "emerald" },
          { id: "chat",     label: "AI Diagnostic Chat", icon: Bot,       color: "cyan" },
          { id: "codebase", label: "Codebase Explorer",  icon: Folder,    color: "violet" },
          { id: "heal",     label: "Self-Heal Actions",  icon: Wrench,    color: "amber" },
        ] as const).map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const colorClasses: Record<string, string> = {
            emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 neon-border-emerald",
            cyan:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 neon-border-cyan",
            violet:  "bg-violet-500/15 text-violet-300 border-violet-500/40 neon-border-violet",
            amber:   "bg-amber-500/15 text-amber-300 border-amber-500/40 neon-border-amber",
          };
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all ${
                isActive ? colorClasses[t.color] : "border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "health" && <HealthDashboard />}
          {tab === "chat" && <DiagnosticChat />}
          {tab === "codebase" && <CodebaseExplorer />}
          {tab === "heal" && <SelfHealActions />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HEALTH DASHBOARD TAB
// ════════════════════════════════════════════════════════════════════════════
function HealthDashboard() {
  const { toast } = useToast();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string | null>(null);
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-ops/health?full=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");
      setReport(data as HealthReport);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Health check failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // 30s cadence (unchanged), paused while the tab is hidden.
  useVisiblePolling(load, 30_000, { immediate: false });

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/ai-ops/health?full=true`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setReport(data as HealthReport);
      toast({
        title: "Full scan complete",
        description: `${data.summary?.total || 0} probes run, ${data.summary?.unhealthy || 0} unhealthy.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Scan failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setScanning(false);
    }
  };

  const diagnose = async (probe: HealthProbe) => {
    setDiagnosing(probe.name);
    try {
      const res = await fetch(`/api/ai-ops/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component: probe.name, error: probe.detail || `Probe failed (${probe.category})` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Diagnosis failed");
      setDiagnoses((prev) => ({ ...prev, [probe.name]: data as Diagnosis }));
      toast({
        title: "Diagnosis complete",
        description: (data as Diagnosis).rootCause?.slice(0, 80) + "...",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Diagnosis failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setDiagnosing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 bg-zinc-900/40" />)}
        </div>
        <Skeleton className="h-64 bg-zinc-900/40" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
          <Heart className="size-7 text-emerald-400" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-200">No health data</h3>
        <p className="mt-1 max-w-sm text-sm text-zinc-400">Run a full scan to probe every API route, DB table, and mini-service.</p>
        <Button onClick={runScan} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-500">
          <Play className="size-4" /> Run Full Scan
        </Button>
      </div>
    );
  }

  const totalProbes = report.summary.total;
  const healthy = report.summary.healthy;
  const unhealthy = report.summary.unhealthy;
  const avgLatency = report.probes.length > 0
    ? Math.round(report.probes.reduce((a, p) => a + p.latencyMs, 0) / report.probes.length)
    : 0;
  const healthPct = totalProbes > 0 ? Math.round((healthy / totalProbes) * 100) : 0;

  // Group probes by category
  const grouped: Record<string, HealthProbe[]> = {};
  for (const p of report.probes) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }

  return (
    <div className="space-y-4">
      {/* Top bar: overall status + scan button */}
      <div className="holo-card-sharp hud-corners flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex size-14 items-center justify-center rounded-lg border ${
            report.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"
          }`}>
            {report.ok
              ? <CheckCircle2 className="size-7 text-emerald-400" />
              : <ShieldAlert className="size-7 text-red-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${report.ok ? "text-emerald-300" : "text-red-300"}`}>
                {report.ok ? "All Systems Operational" : "Issues Detected"}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                report.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/40 bg-red-500/10 text-red-300"
              }`}>
                {healthPct}% healthy
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><Clock className="size-3" /> {formatTimestamp(report.scannedAt)}</span>
              <span className="flex items-center gap-1"><Zap className="size-3" /> {report.durationMs}ms total</span>
              <span className="flex items-center gap-1"><Network className="size-3" /> {report.baseUrl}</span>
            </div>
          </div>
        </div>
        <Button
          onClick={runScan}
          disabled={scanning}
          className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border-emerald"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Run Full Scan
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Activity}     label="Total Probes"   value={totalProbes.toLocaleString()}     color="text-cyan-400"    border="border-cyan-500/20" />
        <StatTile icon={CheckCircle2} label="Healthy"        value={healthy.toLocaleString()}         color="text-emerald-400" border="border-emerald-500/20" />
        <StatTile icon={XCircle}      label="Unhealthy"      value={unhealthy.toLocaleString()}       color="text-red-400"     border="border-red-500/20" />
        <StatTile icon={Clock}        label="Avg Latency"    value={`${avgLatency}ms`}                color="text-amber-400"   border="border-amber-500/20" />
      </div>

      {/* Category summary bar */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Layers className="size-4 text-emerald-400" /> Probe Categories
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(CATEGORY_META) as ProbeCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const stats = report.summary.byCategory[cat] || { ok: 0, fail: 0 };
            const total = stats.ok + stats.fail;
            const pct = total > 0 ? Math.round((stats.ok / total) * 100) : 100;
            return (
              <div key={cat} className={`rounded-md border ${meta.border} ${meta.bg} p-3`}>
                <div className="flex items-center justify-between">
                  <meta.icon className={`size-3.5 ${meta.color}`} />
                  <span className={`font-mono text-xs font-bold ${meta.color}`}>{pct}%</span>
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">{meta.label}</div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-zinc-500">
                  <span className="text-emerald-400">{stats.ok} ok</span>
                  <span className="text-red-400">{stats.fail} fail</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Probes table with diagnose buttons */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Activity className="size-4 text-emerald-400" /> Probe Results
          <span className="font-mono text-[10px] text-zinc-500">({report.probes.length} probes)</span>
        </h3>
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
          {(Object.keys(grouped) as ProbeCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const probes = grouped[cat];
            return (
              <div key={cat} className="mb-4">
                <div className="mb-2 flex items-center gap-2 border-b border-zinc-800/60 pb-1.5">
                  <meta.icon className={`size-3.5 ${meta.color}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">({probes.length})</span>
                </div>
                <div className="space-y-1">
                  {probes.map((probe) => {
                    const diag = diagnoses[probe.name];
                    return (
                      <ProbeRow
                        key={probe.name}
                        probe={probe}
                        diagnosing={diagnosing === probe.name}
                        diagnosis={diag}
                        onDiagnose={() => diagnose(probe)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Probe row ──
function ProbeRow({
  probe, diagnosing, diagnosis, onDiagnose,
}: {
  probe: HealthProbe;
  diagnosing: boolean;
  diagnosis?: Diagnosis;
  onDiagnose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-md border px-3 py-2 ${
      probe.ok
        ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-red-500/30 bg-red-500/10"
    }`}>
      <div className="flex items-center gap-2">
        {probe.ok
          ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
          : <XCircle className="size-3.5 shrink-0 text-red-400" />}
        <span className="flex-1 font-mono text-xs text-zinc-200">{probe.name}</span>
        {probe.status && (
          <Badge variant="outline" className={`text-[9px] ${
            probe.status < 300 ? "border-emerald-500/40 text-emerald-300"
            : probe.status < 500 ? "border-amber-500/40 text-amber-300"
            : "border-red-500/40 text-red-300"
          }`}>HTTP {probe.status}</Badge>
        )}
        <span className="font-mono text-[10px] text-zinc-500">{probe.latencyMs}ms</span>
        {!probe.ok && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDiagnose}
            disabled={diagnosing}
            className="h-6 px-2 text-[10px] text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
          >
            {diagnosing ? <Loader2 className="size-3 animate-spin" /> : <Bug className="size-3" />}
            Diagnose
          </Button>
        )}
        {diagnosis && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        )}
      </div>
      {!probe.ok && probe.detail && (
        <div className="mt-1 line-clamp-1 font-mono text-[10px] text-red-300/80">{probe.detail}</div>
      )}
      <AnimatePresence>
        {expanded && diagnosis && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-t border-zinc-700/50 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[9px] uppercase ${SEVERITY_STYLE[diagnosis.severity].border} ${SEVERITY_STYLE[diagnosis.severity].bg} ${SEVERITY_STYLE[diagnosis.severity].text}`}>
                  {diagnosis.severity}
                </Badge>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Root Cause</span>
              </div>
              <p className="text-xs text-zinc-300">{diagnosis.rootCause}</p>
              {diagnosis.suggestedFixes.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Suggested Fixes</div>
                  <ul className="space-y-1">
                    {diagnosis.suggestedFixes.map((fix, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Wrench className="mt-0.5 size-3 shrink-0 text-amber-400" />
                        <div>
                          <span className="font-medium text-zinc-200">{fix.action}</span>
                          {fix.autoExecutable && (
                            <Badge variant="outline" className="ml-1 border-emerald-500/40 text-[9px] text-emerald-300">AUTO</Badge>
                          )}
                          <div className="text-zinc-400">{fix.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {diagnosis.relatedFiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Related:</span>
                  {diagnosis.relatedFiles.map((f) => (
                    <code key={f} className="rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{f}</code>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Stat tile ──
function StatTile({
  icon: Icon, label, value, color, border,
}: { icon: typeof Activity; label: string; value: string | number; color: string; border: string }) {
  return (
    <div className={`holo-card-sharp hud-corners border ${border} p-4`}>
      <div className="flex items-center justify-between">
        <Icon className={`size-4 ${color}`} />
        <span className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</span>
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AI DIAGNOSTIC CHAT TAB
// ════════════════════════════════════════════════════════════════════════════
function DiagnosticChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Suggested prompts
  const suggestions = [
    "Why is the SIEM retention cleanup failing?",
    "Diagnose API /api/incidents/auto-create errors",
    "What's wrong with the Sentinel engine mini-service?",
    "Show me the health of all DB tables",
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/ai-ops/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: newMessages.slice(-9, -1).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      const reply: ChatMessage = { role: "assistant", content: data.reply || "(empty reply)" };
      setMessages([...newMessages, reply]);
      // Detect recommended action
      const rec = /RECOMMEND_ACTION:\s*(\w+)/.exec(reply.content);
      if (rec) {
        toast({
          title: "AI suggests an action",
          description: `Self-heal recommended: ${rec[1]}`,
        });
      }
    } catch (err) {
      setMessages([...newMessages, {
        role: "assistant",
        content: `I encountered an error processing your request. ${err instanceof Error ? err.message : "unknown"}`,
      }]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <div className="holo-card-sharp hud-corners flex h-[640px] flex-col p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10">
            <Bot className="size-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">AI Diagnostic Assistant</div>
            <div className="font-mono text-[10px] text-zinc-500">Powered by ZAI · Context: codebase + health state</div>
          </div>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearChat} className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <Trash2 className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="custom-scrollbar flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <Bot className="size-8 text-cyan-400" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-200">Ask the AI Ops Agent</h3>
            <p className="mt-1 max-w-md text-sm text-zinc-400">
              The agent has access to the live codebase index, current health probes, and the SIEM/integrations state. Ask about failures, architecture, or recommended fixes.
            </p>
            <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-cyan-200"
                >
                  <Sparkles className="mb-1 size-3 text-cyan-400" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="size-3 animate-spin text-cyan-400" />
                Agent is thinking...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800/60 p-3">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
            placeholder="Ask about a failure, request a fix, or explore the codebase..."
            disabled={sending}
            className="border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-cyan-500/50"
          />
          <Button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="bg-cyan-600 text-white hover:bg-cyan-500 neon-border-cyan"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-zinc-600">
          <span>Enter to send · Shift+Enter for newline</span>
          <span>{messages.length} message(s)</span>
        </div>
      </div>
    </div>
  );
}

// ── Chat bubble ──
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${
        isUser
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-cyan-500/40 bg-cyan-500/10"
      }`}>
        {isUser
          ? <User className="size-3.5 text-emerald-400" />
          : <Bot className="size-3.5 text-cyan-400" />}
      </div>
      <div className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${
        isUser
          ? "border-emerald-500/30 bg-emerald-500/5 text-zinc-100"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-200"
      }`}>
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">{msg.content}</pre>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CODEBASE EXPLORER TAB
// ════════════════════════════════════════════════════════════════════════════
function CodebaseExplorer() {
  const { toast } = useToast();
  const [index, setIndex] = useState<CodebaseIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; content: string; lines: number } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["API Routes", "SIEM Lib"]));
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-ops/codebase`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load codebase");
      setIndex(data as CodebaseIndex);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Codebase index failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadFile = async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    setFileContent(null);
    try {
      const res = await fetch(`/api/ai-ops/codebase?file=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load file");
      setFileContent(data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load file",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const reindex = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-ops/codebase?reindex=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reindex failed");
      setIndex(data as CodebaseIndex);
      toast({ title: "Codebase reindexed", description: `${data.files?.length || 0} files scanned` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reindex failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setExpandedCats(next);
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Skeleton className="h-96 bg-zinc-900/40" />
        <Skeleton className="h-96 bg-zinc-900/40" />
      </div>
    );
  }

  if (!index) {
    return (
      <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
          <Folder className="size-7 text-violet-400" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-200">Codebase not indexed</h3>
        <Button onClick={reindex} className="mt-4 bg-violet-600 text-white hover:bg-violet-500">
          <RefreshCw className="size-4" /> Build Index
        </Button>
      </div>
    );
  }

  // Group files by category
  const grouped: Record<string, CodebaseFile[]> = {};
  for (const f of index.files) {
    const cat = categorizeFile(f.relativePath);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  }
  const filteredCategories = CATEGORY_ORDER
    .filter((c) => grouped[c] && grouped[c].length > 0)
    .filter((c) => {
      if (!search.trim()) return true;
      return grouped[c].some((f) => f.relativePath.toLowerCase().includes(search.toLowerCase()));
    });

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="holo-card-sharp hud-corners flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-zinc-500">
          <span className="flex items-center gap-1"><FileText className="size-3 text-cyan-400" /> {index.summary.totalFiles} files</span>
          <span className="flex items-center gap-1"><Hash className="size-3 text-emerald-400" /> {index.summary.totalLines.toLocaleString()} lines</span>
          <span className="flex items-center gap-1"><Network className="size-3 text-amber-400" /> {index.summary.routeCount} routes</span>
          <span className="flex items-center gap-1"><Code className="size-3 text-violet-400" /> {index.summary.componentCount} components</span>
          <span className="flex items-center gap-1"><Boxes className="size-3 text-rose-400" /> {index.summary.modelCount} models</span>
          <span className="flex items-center gap-1"><Clock className="size-3 text-sky-400" /> {timeAgo(index.summary.scannedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter files..."
              className="border-zinc-800 bg-zinc-900/60 pl-9 text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:border-violet-500/50"
            />
          </div>
          <Button onClick={reindex} variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* File tree */}
        <div className="holo-card-sharp hud-corners h-[640px] overflow-y-auto custom-scrollbar p-3">
          {filteredCategories.map((cat) => {
            const files = (grouped[cat] || [])
              .filter((f) => !search.trim() || f.relativePath.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
            if (files.length === 0) return null;
            const expanded = expandedCats.has(cat) || !!search.trim();
            return (
              <div key={cat} className="mb-1">
                <button
                  onClick={() => toggleCat(cat)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-zinc-300 hover:bg-zinc-800/40"
                >
                  {expanded ? <ChevronDown className="size-3 text-zinc-500" /> : <ChevronRight className="size-3 text-zinc-500" />}
                  <FolderOpen className="size-3.5 text-amber-400" />
                  <span className="flex-1">{cat}</span>
                  <span className="font-mono text-[9px] text-zinc-600">{files.length}</span>
                </button>
                {expanded && (
                  <div className="ml-3 border-l border-zinc-800/60 pl-1">
                    {files.map((f) => {
                      const Icon = FILE_TYPE_ICON[f.type] || FileText;
                      const color = FILE_TYPE_COLOR[f.type] || "text-zinc-500";
                      const isActive = selectedFile === f.relativePath;
                      const shortName = f.relativePath.split("/").pop() || f.relativePath;
                      return (
                        <button
                          key={f.relativePath}
                          onClick={() => loadFile(f.relativePath)}
                          className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors ${
                            isActive
                              ? "bg-violet-500/15 text-violet-200"
                              : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                          }`}
                          title={f.relativePath}
                        >
                          <Icon className={`size-3 shrink-0 ${color}`} />
                          <span className="flex-1 truncate font-mono">{shortName}</span>
                          <span className="font-mono text-[9px] text-zinc-600">{f.lines}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Source viewer */}
        <div className="holo-card-sharp hud-corners flex h-[640px] flex-col p-0">
          {!selectedFile ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
                <Eye className="size-7 text-violet-400" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-zinc-200">Select a file to view source</h3>
              <p className="mt-1 max-w-sm text-sm text-zinc-400">
                The AI Ops agent uses this index to diagnose failures by feeding source code to the LLM.
              </p>
            </div>
          ) : loadingFile ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-violet-400" />
            </div>
          ) : fileContent ? (
            <>
              <div className="flex items-center justify-between border-b border-zinc-800/60 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileCode className="size-4 shrink-0 text-violet-400" />
                  <code className="truncate font-mono text-xs text-zinc-200">{fileContent.path}</code>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500">{fileContent.lines} lines</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigator.clipboard?.writeText(fileContent.content)}
                    className="h-7 px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    title="Copy"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="custom-scrollbar flex-1 overflow-auto bg-zinc-950/80 p-3">
                <pre className="font-mono text-[11px] leading-relaxed text-zinc-300">
                  <code>{fileContent.content}</code>
                </pre>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SELF-HEAL ACTIONS TAB
// ════════════════════════════════════════════════════════════════════════════
function SelfHealActions() {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, FixResult>>({});

  const runAction = async (action: SelfHealAction) => {
    setRunning(action.id);
    try {
      const res = await fetch(`/api/ai-ops/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.id }),
      });
      const data = await res.json();
      const result = data as FixResult;
      if (!res.ok) {
        throw new Error(data.error || result.message || `Action failed (HTTP ${res.status})`);
      }
      setResults((prev) => ({ ...prev, [action.id]: result }));
      toast({
        title: result.ok ? `${action.label} succeeded` : `${action.label} completed with warnings`,
        description: result.message || `Completed in ${result.durationMs}ms`,
        variant: result.ok ? "default" : "destructive",
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "unknown error";
      setResults((prev) => ({
        ...prev,
        [action.id]: {
          action: action.id,
          ok: false,
          message: errMsg,
          durationMs: 0,
        },
      }));
      toast({
        variant: "destructive",
        title: `${action.label} failed`,
        description: errMsg,
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="holo-card-sharp hud-corners flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Wrench className="size-4 text-amber-400" /> Self-Heal Action Console
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            9 autonomous repair actions. Admin-only. Each action is idempotent and safe to retry.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
          <AlertTriangle className="size-3.5 text-amber-400" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">Admin Required</span>
        </div>
      </div>

      {/* Action grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SELF_HEAL_ACTIONS.map((action, i) => {
          const Icon = action.icon;
          const isRunning = running === action.id;
          const result = results[action.id];
          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className={`holo-card-sharp hud-corners border p-4 transition-colors ${
                result?.ok
                  ? "border-emerald-500/40"
                  : result && !result.ok
                  ? "border-red-500/40"
                  : "border-zinc-800 hover:border-amber-500/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`flex size-9 items-center justify-center rounded-md border ${action.border} ${action.bg}`}>
                  <Icon className={`size-4 ${action.color}`} />
                </div>
                {result && (
                  result.ok
                    ? <CheckCircle2 className="size-4 text-emerald-400" />
                    : <XCircle className="size-4 text-red-400" />
                )}
              </div>
              <h4 className="mt-3 text-sm font-bold text-zinc-100">{action.label}</h4>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{action.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <code className="font-mono text-[9px] text-zinc-600">{action.id}</code>
                <Button
                  size="sm"
                  onClick={() => runAction(action)}
                  disabled={isRunning}
                  className={`h-7 ${action.bg} ${action.color} ${action.border} border hover:brightness-125`}
                >
                  {isRunning ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  Run
                </Button>
              </div>
              {result && (
                <div className={`mt-2 rounded border px-2 py-1 text-[10px] ${
                  result.ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                    : "border-red-500/30 bg-red-500/5 text-red-300"
                }`}>
                  <div className="line-clamp-2">{result.message}</div>
                  {result.durationMs > 0 && (
                    <div className="mt-0.5 font-mono text-[9px] text-zinc-500">{result.durationMs}ms</div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Results log */}
      {Object.keys(results).length > 0 && (
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Terminal className="size-4 text-emerald-400" /> Action Log
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setResults({})}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Trash2 className="size-3.5" /> Clear
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
            {Object.entries(results).reverse().map(([id, r]) => {
              const action = SELF_HEAL_ACTIONS.find((a) => a.id === id);
              return (
                <div
                  key={id}
                  className={`rounded-md border px-3 py-2 text-xs ${
                    r.ok
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.ok ? <CheckCircle2 className="size-3 text-emerald-400" /> : <XCircle className="size-3 text-red-400" />}
                    <span className="font-mono text-zinc-300">{action?.label || id}</span>
                    <span className="ml-auto font-mono text-[9px] text-zinc-500">{r.durationMs}ms</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">{r.message}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
