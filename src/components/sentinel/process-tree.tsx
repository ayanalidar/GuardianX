"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bug, Crosshair, ShieldCheck, Server, Cpu } from "lucide-react";

interface Process {
  pid: string;
  name: string;
  type: "sast" | "dast" | "patch" | "system";
  status: "running" | "queued" | "idle";
  cpu: number;
  memory: number;
  stage: string;
  client: string;
  target: string;
  duration: string;
}

interface ProcessTreeData {
  processes: Process[];
  summary: { total: number; running: number; queued: number; idle: number; total_cpu: number; total_memory: number };
}

const TYPE_ICONS = { sast: Bug, dast: Crosshair, patch: ShieldCheck, system: Server };
const TYPE_COLORS = {
  sast: { text: "text-cyan-400", border: "border-cyan-500/30", bg: "bg-cyan-500/5" },
  dast: { text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5" },
  patch: { text: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/5" },
  system: { text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5" },
};

export function ProcessTree() {
  const [data, setData] = useState<ProcessTreeData | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/process-tree")
        .then((r) => r.json())
        .then((d) => { if (!d.error) setData(d); })
        .catch(() => null);
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  return (
    <div className="holo-card-sharp hud-corners p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-header text-sm font-bold text-emerald-300">
          <Cpu className="inline size-4 mr-1" />
          PROCESS TREE
        </h3>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="text-emerald-400">CPU: {data.summary.total_cpu}%</span>
          <span className="text-cyan-400">MEM: {data.summary.total_memory}MB</span>
          <span className="text-zinc-500">{data.summary.running} run / {data.summary.queued} queue / {data.summary.idle} idle</span>
        </div>
      </div>

      {/* Header row */}
      <div className="mb-1 grid grid-cols-[80px_60px_1fr_60px_60px_60px] gap-2 border-b border-zinc-800 pb-1 font-mono text-[8px] uppercase tracking-wider text-zinc-600">
        <span>PID</span>
        <span>TYPE</span>
        <span>STAGE / CLIENT</span>
        <span className="text-right">CPU</span>
        <span className="text-right">MEM</span>
        <span className="text-right">TIME</span>
      </div>

      {/* Process rows */}
      <div className="space-y-0.5 font-mono text-[11px]">
        {data.processes.map((p) => {
          const cfg = TYPE_COLORS[p.type];
          const Icon = TYPE_ICONS[p.type];
          return (
            <motion.div
              key={p.pid}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`grid grid-cols-[80px_60px_1fr_60px_60px_60px] items-center gap-2 rounded px-1 py-0.5 ${cfg.bg} ${cfg.border} border`}
            >
              <span className="truncate text-zinc-500">{p.pid}</span>
              <span className={`flex items-center gap-1 ${cfg.text}`}>
                <Icon className={`size-2.5 ${p.status === "running" ? "animate-pulse" : ""}`} />
                {p.type.toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-zinc-300">
                <span className="text-zinc-500">[{p.client}]</span> {p.stage}
              </span>
              {/* CPU bar */}
              <span className="flex items-center justify-end gap-1">
                <div className="hidden h-1.5 w-8 overflow-hidden rounded-full bg-zinc-800 sm:block">
                  <div
                    className={`h-full rounded-full ${p.cpu > 50 ? "bg-red-500" : p.cpu > 20 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(p.cpu, 100)}%` }}
                  />
                </div>
                <span className={p.cpu > 50 ? "text-red-400" : "text-zinc-400"}>{p.cpu.toFixed(1)}</span>
              </span>
              <span className="text-right text-zinc-500">{p.memory}M</span>
              <span className="text-right text-zinc-600">{p.duration}</span>
            </motion.div>
          );
        })}
      </div>

      {data.processes.length === 0 && (
        <div className="py-4 text-center font-mono text-xs text-zinc-600">
          No processes running — all systems idle
        </div>
      )}
    </div>
  );
}
