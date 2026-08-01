"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Globe, Shield, Loader2, CheckCircle2,
  AlertCircle, Activity, Bug, Crosshair, ShieldCheck,
  Swords, Gavel, Zap, Radar, Eye, Clock,
  Plus, Skull, Cpu, Lock, Terminal, Server, Database,
  Wifi, Gauge, AlertTriangle, ChevronRight, Maximize2,
} from "lucide-react";
import { Sparkline, AttackHeatmap } from "./sparkline";
import { NetworkTopology } from "./network-topology";
import { ProcessTree } from "./process-tree";
import { ThreatBriefing, AnomalyDetection, PredictiveRiskScore } from "./ai-panels";
import { LiveExploitTerminal } from "./live-exploit-terminal";

interface ClientSummary {
  id: string;
  name: string;
  description: string | null;
  target_url: string | null;
  repo_url: string | null;
  authorized: boolean;
  frameworks: string[];
  status: string;
  created_at: string;
  stats: {
    codebases: number;
    targets: number;
    patches: number;
    pending_patches: number;
    approved_patches: number;
    critical_patches: number;
    findings: number;
    critical_findings: number;
  };
}

interface FeedEvent {
  id: string;
  type: "scan" | "engagement" | "patch" | "finding" | "canary" | "attestation" | "system";
  action: string;
  client: string;
  detail: string;
  severity: "info" | "success" | "warning" | "error";
  ts: string;
}

interface ActivityFeed {
  events: FeedEvent[];
  active_processes: {
    sast_scans: number;
    dast_engagements: number;
    pending_patches: number;
    total_active: number;
  };
  active_details: {
    scans: { id: string; status: string; stage: string; codebase: string }[];
    engagements: { id: string; status: string; stage: string; target: string }[];
  };
  stats: { total_events: number; critical: number; warnings: number; successes: number };
}

const PIPELINE_STAGES = [
  { key: "onboarding", label: "ONBOARD", icon: Building2, color: "emerald" },
  { key: "scanning", label: "SCAN", icon: Bug, color: "cyan" },
  { key: "testing", label: "TEST", icon: Crosshair, color: "amber" },
  { key: "patching", label: "PATCH", icon: ShieldCheck, color: "violet" },
  { key: "verifying", label: "VERIFY", icon: Swords, color: "sky" },
  { key: "defending", label: "DEFEND", icon: Shield, color: "rose" },
  { key: "compliant", label: "COMPLY", icon: Gavel, color: "emerald" },
];

const COLOR_MAP: Record<string, { text: string; bg: string; border: string; dot: string; hex: string }> = {
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", dot: "bg-emerald-500", hex: "#10b981" },
  cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/40", dot: "bg-cyan-500", hex: "#06b6d4" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40", dot: "bg-amber-500", hex: "#f59e0b" },
  violet: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/40", dot: "bg-violet-500", hex: "#8b5cf6" },
  sky: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/40", dot: "bg-sky-500", hex: "#0ea5e9" },
  rose: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", dot: "bg-rose-500", hex: "#f43f5e" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40", dot: "bg-red-500", hex: "#ef4444" },
};

const EVENT_ICONS: Record<string, typeof Bug> = {
  scan: Bug,
  engagement: Crosshair,
  patch: ShieldCheck,
  finding: Skull,
  canary: Shield,
  attestation: Lock,
  system: Server,
};

interface CommandCenterProps {
  onSelectClient: (id: string) => void;
  onAddClient: () => void;
}

export function CommandCenter({ onSelectClient, onAddClient }: CommandCenterProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [threatLevel, setThreatLevel] = useState(0);
  const [warRoom, setWarRoom] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [cRes, fRes] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/activity-feed"),
      ]);
      const c = await cRes.json();
      const f = await fRes.json();
      if (Array.isArray(c)) setClients(c);
      if (f && !f.error) setFeed(f);

      // Compute threat level from critical findings + active processes
      if (f && !f.error) {
        const criticalCount = f.stats.critical;
        const activeCount = f.active_processes.total_active;
        // Threat level: 0-100, scaled from critical findings + active processes
        setThreatLevel(Math.min(100, criticalCount * 8 + activeCount * 5));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // refresh every 5s for real-time feel
    return () => clearInterval(id);
  }, [load]);

  // Compute aggregate stats
  const stats = {
    total_clients: clients.length,
    active_pipelines: clients.filter((c) => c.status !== "onboarding" && c.status !== "compliant").length,
    total_scans: feed?.active_processes.sast_scans || 0,
    total_patches: clients.reduce((s, c) => s + c.stats.patches, 0),
    pending_patches: clients.reduce((s, c) => s + c.stats.pending_patches, 0),
    total_findings: clients.reduce((s, c) => s + c.stats.findings, 0),
    critical_findings: clients.reduce((s, c) => s + c.stats.critical_findings, 0),
    compliant_clients: clients.filter((c) => c.status === "compliant").length,
  };

  const threatColor = threatLevel >= 60 ? "red" : threatLevel >= 30 ? "amber" : "emerald";
  const threatCfg = COLOR_MAP[threatColor];

  return (
    <div className="space-y-4">
      {/* ═══ FUTURISTIC HEADER ═══ */}
      <div className="holo-card-sharp hud-corners relative overflow-hidden p-5">
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-30" />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 left-1/3 h-40 w-96 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -bottom-10 right-0 h-32 w-64 rounded-full bg-red-500/10 blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/10 neon-border">
                <Radar className="size-6 text-emerald-400" />
              </div>
              <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-500 pulse-dot" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-50">
                <span className="neon-emerald">COMMAND</span>{" "}
                <span className="neon-cyan">CENTER</span>
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                {"// real-time security operations // all clients // all services"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Threat level gauge */}
            <div className={`flex items-center gap-2 rounded-lg border ${threatCfg.border} ${threatCfg.bg} px-3 py-2`}>
              <Gauge className={`size-4 ${threatCfg.text} ${threatLevel >= 30 ? "animate-pulse" : ""}`} />
              <div>
                <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">Threat Level</div>
                <div className={`font-mono text-sm font-bold ${threatCfg.text}`}>
                  {threatLevel >= 60 ? "CRITICAL" : threatLevel >= 30 ? "ELEVATED" : "GUARDED"}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 w-3 rounded-sm ${
                      i < Math.floor(threatLevel / 10) ? threatCfg.dot : "bg-zinc-800"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Live clock */}
            <div className="rounded-lg border border-emerald-500/30 bg-zinc-950/80 px-3 py-2 font-mono">
              <div className="text-[8px] uppercase tracking-wider text-emerald-500/60">SYS TIME</div>
              <div className="text-sm font-bold text-emerald-300 neon-emerald">
                {clock.toLocaleTimeString("en-US", { hour12: false })}
              </div>
            </div>

            <Button
              onClick={() => setWarRoom(true)}
              variant="outline"
              className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 neon-border-cyan"
            >
              <Maximize2 className="size-4" /> <span className="hidden sm:inline">War Room</span>
            </Button>
            <Button onClick={onAddClient} className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              <Plus className="size-4" /> <span className="hidden sm:inline">Add Client</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ KPI STRIP — terminal-style with sparklines ═══ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="CLIENTS" value={stats.total_clients} icon={Building2} color="emerald" />
        <KpiCard label="ACTIVE" value={stats.active_pipelines} icon={Activity} color="cyan" pulse={stats.active_pipelines > 0} sparkMetric="scans" />
        <KpiCard label="SCANS" value={feed?.active_processes.sast_scans ?? 0} icon={Bug} color="cyan" pulse={(feed?.active_processes.sast_scans ?? 0) > 0} sparkMetric="scans" />
        <KpiCard label="PATCHES" value={stats.total_patches} icon={ShieldCheck} color="violet" sparkMetric="patches" />
        <KpiCard label="PENDING" value={stats.pending_patches} icon={AlertCircle} color="amber" pulse={stats.pending_patches > 0} sparkMetric="patches" />
        <KpiCard label="FINDINGS" value={stats.total_findings} icon={Skull} color="red" sparkMetric="findings" />
        <KpiCard label="CRITICAL" value={stats.critical_findings} icon={AlertTriangle} color="red" pulse={stats.critical_findings > 0} sparkMetric="critical" />
        <KpiCard label="COMPLIANT" value={stats.compliant_clients} icon={CheckCircle2} color="emerald" />
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        {/* LEFT: Active pipelines + process tree */}
        <section className="space-y-4 min-w-0">
          {/* Active Client Pipelines */}
          <div className="holo-card-sharp hud-corners p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-header text-sm font-bold text-emerald-300">
                <Activity className="inline size-4 mr-1" />
                ACTIVE PIPELINES
              </h3>
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                  {stats.active_pipelines} ACTIVE / {stats.total_clients} TOTAL
                </span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
                <Building2 className="size-10 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-400">No clients yet</p>
                <Button onClick={onAddClient} size="sm" className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500">
                  <Plus className="size-3" /> Add First Client
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {clients.map((c, i) => (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => onSelectClient(c.id)}
                      className="group cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 transition-all hover:border-emerald-500/50 hover:bg-zinc-800/80"
                    >
                      <div className="flex items-center gap-3">
                        {/* Client icon */}
                        <div className="flex size-8 shrink-0 items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10">
                          <Building2 className="size-4 text-emerald-400" />
                        </div>

                        {/* Name + status */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate text-sm font-bold text-zinc-100 group-hover:text-emerald-300">{c.name}</h4>
                            <span className={`text-[9px] font-mono font-medium ${
                              c.status === "compliant" ? "text-emerald-400" :
                              c.status === "onboarding" ? "text-zinc-500" :
                              c.status === "defending" ? "text-rose-400" :
                              "text-cyan-400"
                            }`}>
                              [{c.status.toUpperCase()}]
                            </span>
                            {c.stats.critical_findings > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-400">
                                <AlertTriangle className="size-2.5" />
                                {c.stats.critical_findings}
                              </span>
                            )}
                          </div>

                          {/* Pipeline stepper — compact horizontal */}
                          <div className="mt-1.5 flex items-center gap-0.5">
                            {PIPELINE_STAGES.map((stage, idx) => {
                              const stageStatus = getStageStatus(c, stage.key);
                              const cfg = COLOR_MAP[stage.color];
                              const Icon = stage.icon;
                              return (
                                <div key={stage.key} className="flex flex-1 items-center">
                                  <div
                                    className={`flex h-6 items-center justify-center rounded border ${
                                      stageStatus === "completed"
                                        ? `${cfg.border} ${cfg.bg}`
                                        : stageStatus === "in-progress"
                                          ? `${cfg.border} ${cfg.bg} animate-pulse`
                                          : "border-zinc-800 bg-zinc-900/40"
                                    }`}
                                    style={{ minWidth: "24px" }}
                                    title={`${stage.label}: ${stageStatus}`}
                                  >
                                    <Icon className={`size-3 ${
                                      stageStatus !== "pending" ? cfg.text : "text-zinc-700"
                                    }`} />
                                  </div>
                                  {idx < PIPELINE_STAGES.length - 1 && (
                                    <div className={`mx-0.5 h-0.5 w-1 ${stageStatus === "completed" ? cfg.dot : "bg-zinc-800"}`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Mini stats */}
                        <div className="hidden shrink-0 items-center gap-3 text-[10px] text-zinc-500 sm:flex">
                          <span className="flex items-center gap-0.5" title="Codebases">
                            <Globe className="size-3 text-sky-400" />
                            {c.stats.codebases}
                          </span>
                          <span className="flex items-center gap-0.5" title="Patches">
                            <ShieldCheck className="size-3 text-emerald-400" />
                            {c.stats.patches}
                          </span>
                          <span className="flex items-center gap-0.5" title="Findings">
                            <Skull className="size-3 text-amber-400" />
                            {c.stats.findings}
                          </span>
                          <ChevronRight className="size-3 text-zinc-600 group-hover:text-emerald-400" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ═══ PROCESS TREE — htop-style ═══ */}
          <ProcessTree />

          {/* ═══ LIVE EXPLOIT TERMINAL ═══ */}
          <LiveExploitTerminal />
        </section>

        {/* RIGHT: Live terminal feed + system status */}
        <aside className="space-y-4 min-w-0">
          {/* ═══ LIVE TERMINAL FEED ═══ */}
          <div className="holo-card-sharp hud-corners flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-header text-sm font-bold text-cyan-300">
                <Terminal className="inline size-4 mr-1" />
                LIVE FEED
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-400">STREAMING</span>
              </div>
            </div>

            {/* Terminal-style event log */}
            <div
              ref={logRef}
              className="custom-scrollbar max-h-[420px] space-y-1 overflow-y-auto pr-1 font-mono text-[11px]"
            >
              <AnimatePresence mode="popLayout">
                {(!feed || feed.events.length === 0) ? (
                  <div className="py-8 text-center text-zinc-600">
                    <Eye className="mx-auto size-5" />
                    <p className="mt-1">Waiting for events…</p>
                  </div>
                ) : (
                  feed.events.map((evt) => {
                    const sevColor = evt.severity === "error" ? "red" : evt.severity === "warning" ? "amber" : evt.severity === "success" ? "emerald" : "cyan";
                    const cfg = COLOR_MAP[sevColor];
                    const Icon = EVENT_ICONS[evt.type] || Activity;
                    const time = new Date(evt.ts).toLocaleTimeString("en-US", { hour12: false });
                    return (
                      <motion.div
                        key={evt.id}
                        layout
                        initial={{ opacity: 0, x: -15, backgroundColor: "rgba(6, 182, 212, 0.2)" }}
                        animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0, 0, 0, 0)" }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex items-start gap-1.5 rounded p-1"
                      >
                        <span className="shrink-0 text-zinc-600">{time}</span>
                        <Icon className={`mt-0.5 size-3 shrink-0 ${cfg.text}`} />
                        <span className={`shrink-0 font-bold ${cfg.text}`}>
                          {evt.severity === "error" ? "ERR" : evt.severity === "warning" ? "WRN" : evt.severity === "success" ? "OK " : "INF"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-zinc-500">[{evt.client}]</span>{" "}
                          <span className="text-zinc-300">{evt.detail}</span>
                        </span>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            {/* Feed stats bar */}
            {feed && (
              <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2 font-mono text-[10px]">
                <span className="text-zinc-500">
                  <span className="text-red-400">{feed.stats.critical}</span> ERR ·
                  <span className="text-amber-400"> {feed.stats.warnings}</span> WRN ·
                  <span className="text-emerald-400"> {feed.stats.successes}</span> OK
                </span>
                <span className="text-zinc-600">{feed.stats.total_events} events</span>
              </div>
            )}
          </div>

          {/* ═══ SYSTEM STATUS ═══ */}
          <div className="holo-card-sharp hud-corners p-4">
            <h3 className="mb-3 section-header text-sm font-bold text-emerald-300">
              <Server className="inline size-4 mr-1" />
              SYSTEM STATUS
            </h3>
            <div className="space-y-2 text-xs">
              <SystemRow icon={Server} label="Vercel API" status="online" detail="100ms" />
              <SystemRow icon={Cpu} label="Railway Engine" status="online" detail="bun + python3" />
              <SystemRow icon={Database} label="Supabase DB" status="online" detail="HTTPS/443" />
              <SystemRow icon={Wifi} label="Socket.io Relay" status={(feed?.active_processes.total_active ?? 0) > 0 ? "active" : "online"} detail="real-time" />
            </div>
          </div>

          {/* ═══ THREAT INDICATOR ═══ */}
          <div className={`holo-card-sharp hud-corners border ${threatCfg.border} p-4`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className={`section-header text-sm font-bold ${threatCfg.text}`}>
                <AlertTriangle className="inline size-4 mr-1" />
                THREAT LEVEL
              </h3>
              <span className={`font-mono text-xs font-bold ${threatCfg.text} ${threatLevel >= 30 ? "animate-pulse" : ""}`}>
                {threatLevel}/100
              </span>
            </div>
            {/* Vertical bar gauge */}
            <div className="flex h-20 items-end gap-0.5">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t ${
                    i < Math.floor(threatLevel / 5) ? threatCfg.dot : "bg-zinc-800"
                  }`}
                  style={{ height: `${20 + i * 4}%`, opacity: i < Math.floor(threatLevel / 5) ? 1 : 0.3 }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-600">
              <span>SAFE</span>
              <span>ELEVATED</span>
              <span>CRITICAL</span>
            </div>
          </div>

          {/* ═══ AI THREAT BRIEFING ═══ */}
          <ThreatBriefing />

          {/* ═══ ANOMALY DETECTION ═══ */}
          <AnomalyDetection />

          {/* ═══ PREDICTIVE RISK SCORE ═══ */}
          <PredictiveRiskScore />
        </aside>
      </div>

      {/* ═══ FULL-WIDTH: Network Topology + Attack Heatmap ═══ */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <NetworkTopology onSelectClient={onSelectClient} />
        <AttackHeatmap />
      </div>

      {/* ═══ WAR ROOM MODE (fullscreen overlay) ═══ */}
      {warRoom && (
        <WarRoomMode
          clients={clients}
          feed={feed}
          threatLevel={threatLevel}
          clock={clock}
          onClose={() => setWarRoom(false)}
          onSelectClient={(id) => { setWarRoom(false); onSelectClient(id); }}
        />
      )}
    </div>
  );
}

// ── War Room Mode ───────────────────────────────────────────────────────────
function WarRoomMode({ clients, feed, threatLevel, clock, onClose, onSelectClient }: {
  clients: ClientSummary[];
  feed: ActivityFeed | null;
  threatLevel: number;
  clock: Date;
  onClose: () => void;
  onSelectClient: (id: string) => void;
}) {
  const [viewIndex, setViewIndex] = useState(0);

  // Auto-cycle through views every 10 seconds
  useEffect(() => {
    const id = setInterval(() => setViewIndex((i) => (i + 1) % 3), 10000);
    return () => clearInterval(id);
  }, []);

  const threatColor = threatLevel >= 60 ? "red" : threatLevel >= 30 ? "amber" : "emerald";
  const threatCfg = COLOR_MAP[threatColor];
  const stats = {
    clients: clients.length,
    active: clients.filter((c) => c.status !== "onboarding" && c.status !== "compliant").length,
    findings: clients.reduce((s, c) => s + c.stats.findings, 0),
    critical: clients.reduce((s, c) => s + c.stats.critical_findings, 0),
    patches: clients.reduce((s, c) => s + c.stats.patches, 0),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-zinc-950/98 p-4 overflow-y-auto"
    >
      <div className="scanlines cyber-vignette absolute inset-0 pointer-events-none" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="neon-emerald">WAR</span>{" "}
              <span className="neon-red">ROOM</span>
            </h1>
            <div className={`rounded-lg border ${threatCfg.border} ${threatCfg.bg} px-4 py-2`}>
              <span className={`font-mono text-2xl font-bold ${threatCfg.text}`}>
                {threatLevel >= 60 ? "CRITICAL" : threatLevel >= 30 ? "ELEVATED" : "GUARDED"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-3xl font-bold text-emerald-300 neon-emerald">
                {clock.toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div className="font-mono text-xs text-zinc-500">{clock.toLocaleDateString()}</div>
            </div>
            <Button onClick={onClose} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
              Exit War Room
            </Button>
          </div>
        </div>

        {/* Giant KPI row */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "CLIENTS", value: stats.clients, color: "emerald" },
            { label: "ACTIVE", value: stats.active, color: "cyan" },
            { label: "PATCHES", value: stats.patches, color: "violet" },
            { label: "FINDINGS", value: stats.findings, color: "amber" },
            { label: "CRITICAL", value: stats.critical, color: "red" },
          ].map((kpi) => {
            const cfg = COLOR_MAP[kpi.color];
            return (
              <div key={kpi.label} className={`holo-card-sharp hud-corners border ${cfg.border} p-6 text-center`}>
                <div className={`text-5xl font-bold font-mono ${cfg.text}`}>{kpi.value}</div>
                <div className="mt-2 text-sm font-mono uppercase tracking-widest text-zinc-500">{kpi.label}</div>
              </div>
            );
          })}
        </div>

        {/* Auto-cycling content */}
        <div className="grid gap-4 lg:grid-cols-2">
          {viewIndex === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:col-span-2">
              <h2 className="mb-3 text-xl font-bold text-emerald-300">CLIENT PIPELINE STATUS</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {clients.map((c) => (
                  <div key={c.id} onClick={() => onSelectClient(c.id)} className="holo-card-sharp hud-corners cursor-pointer p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-zinc-100">{c.name}</span>
                      <span className={`font-mono text-sm ${c.status === "compliant" ? "text-emerald-400" : "text-cyan-400"}`}>
                        [{c.status.toUpperCase()}]
                      </span>
                    </div>
                    <div className="mt-2 flex gap-3 text-sm">
                      <span className="text-sky-400">{c.stats.codebases} repos</span>
                      <span className="text-emerald-400">{c.stats.patches} patches</span>
                      <span className="text-amber-400">{c.stats.findings} findings</span>
                      {c.stats.critical_findings > 0 && <span className="text-red-400 font-bold">⚠ {c.stats.critical_findings} CRITICAL</span>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {viewIndex === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:col-span-2">
              <h2 className="mb-3 text-xl font-bold text-cyan-300">LIVE ACTIVITY FEED</h2>
              <div className="holo-card-sharp hud-corners p-4 max-h-96 overflow-y-auto custom-scrollbar font-mono text-sm">
                {feed?.events.slice(0, 20).map((evt) => {
                  const cfg = COLOR_MAP[evt.severity === "error" ? "red" : evt.severity === "warning" ? "amber" : evt.severity === "success" ? "emerald" : "cyan"];
                  return (
                    <div key={evt.id} className="flex gap-2 py-1">
                      <span className="text-zinc-600">{new Date(evt.ts).toLocaleTimeString("en-US", { hour12: false })}</span>
                      <span className={`font-bold ${cfg.text}`}>{evt.severity === "error" ? "ERR" : evt.severity === "warning" ? "WRN" : evt.severity === "success" ? "OK" : "INF"}</span>
                      <span className="text-zinc-500">[{evt.client}]</span>
                      <span className="text-zinc-300">{evt.detail}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
          {viewIndex === 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:col-span-2">
              <h2 className="mb-3 text-xl font-bold text-rose-300">THREAT LEVEL MONITOR</h2>
              <div className="holo-card-sharp hud-corners p-8 text-center">
                <div className={`text-9xl font-bold font-mono ${threatCfg.text} ${threatLevel >= 30 ? "animate-pulse" : ""}`}>
                  {threatLevel}
                </div>
                <div className={`mt-4 text-3xl font-bold ${threatCfg.text}`}>
                  {threatLevel >= 60 ? "CRITICAL THREAT" : threatLevel >= 30 ? "ELEVATED RISK" : "GUARDED STATUS"}
                </div>
                <div className="mt-4 flex justify-center gap-1">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className={`h-8 w-4 rounded ${i < Math.floor(threatLevel / 5) ? threatCfg.dot : "bg-zinc-800"}`} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="mt-4 text-center font-mono text-xs text-zinc-600">
          Auto-cycling views every 10s · View {viewIndex + 1}/3 · Press ESC or click Exit to leave
        </div>
      </div>
    </motion.div>
  );
}

// ── Helper: determine stage status from client data ────────────────────────
function getStageStatus(client: ClientSummary, stageKey: string): "pending" | "in-progress" | "completed" {
  const s = client.stats;
  switch (stageKey) {
    case "onboarding":
      return (s.codebases > 0 || s.targets > 0) && client.authorized ? "completed" : (s.codebases > 0 || s.targets > 0) ? "in-progress" : "pending";
    case "scanning":
      return s.patches > 0 || s.findings > 0 ? "completed" : client.status === "scanning" ? "in-progress" : "pending";
    case "testing":
      return s.findings > 0 ? "completed" : client.status === "testing" ? "in-progress" : "pending";
    case "patching":
      return s.approved_patches > 0 ? "completed" : s.pending_patches > 0 ? "in-progress" : "pending";
    case "verifying":
      return s.approved_patches > 0 ? "completed" : "pending";
    case "defending":
      return client.status === "defending" || client.status === "compliant" ? "completed" : "pending";
    case "compliant":
      return client.status === "compliant" ? "completed" : "pending";
    default:
      return "pending";
  }
}

// ── KPI Card — terminal style with sparkline ───────────────────────────────
function KpiCard({ label, value, icon: Icon, color, pulse, sparkMetric }: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: string;
  pulse?: boolean;
  sparkMetric?: "scans" | "patches" | "findings" | "critical";
}) {
  const cfg = COLOR_MAP[color] || COLOR_MAP.emerald;
  return (
    <div className={`holo-card-sharp hud-corners flex flex-col items-center justify-center border ${cfg.border} p-2`}>
      <div className="flex items-center gap-1">
        <Icon className={`size-3 ${cfg.text} ${pulse ? "animate-pulse" : ""}`} />
        {sparkMetric && <Sparkline metric={sparkMetric} color={color} />}
      </div>
      <div className={`mt-0.5 text-lg font-bold font-mono ${cfg.text}`}>{value}</div>
      <div className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

// ── System Status Row ──────────────────────────────────────────────────────
function SystemRow({ icon: Icon, label, status, detail }: {
  icon: typeof Server;
  label: string;
  status: "online" | "active" | "offline";
  detail?: string;
}) {
  const cfg = status === "online" ? COLOR_MAP.emerald : status === "active" ? COLOR_MAP.cyan : COLOR_MAP.red;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-3 text-zinc-500" />
        <span className="text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail && <span className="font-mono text-[9px] text-zinc-600">{detail}</span>}
        <span className={`size-1.5 rounded-full ${cfg.dot} ${status !== "offline" ? "pulse-dot" : ""}`} />
        <span className={`font-mono text-[10px] font-bold ${cfg.text}`}>{status.toUpperCase()}</span>
      </div>
    </div>
  );
}
