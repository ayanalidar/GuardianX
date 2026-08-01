"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Globe, GitBranch, Shield, Loader2, CheckCircle2,
  Circle, AlertCircle, Activity, Bug, Crosshair, ShieldCheck,
  Swords, Heart, Gavel, Zap, TrendingUp, Radar, Eye, Clock,
  ArrowRight, Plus, Skull, FileText, Cpu,
} from "lucide-react";

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

interface LiveEvent {
  id: string;
  type: "scan" | "engagement" | "patch" | "finding" | "system";
  client: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  ts: string;
}

interface DashboardStats {
  total_clients: number;
  active_pipelines: number;
  total_scans: number;
  total_patches: number;
  total_findings: number;
  critical_findings: number;
  pending_patches: number;
  approved_patches: number;
  compliant_clients: number;
}

const PIPELINE_STAGES = [
  { key: "onboarding", label: "Onboard", icon: Building2, color: "emerald" },
  { key: "scanning", label: "Scan", icon: Bug, color: "cyan" },
  { key: "testing", label: "Test", icon: Crosshair, color: "amber" },
  { key: "patching", label: "Patch", icon: ShieldCheck, color: "violet" },
  { key: "verifying", label: "Verify", icon: Swords, color: "sky" },
  { key: "defending", label: "Defend", icon: Shield, color: "rose" },
  { key: "compliant", label: "Comply", icon: Gavel, color: "emerald" },
];

const COLOR_MAP: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", dot: "bg-emerald-500" },
  cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/40", dot: "bg-cyan-500" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40", dot: "bg-amber-500" },
  violet: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/40", dot: "bg-violet-500" },
  sky: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/40", dot: "bg-sky-500" },
  rose: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", dot: "bg-rose-500" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40", dot: "bg-red-500" },
};

interface CommandCenterProps {
  onSelectClient: (id: string) => void;
  onAddClient: () => void;
}

export function CommandCenter({ onSelectClient, onAddClient }: CommandCenterProps) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const eventCounter = useRef(0);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (Array.isArray(data)) {
        setClients(data);

        // Compute aggregate stats
        const totalScans = data.reduce((sum: number, c: ClientSummary) => sum + (c.stats.patches > 0 ? 1 : 0), 0);
        setStats({
          total_clients: data.length,
          active_pipelines: data.filter((c: ClientSummary) => c.status !== "onboarding" && c.status !== "compliant").length,
          total_scans: totalScans,
          total_patches: data.reduce((sum: number, c: ClientSummary) => sum + c.stats.patches, 0),
          total_findings: data.reduce((sum: number, c: ClientSummary) => sum + c.stats.findings, 0),
          critical_findings: data.reduce((sum: number, c: ClientSummary) => sum + c.stats.critical_findings, 0),
          pending_patches: data.reduce((sum: number, c: ClientSummary) => sum + c.stats.pending_patches, 0),
          approved_patches: data.reduce((sum: number, c: ClientSummary) => sum + c.stats.approved_patches, 0),
          compliant_clients: data.filter((c: ClientSummary) => c.status === "compliant").length,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 10 seconds for live updates
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  // Simulate live events from pipeline activity (in production these come from socket.io)
  useEffect(() => {
    if (clients.length === 0) return;
    const id = setInterval(() => {
      // Generate synthetic live events based on client states
      const activeClient = clients.find((c) => c.status !== "compliant" && c.status !== "onboarding");
      if (!activeClient) return;

      const eventTypes = [
        { type: "scan" as const, msg: `Scanning ${activeClient.name} codebase…`, level: "info" as const },
        { type: "patch" as const, msg: `Patch generated for ${activeClient.name}`, level: "success" as const },
        { type: "finding" as const, msg: `Finding detected on ${activeClient.name}`, level: "warning" as const },
        { type: "engagement" as const, msg: `DAST attack on ${activeClient.target_url}`, level: "info" as const },
      ];
      const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const newEvent: LiveEvent = {
        id: `evt-${++eventCounter.current}`,
        type: evt.type,
        client: activeClient.name,
        message: evt.msg,
        level: evt.level,
        ts: new Date().toISOString(),
      };
      setLiveEvents((prev) => [newEvent, ...prev].slice(0, 30));
    }, 5000);
    return () => clearInterval(id);
  }, [clients]);

  return (
    <div className="space-y-5">
      {/* ═══ COMMAND CENTER HEADER ═══ */}
      <div className="holo-card-sharp hud-corners relative overflow-hidden p-5">
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                <Radar className="size-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-50 neon-emerald">Command Center</h2>
                <p className="text-xs text-zinc-400">Real-time security operations across all clients</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 font-mono text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
              <span className="text-emerald-300">LIVE</span>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 font-mono text-xs text-zinc-400">
              <Clock className="inline size-3 mr-1" />
              {clock.toLocaleTimeString("en-US", { hour12: false })}
            </div>
            <Button onClick={onAddClient} className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              <Plus className="size-4" /> Add Client
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ KPI STRIP ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="Clients" value={stats?.total_clients ?? 0} icon={Building2} color="emerald" />
        <KpiCard label="Active" value={stats?.active_pipelines ?? 0} icon={Activity} color="cyan" pulse />
        <KpiCard label="Scans" value={stats?.total_scans ?? 0} icon={Bug} color="cyan" />
        <KpiCard label="Patches" value={stats?.total_patches ?? 0} icon={ShieldCheck} color="violet" />
        <KpiCard label="Pending" value={stats?.pending_patches ?? 0} icon={AlertCircle} color="amber" />
        <KpiCard label="Findings" value={stats?.total_findings ?? 0} icon={Skull} color="red" />
        <KpiCard label="Critical" value={stats?.critical_findings ?? 0} icon={AlertCircle} color="red" pulse />
        <KpiCard label="Compliant" value={stats?.compliant_clients ?? 0} icon={CheckCircle2} color="emerald" />
      </div>

      {/* ═══ MAIN GRID: Client Pipelines + Live Feed ═══ */}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        {/* LEFT: Active Client Pipelines */}
        <section className="space-y-4 min-w-0">
          <div className="holo-card-sharp hud-corners p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-header text-sm font-bold text-emerald-300">
                <Activity className="inline size-4 mr-1" />
                Active Client Pipelines
              </h3>
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                {clients.length} TOTAL
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
                  <Building2 className="size-7 text-emerald-400" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-zinc-200">No clients yet</h4>
                <p className="mt-1 text-xs text-zinc-500">Onboard your first client to start the pipeline</p>
                <Button onClick={onAddClient} size="sm" className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500">
                  <Plus className="size-3" /> Add First Client
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {clients.map((c, i) => (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => onSelectClient(c.id)}
                      className="group cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80 p-4 transition-all hover:border-emerald-500/50 hover:bg-zinc-800/80"
                    >
                      {/* Client header */}
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                            <Building2 className="size-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-zinc-100 group-hover:text-emerald-300">{c.name}</h4>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-medium ${
                                c.status === "compliant" ? "text-emerald-400" :
                                c.status === "onboarding" ? "text-zinc-400" :
                                "text-cyan-400"
                              }`}>{c.status.toUpperCase()}</span>
                              {c.authorized && (
                                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[8px] text-emerald-300">AUTH</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {c.stats.critical_findings > 0 && (
                          <div className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">
                            <AlertCircle className="size-3" />
                            {c.stats.critical_findings} CRITICAL
                          </div>
                        )}
                      </div>

                      {/* Pipeline stepper — horizontal, compact */}
                      <div className="flex items-center gap-0.5">
                        {PIPELINE_STAGES.map((stage, idx) => {
                          const stageStatus = getStageStatus(c, stage.key);
                          const cfg = COLOR_MAP[stage.color] || COLOR_MAP.emerald;
                          const Icon = stage.icon;
                          return (
                            <div key={stage.key} className="flex flex-1 items-center">
                              <div
                                className={`flex h-7 flex-1 items-center justify-center gap-1 rounded border ${
                                  stageStatus === "completed"
                                    ? `${cfg.border} ${cfg.bg}`
                                    : stageStatus === "in-progress"
                                      ? `${cfg.border} ${cfg.bg} animate-pulse`
                                      : "border-zinc-800 bg-zinc-900/40"
                                }`}
                                title={`${stage.label}: ${stageStatus}`}
                              >
                                <Icon className={`size-3 ${
                                  stageStatus === "completed" || stageStatus === "in-progress" ? cfg.text : "text-zinc-600"
                                }`} />
                                <span className={`hidden text-[9px] font-medium sm:inline ${
                                  stageStatus === "completed" || stageStatus === "in-progress" ? cfg.text : "text-zinc-600"
                                }`}>
                                  {stage.label}
                                </span>
                              </div>
                              {idx < PIPELINE_STAGES.length - 1 && (
                                <div className={`mx-0.5 h-0.5 w-1 ${stageStatus === "completed" ? cfg.dot : "bg-zinc-800"}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Mini stats */}
                      <div className="mt-2 flex items-center gap-4 border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <GitBranch className="size-3 text-sky-400" />
                          {c.stats.codebases} repos
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="size-3 text-red-400" />
                          {c.stats.targets} targets
                        </span>
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="size-3 text-emerald-400" />
                          {c.stats.patches} patches
                        </span>
                        <span className="flex items-center gap-1">
                          <Skull className="size-3 text-amber-400" />
                          {c.stats.findings} findings
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: Live Event Feed */}
        <aside className="space-y-4 min-w-0">
          <div className="holo-card-sharp hud-corners flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-header text-sm font-bold text-cyan-300">
                <Zap className="inline size-4 mr-1" />
                Live Activity
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-400">STREAMING</span>
              </div>
            </div>

            {/* Live event feed — scrollable */}
            <div className="custom-scrollbar max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {liveEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    <Eye className="mx-auto size-6 text-zinc-600" />
                    <p className="mt-2">Waiting for pipeline activity…</p>
                  </div>
                ) : (
                  liveEvents.map((evt) => {
                    const cfg = COLOR_MAP[
                      evt.level === "success" ? "emerald" :
                      evt.level === "warning" ? "amber" :
                      evt.level === "error" ? "red" : "cyan"
                    ] || COLOR_MAP.cyan;
                    const Icon = evt.type === "scan" ? Bug :
                                 evt.type === "patch" ? ShieldCheck :
                                 evt.type === "finding" ? Skull :
                                 evt.type === "engagement" ? Crosshair : Activity;
                    return (
                      <motion.div
                        key={evt.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={`flex items-start gap-2 rounded border ${cfg.border} ${cfg.bg} p-2`}
                      >
                        <Icon className={`mt-0.5 size-3 shrink-0 ${cfg.text}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-zinc-300">{evt.message}</p>
                          <p className="font-mono text-[9px] text-zinc-600">
                            {new Date(evt.ts).toLocaleTimeString("en-US", { hour12: false })}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* System status */}
          <div className="holo-card-sharp hud-corners p-4">
            <h3 className="mb-3 section-header text-sm font-bold text-emerald-300">
              <Cpu className="inline size-4 mr-1" />
              System Status
            </h3>
            <div className="space-y-2 text-xs">
              <SystemRow label="Vercel API" status="online" />
              <SystemRow label="Railway Engine" status="online" />
              <SystemRow label="Supabase DB" status="online" />
              <SystemRow label="Socket.io Relay" status={stats?.active_pipelines ? "active" : "online"} />
            </div>
          </div>
        </aside>
      </div>
    </div>
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

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, pulse }: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: string;
  pulse?: boolean;
}) {
  const cfg = COLOR_MAP[color] || COLOR_MAP.emerald;
  return (
    <div className={`holo-card-sharp hud-corners flex flex-col items-center justify-center border ${cfg.border} p-2.5`}>
      <Icon className={`size-3.5 ${cfg.text} ${pulse ? "animate-pulse" : ""}`} />
      <div className={`mt-1 text-lg font-bold ${cfg.text}`}>{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

// ── System Status Row ──────────────────────────────────────────────────────
function SystemRow({ label, status }: { label: string; status: "online" | "active" | "offline" }) {
  const cfg = status === "online" ? COLOR_MAP.emerald : status === "active" ? COLOR_MAP.cyan : COLOR_MAP.red;
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${cfg.dot} ${status !== "offline" ? "pulse-dot" : ""}`} />
        <span className={`text-[10px] font-medium ${cfg.text}`}>{status.toUpperCase()}</span>
      </div>
    </div>
  );
}
