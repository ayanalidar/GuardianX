"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Building2, Globe, ShieldCheck, Skull, AlertTriangle, ChevronRight, Activity, Plus, Loader2, Trash2 } from "lucide-react";

interface ClientSummary {
  id: string;
  name: string;
  status: string;
  authorized: boolean;
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

const PIPELINE_STAGES = [
  { key: "onboarding", label: "ONBOARD", icon: Building2, color: "emerald" },
  { key: "scanning", label: "SCAN", icon: Activity, color: "cyan" },
  { key: "testing", label: "TEST", icon: Skull, color: "amber" },
  { key: "patching", label: "PATCH", icon: ShieldCheck, color: "violet" },
  { key: "verifying", label: "VERIFY", icon: ShieldCheck, color: "sky" },
  { key: "defending", label: "DEFEND", icon: ShieldCheck, color: "rose" },
  { key: "compliant", label: "COMPLY", icon: ShieldCheck, color: "emerald" },
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

interface ActivePipelinesProps {
  onSelectClient: (id: string) => void;
  onAddClient: () => void;
  onClientDeleted?: () => void;
}

export function ActivePipelines({ onSelectClient, onAddClient, onClientDeleted }: ActivePipelinesProps) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, client: ClientSummary) => {
    e.stopPropagation();
    if (!confirm(`Delete "${client.name}"? This removes the client and all its codebases, targets, scans, and findings. This cannot be undone.`)) return;
    setDeletingId(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Client deleted", description: client.name });
        load();
        onClientDeleted?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Delete failed", description: data.error || "Unknown error" });
      }
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    } finally {
      setDeletingId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (Array.isArray(data)) setClients(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const activeCount = clients.filter((c) => c.status !== "onboarding" && c.status !== "compliant").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Activity className="size-5 text-emerald-400 neon-emerald" />
            Active Pipelines
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            All clients flowing through the 7-stage security pipeline. Click any client to see full detail.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 font-mono text-xs">
            <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
            <span className="text-emerald-300">{activeCount} ACTIVE</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{clients.length} TOTAL</span>
          </div>
          <Button onClick={onAddClient} className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
            <Plus className="size-4" /> Add Client
          </Button>
        </div>
      </div>

      {/* Pipeline legend */}
      <div className="holo-card-sharp hud-corners flex flex-wrap items-center gap-2 p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Pipeline:</span>
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1 rounded border ${COLOR_MAP[stage.color].border} ${COLOR_MAP[stage.color].bg} px-2 py-1`}>
              <stage.icon className={`size-3 ${COLOR_MAP[stage.color].text}`} />
              <span className={`text-[10px] font-mono font-medium ${COLOR_MAP[stage.color].text}`}>{i + 1}. {stage.label}</span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && <ChevronRight className="size-3 text-zinc-600" />}
          </div>
        ))}
      </div>

      {/* Client pipeline cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-16 text-center">
          <Building2 className="size-12 text-zinc-600" />
          <h3 className="mt-3 text-base font-semibold text-zinc-200">No clients yet</h3>
          <p className="mt-1 text-sm text-zinc-400">Add your first client to start the pipeline</p>
          <Button onClick={onAddClient} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-500">
            <Plus className="size-4" /> Add First Client
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {clients.map((c, i) => {
              const stages = PIPELINE_STAGES.map((s) => ({ ...s, status: getStageStatus(c, s.key) }));
              const completedCount = stages.filter((s) => s.status === "completed").length;
              const progress = Math.round((completedCount / 7) * 100);

              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => onSelectClient(c.id)}
                  className="group cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80 p-4 transition-all hover:border-emerald-500/50 hover:bg-zinc-800/80"
                >
                  <div className="flex items-center gap-4">
                    {/* Client icon */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Building2 className="size-5 text-emerald-400" />
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

                      {/* Pipeline stepper — full horizontal with labels */}
                      <div className="mt-2 flex items-center gap-1">
                        {PIPELINE_STAGES.map((stage, idx) => {
                          const stageStatus = getStageStatus(c, stage.key);
                          const cfg = COLOR_MAP[stage.color];
                          const Icon = stage.icon;
                          return (
                            <div key={stage.key} className="flex flex-1 items-center">
                              <div
                                className={`flex h-8 items-center justify-center gap-1 rounded border px-1 ${
                                  stageStatus === "completed"
                                    ? `${cfg.border} ${cfg.bg}`
                                    : stageStatus === "in-progress"
                                      ? `${cfg.border} ${cfg.bg} animate-pulse`
                                      : "border-zinc-800 bg-zinc-900/40"
                                }`}
                                style={{ minWidth: "60px" }}
                                title={`${stage.label}: ${stageStatus}`}
                              >
                                <Icon className={`size-3 ${stageStatus !== "pending" ? cfg.text : "text-zinc-700"}`} />
                                <span className={`text-[8px] font-mono ${stageStatus !== "pending" ? cfg.text : "text-zinc-700"}`}>
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
                    </div>

                    {/* Progress + stats */}
                    <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold font-mono text-emerald-400">{progress}%</div>
                        <button
                          onClick={(e) => handleDelete(e, c)}
                          disabled={deletingId === c.id}
                          title={`Delete ${c.name}`}
                          className="flex size-6 items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/60 text-zinc-500 transition-all hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
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
                      </div>
                      <ChevronRight className="size-3 text-zinc-600 group-hover:text-emerald-400" />
                    </div>

                    {/* Mobile delete button (visible on small screens) */}
                    <button
                      onClick={(e) => handleDelete(e, c)}
                      disabled={deletingId === c.id}
                      title={`Delete ${c.name}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/60 text-zinc-500 transition-all hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 sm:hidden"
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

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
