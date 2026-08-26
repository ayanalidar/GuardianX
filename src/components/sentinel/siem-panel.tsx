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
  Activity, Search, Filter, Database, Server, Network, Bug, Bird,
  AlertTriangle, ShieldAlert, ShieldCheck, Crosshair, Plus, Play,
  Loader2, RefreshCw, Clock, Hash, TrendingUp, Trash2, Zap, FileText,
  Layers, Gauge, ScanLine, Flame, ArrowRight, CheckCircle2, XCircle,
  Cpu, Globe, Fingerprint, ChevronRight, ChevronDown, Save, RotateCcw,
  HardDrive, Archive, Sparkles, Ban, Eye, Terminal, BarChart3,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type SiemSource = "audit" | "api_access" | "honeypot" | "canary" | "incident" | "finding" | "patch";
type SiemSeverity = "critical" | "high" | "medium" | "low" | "info";

interface UnifiedLogEntry {
  id: string;
  source: SiemSource;
  type: string;
  severity: SiemSeverity;
  title: string;
  description: string;
  ipAddress: string | null;
  timestamp: string;
  raw?: Record<string, unknown>;
}

interface SiemStats {
  timeRange: string;
  totals: {
    total: number;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  topIps: Array<{ ipAddress: string; count: number }>;
  recentCritical: UnifiedLogEntry[];
}

interface RuleDefinition {
  id?: string;
  name: string;
  description: string;
  conditions: Array<Record<string, unknown>>;
  timeWindowSec: number;
  minMatchCount: number;
  groupBy: string | null;
  action: "create_incident" | "add_ioc" | "forward_alert" | "log_only";
  actionConfig: Record<string, unknown>;
  isActive: boolean;
}

interface RetentionPolicy {
  hotDays: number;
  warmDays: number;
  coldDays: number;
  tables: Record<string, "hot" | "warm" | "cold" | "delete">;
  autoCleanup: boolean;
  lastCleanupAt: string | null;
}

interface RetentionStats {
  policy: RetentionPolicy;
  counts: Array<{
    source: string;
    table: string;
    total: number;
    olderThanHot: number;
    olderThanWarm: number;
    olderThanCold: number;
  }>;
  totalRecords: number;
  estimatedDeletable: number;
}

// ── Style maps ───────────────────────────────────────────────────────────────
const SEVERITY_STYLE: Record<string, { text: string; bg: string; border: string; dot: string; bar: string }> = {
  critical: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/40",    dot: "bg-red-500",    bar: "bg-red-500" },
  high:     { text: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/40",  dot: "bg-amber-500",  bar: "bg-amber-500" },
  medium:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/40", dot: "bg-yellow-500", bar: "bg-yellow-500" },
  low:      { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/40",    dot: "bg-sky-500",    bar: "bg-sky-500" },
  info:     { text: "text-zinc-400",   bg: "bg-zinc-500/10",   border: "border-zinc-500/40",   dot: "bg-zinc-500",   bar: "bg-zinc-500" },
};

const SOURCE_META: Record<SiemSource, { label: string; icon: typeof Activity; color: string }> = {
  audit:      { label: "Audit Log",     icon: FileText,     color: "text-zinc-400" },
  api_access: { label: "API Access",    icon: Activity,     color: "text-amber-400" },
  honeypot:   { label: "Honeypot",      icon: Bug,          color: "text-violet-400" },
  canary:     { label: "Canary",        icon: Bird,         color: "text-rose-400" },
  incident:   { label: "Incident",      icon: ShieldAlert,  color: "text-red-400" },
  finding:    { label: "Finding",       icon: Crosshair,    color: "text-orange-400" },
  patch:      { label: "Patch",         icon: ShieldCheck,  color: "text-emerald-400" },
};

const ACTION_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  create_incident: { text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/40" },
  add_ioc:         { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/40" },
  forward_alert:   { text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/40" },
  log_only:        { text: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/40" },
};

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
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
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

function unwrapList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
  }
  return [];
}

const ALL_SOURCES: SiemSource[] = ["audit", "api_access", "honeypot", "canary", "incident", "finding", "patch"];
const ALL_SEVERITIES: SiemSeverity[] = ["critical", "high", "medium", "low", "info"];

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export function SiemPanel() {
  const [tab, setTab] = useState<"dashboard" | "search" | "rules" | "retention">("dashboard");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
          <span className="size-1.5 rounded-full bg-cyan-500 pulse-dot" />
          siem@guardianx:~$ tail -f /var/log/unified.log
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Database className="size-5 text-cyan-400" />
          SIEM Console
          <span className="font-mono text-sm text-zinc-500">{"// Security Information & Event Management"}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Unified log search across 7 sources, correlation rules, and tiered retention with auto-cleanup.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-1.5">
        {([
          { id: "dashboard", label: "Dashboard",       icon: Gauge,        color: "cyan" },
          { id: "search",    label: "Log Search",      icon: Search,       color: "emerald" },
          { id: "rules",     label: "Correlation Rules", icon: Layers,     color: "amber" },
          { id: "retention", label: "Retention",       icon: HardDrive,    color: "violet" },
        ] as const).map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const colorClasses: Record<string, string> = {
            cyan:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 neon-border-cyan",
            emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 neon-border-emerald",
            amber:   "bg-amber-500/15 text-amber-300 border-amber-500/40 neon-border-amber",
            violet:  "bg-violet-500/15 text-violet-300 border-violet-500/40 neon-border-violet",
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
          {tab === "dashboard" && <SiemDashboard />}
          {tab === "search" && <LogSearch />}
          {tab === "rules" && <CorrelationRules />}
          {tab === "retention" && <RetentionTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ════════════════════════════════════════════════════════════════════════════
function SiemDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<SiemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<string>("24h");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/siem/stats?range=${encodeURIComponent(range)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load SIEM stats");
      setStats(data as SiemStats);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load SIEM stats",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh stats every 30s (was 15s), paused while tab is hidden.
  useVisiblePolling(load, 30_000, { immediate: false });

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

  if (!stats) {
    return (
      <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30">
          <Database className="size-7 text-cyan-400" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-200">No SIEM data available</h3>
        <p className="mt-1 max-w-sm text-sm text-zinc-400">
          The SIEM index is empty for the selected range. Try a wider time window or ingest some events.
        </p>
        <Button onClick={load} variant="outline" className="mt-4 border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15">
          <RefreshCw className="size-4" /> Reload
        </Button>
      </div>
    );
  }

  const totalEvents = stats.totals.total || 0;
  const critical = stats.totals.bySeverity?.critical || 0;
  const sourceIpCount = stats.topIps.length;
  const high = stats.totals.bySeverity?.high || 0;

  const maxSeverity = Math.max(1, ...Object.values(stats.totals.bySeverity || {}));
  const severityBars = ALL_SEVERITIES.map((sev) => ({
    sev,
    count: stats.totals.bySeverity?.[sev] || 0,
    style: SEVERITY_STYLE[sev],
  }));

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["1h", "24h", "7d", "30d"].map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setLoading(true); }}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                range === r
                  ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300 neon-border-cyan"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              {r}
            </button>
          )))}
        </div>
        <Button onClick={load} variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Database}      label="Total Events"  value={totalEvents.toLocaleString()} color="text-cyan-400"    border="border-cyan-500/20" />
        <StatTile icon={Flame}         label="Critical"      value={critical.toLocaleString()}    color="text-red-400"     border="border-red-500/20" />
        <StatTile icon={AlertTriangle} label="High Severity" value={high.toLocaleString()}        color="text-amber-400"   border="border-amber-500/20" />
        <StatTile icon={Network}       label="Source IPs"    value={sourceIpCount.toLocaleString()} color="text-emerald-400" border="border-emerald-500/20" />
      </div>

      {/* Severity bar chart */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <BarChart3 className="size-4 text-cyan-400" /> Severity Distribution
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{stats.timeRange}</span>
        </div>
        <div className="space-y-2.5">
          {severityBars.map(({ sev, count, style }) => (
            <div key={sev} className="flex items-center gap-3">
              <div className="flex w-20 items-center gap-1.5">
                <span className={`size-2 rounded-full ${style.dot}`} />
                <span className={`text-xs font-semibold uppercase ${style.text}`}>{sev}</span>
              </div>
              <div className="relative h-6 flex-1 overflow-hidden rounded border border-zinc-800 bg-zinc-900/60">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(count / maxSeverity) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={`h-full ${style.bar} opacity-80`}
                />
                <span className="absolute inset-y-0 left-2 flex items-center font-mono text-xs font-bold text-zinc-100">
                  {count.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7 log source cards */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Layers className="size-4 text-cyan-400" /> Log Sources
          <span className="font-mono text-[10px] text-zinc-500">(7 unified sources)</span>
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {ALL_SOURCES.map((src) => {
            const meta = SOURCE_META[src];
            const count = stats.totals.bySource?.[src] || 0;
            const Icon = meta.icon;
            return (
              <motion.div
                key={src}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -2 }}
                className="holo-card-sharp hud-corners border border-zinc-800 p-3 hover:border-cyan-500/40"
              >
                <Icon className={`size-4 ${meta.color}`} />
                <div className="mt-2 font-mono text-lg font-bold text-zinc-100">{count.toLocaleString()}</div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">{meta.label}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Top IPs + Recent Critical */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top IPs */}
        <div className="holo-card-sharp hud-corners p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Network className="size-4 text-emerald-400" /> Top Source IPs
          </h3>
          {stats.topIps.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No IP-tagged events in window</div>
          ) : (
            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
              {stats.topIps.slice(0, 12).map((ip, i) => {
                const max = stats.topIps[0]?.count || 1;
                return (
                  <div key={ip.ipAddress} className="flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                    <span className="flex size-6 items-center justify-center rounded font-mono text-[10px] font-bold text-zinc-500">#{i + 1}</span>
                    <Globe className="size-3.5 text-zinc-500" />
                    <span className="flex-1 font-mono text-xs text-zinc-200">{ip.ipAddress}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full bg-emerald-500/80" style={{ width: `${(ip.count / max) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono text-xs font-bold text-emerald-300">{ip.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent critical events */}
        <div className="holo-card-sharp hud-corners p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Flame className="size-4 text-red-400" /> Recent Critical Events
          </h3>
          {stats.recentCritical.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No critical events in window</div>
          ) : (
            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
              {stats.recentCritical.slice(0, 10).map((ev) => {
                const sev = SEVERITY_STYLE[ev.severity] || SEVERITY_STYLE.info;
                const meta = SOURCE_META[ev.source] || SOURCE_META.audit;
                const Icon = meta.icon;
                return (
                  <div key={ev.id} className={`rounded-md border ${sev.border} ${sev.bg} px-3 py-2`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`size-3.5 ${meta.color}`} />
                      <span className="line-clamp-1 flex-1 text-xs font-semibold text-zinc-100">{ev.title}</span>
                      <span className="font-mono text-[9px] text-zinc-500">{timeAgo(ev.timestamp)}</span>
                    </div>
                    {ev.ipAddress && (
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                        <Network className="size-3" /> {ev.ipAddress}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat tile ──
function StatTile({
  icon: Icon, label, value, color, border,
}: { icon: typeof Database; label: string; value: string | number; color: string; border: string }) {
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
// LOG SEARCH TAB
// ════════════════════════════════════════════════════════════════════════════
function LogSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Set<SiemSource>>(new Set());
  const [severities, setSeverities] = useState<Set<SiemSeverity>>(new Set());
  const [ipFilter, setIpFilter] = useState("");
  const [range, setRange] = useState("24h");
  const [results, setResults] = useState<UnifiedLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSource = (s: SiemSource) => {
    const next = new Set(sources);
    if (next.has(s)) next.delete(s); else next.add(s);
    setSources(next);
  };

  const toggleSeverity = (s: SiemSeverity) => {
    const next = new Set(severities);
    if (next.has(s)) next.delete(s); else next.add(s);
    setSeverities(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const runSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (sources.size > 0) params.set("sources", Array.from(sources).join(","));
      if (severities.size > 0) params.set("severities", Array.from(severities).join(","));
      if (ipFilter.trim()) params.set("ip", ipFilter.trim());
      if (range) params.set("range", range);
      params.set("limit", "200");

      const res = await fetch(`/api/siem/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setResults([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  }, [query, sources, severities, ipFilter, range, toast]);

  const resetFilters = () => {
    setQuery("");
    setSources(new Set());
    setSeverities(new Set());
    setIpFilter("");
    setRange("24h");
    setResults([]);
    setHasSearched(false);
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Unified Log Search</h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">7 sources</span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search title or description..."
              className="border-zinc-800 bg-zinc-900/60 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-cyan-500/50"
            />
          </div>
          <Button onClick={runSearch} disabled={searching} className="bg-cyan-600 text-white hover:bg-cyan-500 neon-border-cyan">
            {searching ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
            Search
          </Button>
          <Button onClick={resetFilters} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sources</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SOURCES.map((s) => {
                const meta = SOURCE_META[s];
                const active = sources.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSource(s)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                      active
                        ? `${meta.color} border-current bg-current/10`
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:bg-zinc-800/50"
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Severity</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SEVERITIES.map((s) => {
                const style = SEVERITY_STYLE[s];
                const active = severities.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSeverity(s)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase transition-all ${
                      active
                        ? `${style.border} ${style.bg} ${style.text}`
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:bg-zinc-800/50"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">IP Address</Label>
            <Input
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
              placeholder="e.g. 192.168.1.10"
              className="border-zinc-800 bg-zinc-900/60 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:border-cyan-500/50"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Time Range</Label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 focus:border-cyan-500/50 focus:outline-none"
            >
              <option value="1h">Last 1 hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {!hasSearched ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30">
            <Search className="size-7 text-cyan-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">Run a search to begin</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Combine free-text, sources, severity, IP, and time range to slice across all 7 SIEM log streams.
          </p>
        </div>
      ) : searching ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 bg-zinc-900/40" />)}
        </div>
      ) : results.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-zinc-500/10 ring-1 ring-zinc-500/30">
            <Ban className="size-7 text-zinc-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No matching events</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">Try widening the time range or removing filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-400">
              <span className="font-bold text-cyan-300">{total.toLocaleString()}</span> events matched
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">showing first {results.length}</span>
          </div>

          {/* Timeline */}
          <div className="holo-card-sharp hud-corners p-4">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar space-y-1.5">
              {results.map((ev) => {
                const sev = SEVERITY_STYLE[ev.severity] || SEVERITY_STYLE.info;
                const meta = SOURCE_META[ev.source] || SOURCE_META.audit;
                const Icon = meta.icon;
                const isExpanded = expanded.has(ev.id);
                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`rounded-md border ${sev.border} ${sev.bg} px-3 py-2 transition-colors hover:bg-zinc-800/40`}
                  >
                    <button
                      onClick={() => toggleExpand(ev.id)}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className={`size-2 shrink-0 rounded-full ${sev.dot}`} />
                      <Icon className={`size-3.5 shrink-0 ${meta.color}`} />
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatTimestamp(ev.timestamp)}</span>
                      <span className="line-clamp-1 flex-1 text-xs font-medium text-zinc-100">{ev.title}</span>
                      {ev.ipAddress && (
                        <span className="hidden items-center gap-1 font-mono text-[10px] text-zinc-400 sm:flex">
                          <Network className="size-3" /> {ev.ipAddress}
                        </span>
                      )}
                      <Badge variant="outline" className={`shrink-0 border-current text-[9px] uppercase ${sev.text}`}>{ev.severity}</Badge>
                      {isExpanded ? <ChevronDown className="size-3.5 shrink-0 text-zinc-500" /> : <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 border-t border-zinc-700/50 pt-2">
                            <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                              <div>
                                <span className="text-zinc-500">Source: </span>
                                <span className={`font-mono ${meta.color}`}>{ev.source}</span>
                              </div>
                              <div>
                                <span className="text-zinc-500">Type: </span>
                                <span className="font-mono text-zinc-300">{ev.type}</span>
                              </div>
                              {ev.ipAddress && (
                                <div>
                                  <span className="text-zinc-500">IP: </span>
                                  <span className="font-mono text-zinc-300">{ev.ipAddress}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-zinc-500">ID: </span>
                                <span className="font-mono text-zinc-500">{ev.id.slice(0, 12)}</span>
                              </div>
                            </div>
                            {ev.description && (
                              <p className="mt-2 text-xs text-zinc-300">{ev.description}</p>
                            )}
                            {ev.raw && Object.keys(ev.raw).length > 0 && (
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-950/80 p-2 font-mono text-[10px] text-zinc-400">
                                {JSON.stringify(ev.raw, null, 2)}
                              </pre>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CORRELATION RULES TAB
// ════════════════════════════════════════════════════════════════════════════
function CorrelationRules() {
  const { toast } = useToast();
  const [rules, setRules] = useState<RuleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/siem/rules`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load rules");
      setRules(unwrapList<RuleDefinition>(data, "rules"));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load rules",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEvaluateAll = async () => {
    setEvaluating(true);
    try {
      const res = await fetch(`/api/siem/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evaluate_all" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Evaluate-all failed",
          description: data.error || `HTTP ${res.status}: the rules endpoint did not accept the evaluate_all action.`,
        });
      } else {
        toast({
          title: "Correlations evaluated",
          description: data.message || "All active rules evaluated. New incidents/IOCs may have been created.",
        });
        load();
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Evaluate-all failed",
        description: err instanceof Error ? err.message : "network error",
      });
    } finally {
      setEvaluating(false);
    }
  };

  const toggleActive = async (rule: RuleDefinition) => {
    if (!rule.id) return;
    try {
      const res = await fetch(`/api/siem/rules?id=${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");
      toast({
        title: `Rule ${!rule.isActive ? "enabled" : "disabled"}`,
        description: rule.name,
      });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Toggle failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const deleteRule = async (rule: RuleDefinition) => {
    if (!rule.id) return;
    try {
      const res = await fetch(`/api/siem/rules?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast({ title: "Rule deleted", description: rule.name });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="size-4 text-amber-400" /> Correlation Rules
            <span className="font-mono text-[10px] text-zinc-500">{rules.length} active</span>
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Detect patterns across the 7 SIEM sources. Actions: create_incident, add_ioc, forward_alert, log_only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleEvaluateAll}
            disabled={evaluating}
            variant="outline"
            className="border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
          >
            {evaluating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            <span className="hidden sm:inline">Evaluate All</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-amber-600 text-white hover:bg-amber-500 neon-border-amber">
            <Plus className="size-4" /> Create Rule
          </Button>
        </div>
      </div>

      {/* Rule list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 bg-zinc-900/40" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/30">
            <Layers className="size-7 text-amber-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No correlation rules</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Create a rule to detect patterns like brute force, honeypot+canary chains, or unpatched critical findings.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4 bg-amber-600 text-white hover:bg-amber-500">
            <Plus className="size-4" /> Create First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rules.map((rule, i) => {
            const actionStyle = ACTION_STYLE[rule.action] || ACTION_STYLE.log_only;
            return (
              <motion.div
                key={rule.id || i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                className={`holo-card-sharp hud-corners border p-4 ${
                  rule.isActive ? "border-amber-500/30" : "border-zinc-800 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-100">{rule.name}</h4>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${actionStyle.border} ${actionStyle.bg} ${actionStyle.text}`}>
                        {rule.action}
                      </span>
                      {rule.isActive ? (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                          <CheckCircle2 className="size-2.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-700/20 px-2 py-0.5 text-[9px] font-bold uppercase text-zinc-400">
                          <Ban className="size-2.5" /> Paused
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{rule.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Filter className="size-3" /> {rule.conditions?.length || 0} condition(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {rule.timeWindowSec}s window
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="size-3" /> min {rule.minMatchCount} matches
                      </span>
                      {rule.groupBy && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="size-3" /> group by {rule.groupBy}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive(rule)}
                      className="h-7 px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      title={rule.isActive ? "Disable" : "Enable"}
                    >
                      {rule.isActive ? <Ban className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-emerald-400" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRule(rule)}
                      className="h-7 px-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateRuleModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Create Rule Modal ──
function CreateRuleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    action: "create_incident" as RuleDefinition["action"],
    timeWindowSec: 300,
    minMatchCount: 3,
    groupBy: "ipAddress",
    source: "api_access",
    severity: "high",
    isActive: true,
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const conditions = [
        { source: form.source, severity: form.severity },
      ];
      const body: RuleDefinition = {
        name: form.name.trim(),
        description: form.description,
        conditions,
        timeWindowSec: Number(form.timeWindowSec) || 300,
        minMatchCount: Number(form.minMatchCount) || 1,
        groupBy: form.groupBy || null,
        action: form.action,
        actionConfig: {},
        isActive: form.isActive,
      };
      const res = await fetch(`/api/siem/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create rule");
      toast({ title: "Rule created", description: form.name });
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create rule",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners w-full max-w-lg rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <Layers className="size-5 text-amber-400" />
          <h2 className="text-lg font-bold text-zinc-50">Create Correlation Rule</h2>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Rule Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Brute force - 5 failed logins in 5 min"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-amber-500/50"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this rule detects and why it matters..."
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Source</Label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                {ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Severity</Label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                {ALL_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Time Window (sec)</Label>
              <Input
                type="number"
                value={form.timeWindowSec}
                onChange={(e) => setForm({ ...form, timeWindowSec: Number(e.target.value) })}
                className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200 focus-visible:border-amber-500/50"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Min Match Count</Label>
              <Input
                type="number"
                value={form.minMatchCount}
                onChange={(e) => setForm({ ...form, minMatchCount: Number(e.target.value) })}
                className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200 focus-visible:border-amber-500/50"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Group By</Label>
              <select
                value={form.groupBy}
                onChange={(e) => setForm({ ...form, groupBy: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="ipAddress">IP Address</option>
                <option value="source">Source</option>
                <option value="type">Event Type</option>
                <option value="">None</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Action</Label>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as RuleDefinition["action"] })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="create_incident">Create Incident</option>
                <option value="add_ioc">Add IOC</option>
                <option value="forward_alert">Forward Alert</option>
                <option value="log_only">Log Only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name.trim()} className="bg-amber-600 text-white hover:bg-amber-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Rule
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RETENTION TAB
// ════════════════════════════════════════════════════════════════════════════
function RetentionTab() {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [stats, setStats] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [draft, setDraft] = useState<RetentionPolicy | null>(null);

  const load = useCallback(async () => {
    try {
      const [polRes, statRes] = await Promise.all([
        fetch(`/api/siem/retention`),
        fetch(`/api/siem/retention?stats=true`),
      ]);
      const pol = await polRes.json();
      const st = await statRes.json();
      if (!polRes.ok) throw new Error(pol.error || "Failed to load policy");
      setPolicy(pol as RetentionPolicy);
      if (statRes.ok) setStats(st as RetentionStats);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load retention policy",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    if (!policy) return;
    setDraft({ ...policy });
    setEditing(true);
  };

  const savePolicy = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/siem/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotDays: draft.hotDays,
          warmDays: draft.warmDays,
          coldDays: draft.coldDays,
          autoCleanup: draft.autoCleanup,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast({ title: "Retention policy updated" });
      setEditing(false);
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const runCleanup = async () => {
    setRunningCleanup(true);
    try {
      const res = await fetch(`/api/siem/retention?action=cleanup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");
      toast({
        title: "Cleanup complete",
        description: data.message || `${data.deleted || 0} stale records removed`,
      });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Cleanup failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setRunningCleanup(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 bg-zinc-900/40" />
        <Skeleton className="h-64 bg-zinc-900/40" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
          <HardDrive className="size-7 text-violet-400" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-200">No retention policy</h3>
      </div>
    );
  }

  const tiers = [
    { name: "Hot",  days: policy.hotDays,  color: "text-red-400",     border: "border-red-500/40",     bg: "bg-red-500/10",     icon: Flame },
    { name: "Warm", days: policy.warmDays, color: "text-amber-400",   border: "border-amber-500/40",   bg: "bg-amber-500/10",   icon: Archive },
    { name: "Cold", days: policy.coldDays, color: "text-sky-400",     border: "border-sky-500/40",     bg: "bg-sky-500/10",     icon: HardDrive },
  ];

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <HardDrive className="size-4 text-violet-400" /> Tiered Retention Policy
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Three-tier lifecycle: hot for fast queries, warm for analysis, cold for compliance archives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={runCleanup}
            disabled={runningCleanup}
            variant="outline"
            className="border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
          >
            {runningCleanup ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            <span className="hidden sm:inline">Run Cleanup</span>
          </Button>
          {editing ? (
            <>
              <Button onClick={savePolicy} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-500">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={startEdit} className="bg-violet-600 text-white hover:bg-violet-500 neon-border-violet">
              <Sparkles className="size-4" /> Edit Policy
            </Button>
          )}
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const value = editing && draft ? draft[`${tier.name.toLowerCase()}Days` as "hotDays" | "warmDays" | "coldDays"] : tier.days;
          return (
            <div key={tier.name} className={`holo-card-sharp hud-corners border ${tier.border} p-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${tier.color}`} />
                  <span className={`text-sm font-bold uppercase tracking-wider ${tier.color}`}>{tier.name}</span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Tier</span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                {editing && draft ? (
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setDraft({
                      ...draft,
                      [`${tier.name.toLowerCase()}Days`]: Number(e.target.value),
                    } as RetentionPolicy)}
                    className="w-24 border-zinc-700 bg-zinc-900/60 font-mono text-2xl font-bold text-zinc-100 focus-visible:border-violet-500/50"
                  />
                ) : (
                  <span className={`font-mono text-3xl font-bold ${tier.color}`}>{value}</span>
                )}
                <span className="text-xs text-zinc-500">days</span>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">
                {tier.name === "Hot"  && "Fast indexed search. Recent high-signal events."}
                {tier.name === "Warm" && "Slower queries. Investigative lookback window."}
                {tier.name === "Cold" && "Archive tier. Compliance and audit retention."}
              </p>
            </div>
          );
        })}
      </div>

      {/* Auto-cleanup toggle */}
      <div className="holo-card-sharp hud-corners flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-9 items-center justify-center rounded-md border ${
            policy.autoCleanup ? "border-emerald-500/40 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800/40"
          }`}>
            {policy.autoCleanup ? <CheckCircle2 className="size-4 text-emerald-400" /> : <Ban className="size-4 text-zinc-500" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Auto-cleanup</div>
            <div className="text-[10px] text-zinc-500">Automatically delete records older than the cold tier every 24h</div>
          </div>
        </div>
        {editing && draft && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft({ ...draft, autoCleanup: !draft.autoCleanup })}
            className={draft.autoCleanup
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
              : "border-zinc-700 bg-zinc-900 text-zinc-400"}
          >
            {draft.autoCleanup ? "Enabled" : "Disabled"}
          </Button>
        )}
        {!editing && (
          <Badge variant="outline" className={policy.autoCleanup ? "border-emerald-500/40 text-emerald-300" : "border-zinc-700 text-zinc-500"}>
            {policy.autoCleanup ? "ENABLED" : "DISABLED"}
          </Badge>
        )}
      </div>

      {/* Per-source table assignment */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Database className="size-4 text-cyan-400" /> Source to Tier Mapping
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ALL_SOURCES.map((src) => {
            const meta = SOURCE_META[src];
            const tier = policy.tables?.[src] || "warm";
            const Icon = meta.icon;
            const tierStyle = SEVERITY_STYLE[
              tier === "hot" ? "critical" : tier === "warm" ? "medium" : tier === "cold" ? "low" : "info"
            ];
            return (
              <div key={src} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                <Icon className={`size-3.5 ${meta.color}`} />
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">{meta.label}</div>
                <div className={`mt-1 rounded-full border px-2 py-0.5 text-center text-[9px] font-bold uppercase ${tierStyle.border} ${tierStyle.bg} ${tierStyle.text}`}>
                  {tier}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Gauge className="size-4 text-emerald-400" /> Retention Stats
            </h3>
            <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
              <span>Total: <span className="font-bold text-zinc-300">{stats.totalRecords.toLocaleString()}</span></span>
              <span>Deletable: <span className="font-bold text-red-400">{stats.estimatedDeletable.toLocaleString()}</span></span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Table</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">&gt; Hot</th>
                  <th className="py-2 pr-3 text-right">&gt; Warm</th>
                  <th className="py-2 pr-3 text-right">&gt; Cold</th>
                </tr>
              </thead>
              <tbody>
                {stats.counts.map((c) => {
                  const meta = SOURCE_META[c.source as SiemSource] || SOURCE_META.audit;
                  return (
                    <tr key={c.source} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-2 pr-3">
                        <span className={`flex items-center gap-1.5 font-medium ${meta.color}`}>
                          <meta.icon className="size-3" /> {meta.label}
                      </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-zinc-400">{c.table}</td>
                      <td className="py-2 pr-3 text-right font-mono text-zinc-200">{c.total.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right font-mono text-amber-400">{c.olderThanHot.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right font-mono text-yellow-400">{c.olderThanWarm.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right font-mono text-red-400">{c.olderThanCold.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {policy.lastCleanupAt && (
            <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
              <Clock className="size-3" /> Last cleanup: {formatTimestamp(policy.lastCleanupAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
