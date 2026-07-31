"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type CanaryStatus,
  type DataFlowStatus,
} from "@/lib/sentinel/api";
import {
  Activity,
  AlertTriangle,
  Bird,
  CheckCircle2,
  Database,
  Eye,
  Loader2,
  Network,
  RefreshCw,
  Search,
  Shield,
  Skull,
  Target,
  Wifi,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";

export function DataExfilPanel() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          guardianx@exfil-defense:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <Shield className="size-5 text-rose-400" />
          Data Exfiltration Defense
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Canary data traps, real-time API data flow monitoring, and honeypot endpoint detection.
          Know exactly when — and by whom — your data is being scraped.
        </p>
      </div>

      {/* Data Flow Monitor */}
      <DataFlowMonitor />

      {/* Canary + Honeypot grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CanaryPanel />
        <HoneypotPanel />
      </div>
    </div>
  );
}

// ── Data Flow Monitor ───────────────────────────────────────────────────────
function DataFlowMonitor() {
  const [data, setData] = useState<DataFlowStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await sentinelApi.dataFlowMonitor()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // refresh every 5s for real-time
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Skeleton className="h-48 bg-rose-500/10" />;
  if (!data) return null;

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
          API Data Flow Monitor
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-zinc-500">live · {data.requests_per_minute} req/min</span>
          <span className={`size-1.5 rounded-full ${data.total_requests > 0 ? "bg-emerald-500 pulse-dot" : "bg-zinc-600"}`} />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "Requests", value: data.total_requests, icon: Activity, color: "text-emerald-400" },
          { label: "Data Out", value: `${(data.total_data_transferred / 1024).toFixed(1)}KB`, icon: Database, color: "text-sky-400" },
          { label: "Unique IPs", value: data.unique_ips, icon: Wifi, color: "text-cyan-400" },
          { label: "Endpoints", value: data.unique_endpoints, icon: Network, color: "text-violet-400" },
          { label: "Suspicious", value: data.suspicious_ips, icon: AlertTriangle, color: data.suspicious_ips > 0 ? "text-red-400" : "text-zinc-400" },
          { label: "Honeypot Hits", value: data.honeypot_hits, icon: Target, color: data.honeypot_hits > 0 ? "text-red-400" : "text-zinc-400" },
        ].map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
            <m.icon className={`mx-auto size-3.5 ${m.color}`} />
            <div className={`mt-1 font-mono text-lg font-bold ${m.color}`}>{m.value}</div>
            <div className="text-[8px] uppercase tracking-wider text-zinc-500">{m.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Suspicious IPs */}
      {data.suspicious_ips_list.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-red-400">
            <AlertTriangle className="size-3" /> Scraping Detection — Suspicious IPs
          </div>
          <div className="custom-scrollbar max-h-32 space-y-1 overflow-y-auto">
            {data.suspicious_ips_list.map((ip, i) => (
              <div key={i} className={`flex items-center gap-2 rounded border p-1.5 ${ip.scrapingScore > 50 ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <Skull className={`size-3 shrink-0 ${ip.scrapingScore > 50 ? "text-red-400" : "text-amber-400"}`} />
                <span className="font-mono text-[10px] text-zinc-300">{ip.ip}</span>
                <span className="text-[9px] text-zinc-500">{ip.requestCount} reqs · {ip.uniqueEndpoints} endpoints</span>
                {ip.isBot && <Badge className="border border-red-500/30 bg-red-500/10 text-[8px] text-red-300">BOT</Badge>}
                <span className="ml-auto font-mono text-[9px] font-bold" style={{ color: ip.scrapingScore > 50 ? "#ef4444" : "#f59e0b" }}>
                  scrape: {ip.scrapingScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top endpoints */}
      <div className="mt-4">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Top Accessed Endpoints</div>
        <div className="space-y-1">
          {data.top_endpoints.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-400">{e.endpoint}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-500/50" style={{ width: `${(e.count / data.top_endpoints[0].count) * 100}%` }} />
              </div>
              <span className="font-mono text-[9px] text-zinc-500">{e.count}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Canary Panel ────────────────────────────────────────────────────────────
function CanaryPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<CanaryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try { setData(await sentinelApi.canaries()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  const checkExternal = async () => {
    setChecking(true);
    try {
      const r = await sentinelApi.checkCanaries();
      toast({ title: r.detected > 0 ? "⚠ Data Exfiltration Detected!" : "No exfiltration detected", description: r.message, variant: r.detected > 0 ? "destructive" : "default" });
      load();
    } catch (err) {
      toast({ variant: "destructive", title: "Check failed", description: err instanceof Error ? err.message : "unknown" });
    } finally { setChecking(false); }
  };

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
          Canary Data Targets
        </span>
        <Button size="sm" variant="outline" onClick={checkExternal} disabled={checking}
          className="border-amber-500/30 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10">
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          Check External
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-amber-500/10" />)}</div>
      ) : !data || data.total_canaries === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
          <Bird className="mr-2 size-4 text-zinc-600" /> No canary data injected.
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-emerald-400">{data.active_canaries}</div>
              <div className="text-[9px] uppercase text-zinc-500">Active</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-zinc-300">{data.total_canaries}</div>
              <div className="text-[9px] uppercase text-zinc-500">Total</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className={`font-mono text-lg font-bold ${data.detected_canaries > 0 ? "text-red-400" : "text-emerald-400"}`}>{data.detected_canaries}</div>
              <div className="text-[9px] uppercase text-zinc-500">Detected</div>
            </div>
          </div>

          {data.detected_canaries > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
              <div>
                <div className="text-xs font-bold text-red-300">⚠ DATA EXFILTRATION CONFIRMED</div>
                <div className="text-[10px] text-red-300/70">{data.detected_canaries} canary value(s) found on external websites. Your data has been scraped.</div>
              </div>
            </div>
          )}

          <div className="custom-scrollbar max-h-48 space-y-1.5 overflow-y-auto">
            {data.canaries.map((c) => (
              <div key={c.id} className={`rounded-lg border p-2 ${c.detected ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/40"}`}>
                <div className="flex items-center gap-2">
                  {c.detected ? <AlertTriangle className="size-3 shrink-0 text-red-400" /> : <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />}
                  <span className="text-[10px] font-medium text-zinc-300">{c.label}</span>
                  <Badge className={`ml-auto border text-[8px] ${c.detected ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                    {c.detected ? "EXFILTRATED" : "CLEAN"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-[8px] text-zinc-500">{c.canary_value.slice(0, 40)}{c.canary_value.length > 40 ? "…" : ""}</code>
                  <span className="font-mono text-[8px] text-zinc-600">{c.injected_endpoint}</span>
                </div>
                {c.detected && c.detected_on && (
                  <div className="mt-0.5 text-[8px] text-red-400">Found on: {c.detected_on}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Honeypot Panel ──────────────────────────────────────────────────────────
function HoneypotPanel() {
  const [data, setData] = useState<DataFlowStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await sentinelApi.dataFlowMonitor()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, [load]);

  const hits = data?.honeypot_hits_list ?? [];

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          Honeypot Endpoint Targets
        </span>
        <Badge className={`border text-[9px] ${hits.length > 0 ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
          {hits.length > 0 ? `${hits.length} TRAPS TRIGGERED` : "NO HITS"}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-red-500/10" />)}</div>
      ) : hits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Target className="size-8 text-zinc-700" />
          <p className="mt-2 text-xs text-zinc-500">No honeypot traps triggered.</p>
          <p className="mt-1 text-[10px] text-zinc-600">8 trap endpoints deployed. If a scraper hits one, it'll appear here.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {["/api/export-all", "/api/v2/users/bulk", "/api/admin/dump", "/.hidden/admin"].map((p) => (
              <code key={p} className="rounded border border-zinc-800 bg-zinc-900/40 px-1.5 py-0.5 font-mono text-[8px] text-zinc-500">{p}</code>
            ))}
          </div>
        </div>
      ) : (
        <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto">
          {hits.map((h, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
              <div className="flex items-center gap-2">
                <Skull className="size-3.5 shrink-0 text-red-400" />
                <code className="font-mono text-[10px] text-red-300">{h.endpoint}</code>
                <Badge className="border border-red-500/30 bg-red-500/10 text-[8px] text-red-300">{h.method}</Badge>
                <span className="ml-auto font-mono text-[8px] text-zinc-500">{new Date(h.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-[9px] text-zinc-400">IP: {h.ipAddress}</span>
                <span className="font-mono text-[8px] text-zinc-600 truncate">UA: {h.userAgent.slice(0, 50)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}
