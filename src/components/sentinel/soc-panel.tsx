"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type DarkWebStatus,
  type SecurityKpis,
  type AttackSurfaceStatus,
} from "@/lib/sentinel/api";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Gauge,
  Globe,
  Loader2,
  Radar,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldX,
  Skull,
  TrendingUp,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";

export function SocPanel() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          guardianx@soc:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <Radar className="size-5 text-cyan-400" />
          SOC & DevSecOps Center
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Dark web monitoring, security KPIs, and attack surface management —
          continuous visibility into your security posture.
        </p>
      </div>

      {/* KPI Dashboard */}
      <KpiDashboard />

      {/* Dark Web + Attack Surface grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DarkWebMonitor />
        <AttackSurfaceManager />
      </div>
    </div>
  );
}

// ── KPI Dashboard ───────────────────────────────────────────────────────────
function KpiDashboard() {
  const [kpis, setKpis] = useState<SecurityKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const k = await sentinelApi.securityKpis();
      setKpis(k);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Skeleton className="h-48 bg-emerald-500/10" />;
  if (!kpis) return null;

  const kpiCards = [
    { label: "MTTD", value: kpis.mttd_seconds ? `${kpis.mttd_seconds}s` : "—", desc: "Mean time to detect", icon: Clock, color: "text-sky-400" },
    { label: "MTTR", value: kpis.mttr_hours !== null ? `${kpis.mttr_hours}h` : "—", desc: "Mean time to resolve", icon: TrendingUp, color: "text-emerald-400" },
    { label: "Vuln Density", value: `${kpis.vuln_density_per_kloc}/KLOC`, desc: "Vulns per 1000 lines", icon: Activity, color: "text-amber-400" },
    { label: "Sandbox Pass", value: `${kpis.sandbox_pass_rate}%`, desc: "Test pass rate", icon: ShieldCheck, color: "text-emerald-400" },
    { label: "Adv. Win Rate", value: `${kpis.adversarial_win_rate}%`, desc: "Defender wins", icon: Shield, color: "text-cyan-400" },
    { label: "Resolution", value: `${kpis.resolution_rate}%`, desc: "Vulns resolved", icon: CheckCircle2, color: "text-emerald-400" },
  ];

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
          Security KPI Dashboard
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xl font-bold" style={{ color: kpis.kpi_score >= 80 ? "#10b981" : kpis.kpi_score >= 50 ? "#f59e0b" : "#ef4444" }}>
            {kpis.kpi_score}
          </span>
          <span className="font-mono text-[9px] uppercase text-zinc-500">KPI Score</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center"
          >
            <kpi.icon className={`mx-auto size-4 ${kpi.color}`} />
            <div className={`mt-1 font-mono text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">{kpi.label}</div>
            <div className="text-[8px] text-zinc-600">{kpi.desc}</div>
          </motion.div>
        ))}
      </div>

      {/* 7-day trend bar chart */}
      <div className="mt-4">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">7-Day Trend</div>
        <div className="flex items-end gap-1.5" style={{ height: 60 }}>
          {kpis.trend.map((d, i) => {
            const maxVal = Math.max(...kpis.trend.map((t) => Math.max(t.vulns, t.resolved)), 1);
            const vulnH = (d.vulns / maxVal) * 100;
            const resH = (d.resolved / maxVal) * 100;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end gap-0.5">
                  <div className="flex-1 rounded-t bg-red-500/60" style={{ height: `${vulnH}%` }} title={`${d.vulns} vulns`} />
                  <div className="flex-1 rounded-t bg-emerald-500/60" style={{ height: `${resH}%` }} title={`${d.resolved} resolved`} />
                </div>
                <span className="font-mono text-[8px] text-zinc-600">{d.day}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-center gap-4 text-[9px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-500/60" /> Vulns Found</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500/60" /> Resolved</span>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(kpis.severity_breakdown).map(([sev, count]) => (
          <span key={sev} className={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${
            sev === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" :
            sev === "high" ? "border-orange-500/40 bg-orange-500/10 text-orange-300" :
            sev === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
            sev === "low" ? "border-sky-500/40 bg-sky-500/10 text-sky-300" :
            "border-zinc-600 bg-zinc-700/40 text-zinc-300"
          }`}>
            {sev.toUpperCase()}: {count}
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] text-zinc-500">
          {kpis.total_lines_scanned.toLocaleString()} lines · {kpis.codebases_scanned} codebases · {kpis.scans_completed} scans
        </span>
      </div>
    </Card>
  );
}

// ── Dark Web Monitor ────────────────────────────────────────────────────────
function DarkWebMonitor() {
  const [data, setData] = useState<DarkWebStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await sentinelApi.darkWeb()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          Dark Web Monitor
        </span>
        <div className="flex items-center gap-2">
          {data?.critical_exposures ? (
            <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
              {data.critical_exposures} critical
            </Badge>
          ) : null}
          <Button size="icon" variant="ghost" onClick={load} disabled={loading} className="size-6 text-zinc-500 hover:text-red-400">
            {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 bg-red-500/10" />)}</div>
      ) : !data?.monitoring_active || data.exposures.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
          <ShieldCheck className="mr-2 size-4 text-emerald-400" /> No leaked credentials detected.
        </div>
      ) : (
        <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto">
          {data.exposures.map((e, i) => (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer"
              className={`block rounded-lg border p-2.5 transition-colors ${
                e.severity === "critical" ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10" :
                e.severity === "high" ? "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10" :
                "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/50"
              }`}>
              <div className="flex items-center gap-2">
                <Skull className={`size-3 shrink-0 ${e.severity === "critical" ? "text-red-400" : "text-orange-400"}`} />
                <span className="text-[11px] text-zinc-300">{e.data_types.join(", ")}</span>
                {e.verified_source && <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-[8px] text-emerald-300">verified</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] text-zinc-500">{e.title}</p>
              <p className="mt-0.5 truncate text-[8px] text-zinc-600">{e.source} · {e.date}</p>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Attack Surface Manager ──────────────────────────────────────────────────
function AttackSurfaceManager() {
  const { toast } = useToast();
  const [data, setData] = useState<AttackSurfaceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await sentinelApi.attackSurface()); }
    catch (err) { toast({ variant: "destructive", title: "Scan failed", description: err instanceof Error ? err.message : "unknown" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const riskColor = data?.risk_level === "critical" ? "#ef4444" : data?.risk_level === "high" ? "#f97316" : data?.risk_level === "medium" ? "#f59e0b" : "#10b981";

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/70">
          Attack Surface
        </span>
        <div className="flex items-center gap-2">
          {data && (
            <Badge className="border px-2 text-[9px]" style={{ borderColor: riskColor, color: riskColor }}>
              {data.risk_level.toUpperCase()}
            </Badge>
          )}
          <Button size="icon" variant="ghost" onClick={load} disabled={loading} className="size-6 text-zinc-500 hover:text-cyan-400">
            {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-cyan-500/10" />)}</div>
      ) : !data ? (
        <div className="py-6 text-center text-xs text-zinc-500">Scan failed.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-red-400">{data.exposed_services}</div>
              <div className="text-[9px] uppercase text-zinc-500">Services</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-amber-400">{data.open_ports}</div>
              <div className="text-[9px] uppercase text-zinc-500">Ports</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-orange-400">{data.missing_security_headers}</div>
              <div className="text-[9px] uppercase text-zinc-500">Missing Headers</div>
            </div>
          </div>

          {/* Exposed services */}
          <div className="custom-scrollbar max-h-32 space-y-1 overflow-y-auto">
            {data.services.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/5 p-1.5">
                <ShieldX className="size-3 shrink-0 text-red-400" />
                <span className="text-[10px] text-zinc-300">{s.label}</span>
                <span className="ml-auto font-mono text-[9px] text-zinc-600">{s.path} · {s.status}</span>
              </div>
            ))}
          </div>

          {/* Security headers */}
          <div className="mt-2">
            <div className="mb-1 font-mono text-[9px] uppercase text-zinc-500">Security Headers</div>
            <div className="flex flex-wrap gap-1">
              {data.security_headers.map((h, i) => (
                <span key={i} className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[8px] ${
                  h.present ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-red-500/30 bg-red-500/5 text-red-300"
                }`}>
                  {h.present ? <CheckCircle2 className="size-2" /> : <XCircle className="size-2" />}
                  {h.label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
