"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Clock,
  Mail,
  Bell,
  History,
  Server,
  Database,
  Globe,
  Cpu,
} from "lucide-react";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

type Status = "operational" | "degraded" | "outage";

interface ComponentHealth {
  name: string;
  status: Status;
  latencyMs: number;
  uptime90d: string;
  detail?: string;
}

interface HealthResponse {
  ok: boolean;
  status: Status;
  scannedAt: string;
  components: ComponentHealth[];
}

// ── Mock 90-day uptime history ──────────────────────────────────────────────
// Deterministic pattern: mostly green with a couple of amber days around
// days 47 and 72, no outages. Generated once and memoized.
type DayStatus = "ok" | "degraded" | "outage";

interface UptimeDay {
  date: Date;
  status: DayStatus;
  uptime: number; // percentage
}

function generateUptimeHistory(): UptimeDay[] {
  const days: UptimeDay[] = [];
  const today = new Date();
  // Deterministic amber days so the chart doesn't flicker on re-render
  const amberDays = new Set([47, 72]);
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const status: DayStatus = amberDays.has(i) ? "degraded" : "ok";
    const uptime = status === "ok" ? 100 : status === "degraded" ? 99.4 : 98.2;
    days.push({ date, status, uptime });
  }
  return days;
}

const STATUS_META: Record<
  Status,
  { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }
> = {
  operational: {
    label: "All Systems Operational",
    color: "text-emerald-600 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded Performance",
    color: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    icon: AlertTriangle,
  },
  outage: {
    label: "Major Outage",
    color: "text-red-600 dark:text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    icon: XCircle,
  },
};

const COMPONENT_ICONS: Record<string, typeof Server> = {
  "Web App": Globe,
  "Sentinel Engine": Cpu,
  "Recon Tools": Activity,
  Database: Database,
  default: Server,
};

function formatTimeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    return `${Math.round(diff / 3_600_000)}h ago`;
  } catch {
    return "—";
  }
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [email, setEmail] = useState("");

  const uptimeHistory = useMemo(() => generateUptimeHistory(), []);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/health", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        // Non-200 means the web app itself is degraded
        setHealth({
          ok: false,
          status: "degraded",
          scannedAt: new Date().toISOString(),
          components: [],
        });
        setError(`Health endpoint returned HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health");
      setHealth({
        ok: false,
        status: "outage",
        scannedAt: new Date().toISOString(),
        components: [],
      });
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 60 seconds
    const id = setInterval(fetchHealth, 60_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const overall: Status = health?.status ?? "operational";
  const meta = STATUS_META[overall];
  const OverallIcon = meta.icon;

  // 90-day uptime average
  const avgUptime = useMemo(() => {
    if (uptimeHistory.length === 0) return 0;
    const total = uptimeHistory.reduce((sum, d) => sum + d.uptime, 0);
    return total / uptimeHistory.length;
  }, [uptimeHistory]);

  const subscribeHref = useMemo(() => {
    const subject = encodeURIComponent("Subscribe to GuardianX status updates");
    const body = encodeURIComponent(
      `Please subscribe me to GuardianX status updates.\n\nEmail: ${email || "[your email]"}\n\n(Reply with this email to confirm.)`,
    );
    return `mailto:status@guardianx.in?subject=${subject}&body=${body}`;
  }, [email]);

  return (
    <div className="relative min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Ambient glow (dark mode only) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 hidden dark:block"
      >
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-600/8 blur-3xl" />
      </div>

      <div className="relative z-10">
        <SiteHeader />

        <main className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
          >
            <div>
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                <Activity className="size-3" />
                GuardianX Status
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                System Status
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
              {lastUpdated && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Updated {formatTimeAgo(lastUpdated.toISOString())}
                </span>
              )}
              <button
                onClick={fetchHealth}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium transition-colors hover:border-emerald-500/40 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-800 dark:hover:text-emerald-400"
              >
                <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </motion.div>

          {/* Overall status banner */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`mb-8 flex items-center gap-4 rounded-2xl border ${meta.border} ${meta.bg} p-6`}
          >
            <div className={`flex size-14 items-center justify-center rounded-full ${meta.bg} ${meta.color}`}>
              <OverallIcon className="size-8" />
            </div>
            <div className="flex-1">
              <div className={`text-xl font-bold ${meta.color}`}>
                {loading
                  ? "Checking system status..."
                  : meta.label}
              </div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {loading
                  ? "Probing components..."
                  : error
                    ? `Unable to reach the health endpoint: ${error}`
                    : `Last scanned ${health?.scannedAt ? formatTimeAgo(health.scannedAt) : "—"} · auto-refreshes every 60s`}
              </div>
            </div>
            {!loading && (
              <div className="hidden text-right sm:block">
                <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-300">
                  {avgUptime.toFixed(2)}%
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500">
                  90-day uptime
                </div>
              </div>
            )}
          </motion.div>

          {/* Component status table */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-10"
          >
            <div className="mb-3 flex items-center gap-2">
              <Server className="size-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Components
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                    <th className="px-4 py-3 font-medium">Component</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Uptime (90d)</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Response Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
                        <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /></td>
                        <td className="hidden px-4 py-3 sm:table-cell"><div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /></td>
                        <td className="hidden px-4 py-3 sm:table-cell"><div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /></td>
                      </tr>
                    ))
                  ) : health?.components && health.components.length > 0 ? (
                    health.components.map((c) => {
                      const Icon = COMPONENT_ICONS[c.name] ?? COMPONENT_ICONS.default;
                      const s = STATUS_META[c.status];
                      const StatusIcon = s.icon;
                      return (
                        <tr
                          key={c.name}
                          className="border-b border-zinc-200 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Icon className="size-4 text-zinc-400 dark:text-zinc-500" />
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                            </div>
                            {c.detail && (
                              <div className="mt-0.5 ml-6 text-[10px] text-zinc-500 dark:text-zinc-500">{c.detail}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
                              <StatusIcon className="size-3.5" />
                              <span className="capitalize">{c.status}</span>
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 font-mono text-xs text-zinc-700 sm:table-cell dark:text-zinc-300">
                            {c.uptime90d}
                          </td>
                          <td className="hidden px-4 py-3 font-mono text-xs text-zinc-700 sm:table-cell dark:text-zinc-300">
                            {c.latencyMs > 0 ? `${c.latencyMs}ms` : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
                        No component data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>

          {/* 90-day uptime bar chart */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-10"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="size-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Uptime — Last 90 Days
                </h2>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-emerald-500" /> Operational
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-amber-500" /> Degraded
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-red-500" /> Outage
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex h-20 items-end gap-[2px]">
                {uptimeHistory.map((day, i) => {
                  const color =
                    day.status === "ok"
                      ? "bg-emerald-500 hover:bg-emerald-400"
                      : day.status === "degraded"
                        ? "bg-amber-500 hover:bg-amber-400"
                        : "bg-red-500 hover:bg-red-400";
                  const height =
                    day.status === "ok" ? "100%" : day.status === "degraded" ? "70%" : "30%";
                  return (
                    <div
                      key={i}
                      className={`group relative flex-1 ${color} cursor-help rounded-sm transition-colors`}
                      style={{ height }}
                      title={`${day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${day.status} (${day.uptime}% uptime)`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-500 dark:text-zinc-500">
                <span>90 days ago</span>
                <span>Today</span>
              </div>
            </div>
          </motion.section>

          {/* Recent incidents */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-10"
          >
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Recent Incidents
              </h2>
            </div>
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-800">
              <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No incidents in the last 90 days
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                When incidents occur, they&apos;ll be logged here with title, severity,
                affected components, start/end time, and a post-mortem summary.
              </p>
              {/* Incident template (commented to show the structure that will be used) */}
              <div className="mx-auto mt-6 hidden max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">[Template] Database connection pool saturation</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">Degraded</span>
                </div>
                <div className="text-zinc-500 dark:text-zinc-500">
                  Feb 12, 2026 · 14:32 — 14:47 IST · Affected: Database, Web App · Resolved
                </div>
                <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">
                  Connection pool exhausted due to a runaway background job. Pool size
                  increased and job rate-limited. No data loss.
                </p>
              </div>
            </div>
          </motion.section>

          {/* Subscribe to status updates */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-6 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-zinc-50 to-cyan-500/5 p-6 dark:via-zinc-900/40"
          >
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                  <Bell className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                    Subscribe to status updates
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    Get an email when we have incidents or scheduled maintenance.
                  </p>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  window.location.href = subscribeHref;
                }}
                className="flex w-full max-w-md items-center gap-2"
              >
                <div className="relative flex-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </motion.section>

          {/* Footer note */}
          <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-500">
            Status data is fetched live from{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-emerald-700 dark:bg-zinc-900 dark:text-emerald-300">
              /api/health
            </code>{" "}
            every 60 seconds. 90-day uptime history is mock data for demonstration.
          </p>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
