"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, AlertCircle, CheckCircle2, Clock, RefreshCw,
  Zap, Shield, XCircle, TrendingUp, Server, Globe
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * HealthDashboard
 * ===============
 * Admin-only real-time health monitor showing:
 *   - Overall User Health Score (0-100)
 *   - Per-endpoint status (green/yellow/red) + avg response time + failure rate
 *   - Circuit breaker states (closed/open/half-open)
 *   - Schema drift warnings
 *   - Recent error boundary triggers
 *   - Server-side endpoint health checks
 *
 * Auto-refreshes every 30 seconds.
 */

interface EndpointStat {
  endpoint: string;
  calls: number;
  failures: number;
  failureRate: number;
  avgDuration: number;
  lastStatus: number;
}

interface RUMStats {
  activeSessions: number;
  totalApiCalls: number;
  totalApiFailures: number;
  totalErrors: number;
  totalSlowRenders: number;
  avgHealthScore: number;
  endpoints: EndpointStat[];
  recentErrors: Array<{ component?: string; error?: string; timestamp: number }>;
  recentSessions: Array<{ sessionId: string; url: string; healthScore: number; eventCount: number }>;
}

interface CircuitStat {
  endpoint: string;
  state: "closed" | "open" | "half-open";
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  successRate: number;
  hasCache: boolean;
}

interface SchemaInfo {
  endpoint: string;
  schema: {
    rootType: string;
    fieldCount: number;
    learnedAt: number;
    validationCount: number;
    lastDriftAt?: number;
    lastDriftDescription?: string;
  };
}

export function HealthDashboard() {
  const [rumStats, setRumStats] = useState<RUMStats | null>(null);
  const [circuitStats, setCircuitStats] = useState<CircuitStat[]>([]);
  const [schemaStats, setSchemaStats] = useState<SchemaInfo[]>([]);
  const [serverChecks, setServerChecks] = useState<Array<{ endpoint: string; status: number; duration: number; ok: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch RUM stats (server-side)
      const rumRes = await fetch("/api/rum/report", {
        headers: { Authorization: `Bearer ${localStorage.getItem("guardianx-token")}` },
      }).catch(() => null);
      if (rumRes && rumRes.ok) {
        setRumStats(await rumRes.json());
      }

      // Fetch server-side health checks
      const healthRes = await fetch("/api/health-monitor", {
        headers: { Authorization: `Bearer ${localStorage.getItem("guardianx-token")}` },
      }).catch(() => null);
      if (healthRes && healthRes.ok) {
        const data = await healthRes.json();
        setServerChecks(data.checks || []);
      }

      // Client-side circuit breaker stats (imported dynamically)
      try {
        const { circuitBreaker } = await import("@/lib/circuit-breaker");
        setCircuitStats(circuitBreaker.getAllStats());
      } catch { /* may not be loaded yet */ }

      // Client-side schema stats
      try {
        const { schemaInferrer } = await import("@/lib/schema-inference");
        const schemas = schemaInferrer.getAllSchemas();
        setSchemaStats(schemas.map((s) => ({
          endpoint: s.endpoint,
          schema: {
            rootType: s.schema.rootType,
            fieldCount: Object.keys(s.schema.fields).length,
            learnedAt: s.schema.learnedAt,
            validationCount: s.schema.validationCount,
            lastDriftAt: s.schema.lastDriftAt,
            lastDriftDescription: s.schema.lastDriftDescription,
          },
        })));
      } catch { /* may not be loaded yet */ }
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const healthScore = rumStats?.avgHealthScore ?? 100;
  const healthColor = healthScore >= 80 ? "#10b981" : healthScore >= 50 ? "#f59e0b" : "#ef4444";
  const healthGrade = healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 60 ? "C" : healthScore >= 40 ? "D" : "F";

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-50">
              <Activity className="size-6 text-emerald-400" />
              System Health Monitor
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Real-time self-healing dashboard · Last refresh: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Top KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Health Score */}
          <Card className="hud-corners relative border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">User Health</span>
              <Shield className="size-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums" style={{ color: healthColor }}>{healthScore}</span>
              <span className="text-sm text-zinc-500">/100 · {healthGrade}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${healthScore}%`, backgroundColor: healthColor }} />
            </div>
          </Card>

          {/* Active Sessions */}
          <Card className="hud-corners relative border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Sessions</span>
              <Globe className="size-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{rumStats?.activeSessions ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-600">active users tracked</div>
          </Card>

          {/* API Calls */}
          <Card className="hud-corners relative border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">API Calls</span>
              <Zap className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{rumStats?.totalApiCalls ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-600">{rumStats?.totalApiFailures ?? 0} failures</div>
          </Card>

          {/* Errors */}
          <Card className="hud-corners relative border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Errors</span>
              <AlertCircle className="size-4 text-red-400" />
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{rumStats?.totalErrors ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-600">{rumStats?.totalSlowRenders ?? 0} slow renders</div>
          </Card>
        </div>

        {/* Server Health Checks */}
        <Card className="hud-corners mb-6 border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Server className="size-4 text-emerald-400" />
            Server Health Checks
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {serverChecks.map((check) => (
              <div
                key={check.endpoint}
                className={`flex items-center justify-between rounded-lg border p-2 ${
                  check.ok
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <span className="truncate font-mono text-[10px] text-zinc-400">{check.endpoint}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-600">{check.duration}ms</span>
                  {check.ok ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-red-400" />}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Endpoint Stats (from RUM) */}
        <Card className="hud-corners mb-6 border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <TrendingUp className="size-4 text-cyan-400" />
            API Endpoint Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 pr-4">Endpoint</th>
                  <th className="pb-2 pr-4">Calls</th>
                  <th className="pb-2 pr-4">Failures</th>
                  <th className="pb-2 pr-4">Failure Rate</th>
                  <th className="pb-2 pr-4">Avg Duration</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rumStats?.endpoints.map((ep) => (
                  <tr key={ep.endpoint} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{ep.endpoint}</td>
                    <td className="py-2 pr-4 tabular-nums text-zinc-400">{ep.calls}</td>
                    <td className="py-2 pr-4 tabular-nums text-zinc-400">{ep.failures}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-mono text-xs ${ep.failureRate > 0.1 ? "text-red-400" : ep.failureRate > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {(ep.failureRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-zinc-400">{ep.avgDuration}ms</td>
                    <td className="py-2">
                      {ep.failureRate > 0.1 ? <XCircle className="size-4 text-red-400" /> : ep.failureRate > 0 ? <AlertCircle className="size-4 text-amber-400" /> : <CheckCircle2 className="size-4 text-emerald-400" />}
                    </td>
                  </tr>
                ))}
                {(!rumStats?.endpoints || rumStats.endpoints.length === 0) && (
                  <tr><td colSpan={6} className="py-4 text-center text-zinc-600">No API calls recorded yet — browse the app to populate</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Circuit Breakers + Schema Inference */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Circuit Breakers */}
          <Card className="hud-corners border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
              <Zap className="size-4 text-amber-400" />
              Circuit Breakers
            </h2>
            <div className="space-y-1.5">
              {circuitStats.length === 0 && <p className="text-xs text-zinc-600">No circuits active</p>}
              {circuitStats.map((c) => (
                <div key={c.endpoint} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 p-2">
                  <span className="truncate font-mono text-[10px] text-zinc-400">{c.endpoint}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-600">{Math.round(c.successRate * 100)}%</span>
                    <Badge className={`text-[9px] ${
                      c.state === "closed" ? "bg-emerald-500/20 text-emerald-300" :
                      c.state === "open" ? "bg-red-500/20 text-red-300" :
                      "bg-amber-500/20 text-amber-300"
                    }`}>
                      {c.state.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Schema Inference */}
          <Card className="hud-corners border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
              <Activity className="size-4 text-violet-400" />
              Schema Inference
            </h2>
            <div className="space-y-1.5">
              {schemaStats.length === 0 && <p className="text-xs text-zinc-600">No schemas learned yet — browse the app to populate</p>}
              {schemaStats.map((s) => (
                <div key={s.endpoint} className="rounded border border-zinc-800 bg-zinc-950/40 p-2">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-mono text-[10px] text-zinc-400">{s.endpoint}</span>
                    <span className="font-mono text-[10px] text-zinc-600">{s.schema.fieldCount} fields</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-zinc-600">
                    <span>{s.schema.validationCount} validations</span>
                    {s.schema.lastDriftAt && (
                      <span className="text-red-400">⚠ drift {new Date(s.schema.lastDriftAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                  {s.schema.lastDriftDescription && (
                    <div className="mt-1 truncate font-mono text-[9px] text-red-400">{s.schema.lastDriftDescription}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent Errors */}
        {rumStats?.recentErrors && rumStats.recentErrors.length > 0 && (
          <Card className="hud-corners mt-4 border-red-500/20 bg-zinc-900/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
              <AlertCircle className="size-4 text-red-400" />
              Recent Error Boundary Triggers
            </h2>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {rumStats.recentErrors.slice(-10).reverse().map((err, i) => (
                <div key={i} className="rounded border border-red-500/20 bg-red-500/5 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-red-300">{err.component || "Unknown component"}</span>
                    <span className="font-mono text-[9px] text-zinc-600">{new Date(err.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {err.error && <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{err.error}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
