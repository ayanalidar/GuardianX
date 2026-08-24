"use client";

/**
 * ImmersiveView
 * -------------
 * A fullscreen overlay that puts the AI visualizer front-and-center for
 * wall projection / SOC monitoring. Toggles between the CircuitBoard and
 * NeuralLink visualizations, and overlays:
 *   - scan progress (driven by SignalBus events)
 *   - live findings feed (recent SignalBus events)
 *   - AI status (current visualizer state + a short prose label)
 *
 * Mounted by Command Center via the "Immersive View" button.
 * Press ESC or click Exit to close.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Cpu, Brain, Activity, Zap, AlertTriangle, ShieldCheck } from "lucide-react";
import { CircuitBoard } from "./circuit-board";
import { NeuralLink } from "./neural-link";
import { useSignalBus, type VisualizerEvent } from "./signal-bus";

interface ImmersiveViewProps {
  open: boolean;
  onClose: () => void;
}

type ViewKind = "circuit" | "neural";

const STATE_PROSE: Record<string, string> = {
  idle: "Standing watch. No active scans. The grid is calm.",
  scanning: "Scanning codebases for vulnerabilities. Pulses flowing outward.",
  analyzing: "Adversarial AI is reasoning about exploits. The board is amped up.",
  finding: "Critical finding detected. Red wash — take action.",
  patching: "Patches flowing through the pipeline. Components healing green.",
};

function EventRow({ e }: { e: VisualizerEvent }) {
  const sevColor =
    e.severity === "error" ? "text-red-400" :
    e.severity === "warning" ? "text-amber-400" :
    e.severity === "success" ? "text-emerald-400" :
    "text-cyan-400";
  const sevLabel =
    e.severity === "error" ? "ERR" :
    e.severity === "warning" ? "WRN" :
    e.severity === "success" ? "OK " :
    "INF";
  const time = new Date(e.ts).toLocaleTimeString("en-US", { hour12: false });
  return (
    <div className="flex items-start gap-2 rounded px-1.5 py-1 font-mono text-[11px]">
      <span className="shrink-0 text-zinc-600">{time}</span>
      <span className={`shrink-0 font-bold ${sevColor}`}>{sevLabel}</span>
      <span className="min-w-0 flex-1 text-zinc-300">{e.message}</span>
    </div>
  );
}

export function ImmersiveView({ open, onClose }: ImmersiveViewProps) {
  const { state, events } = useSignalBus();
  const [view, setView] = useState<ViewKind>("circuit");

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "v" || e.key === "V") setView((v) => (v === "circuit" ? "neural" : "circuit"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const findingCount = events.filter((e) => e.type === "finding_found").length;
  const patchCount = events.filter((e) => e.type === "patch_generated" || e.type === "patch_approved").length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[200] bg-zinc-950/98 overflow-hidden"
      >
        {/* Visualizer fills the screen */}
        <div className="absolute inset-0">
          {view === "circuit" ? <CircuitBoard showHud opacity={1} /> : <NeuralLink showChrome opacity={1} />}
        </div>

        {/* Top-left brand + view switcher */}
        <div className="absolute left-6 top-6 z-20 flex items-center gap-3">
          <div className="flex rounded-lg border border-emerald-500/40 bg-zinc-950/80 p-1 backdrop-blur">
            <button
              onClick={() => setView("circuit")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                view === "circuit" ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Cpu className="size-3" /> Circuit
            </button>
            <button
              onClick={() => setView("neural")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                view === "neural" ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Brain className="size-3" /> Neural
            </button>
          </div>
        </div>

        {/* Top-right exit */}
        <div className="absolute right-6 top-6 z-20">
          <Button variant="outline" onClick={onClose} className="border-red-500/40 bg-zinc-950/80 text-red-300 hover:bg-red-500/10">
            <X className="size-4" /> Exit (ESC)
          </Button>
        </div>

        {/* Bottom-left AI status panel */}
        <div className="absolute bottom-6 left-6 z-20 w-80 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 backdrop-blur-xl">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-4 text-emerald-400" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">AI STATUS</span>
          </div>
          <div className={`text-2xl font-bold tracking-wide ${
            state === "finding" ? "text-red-400" :
            state === "patching" ? "text-emerald-400" :
            state === "analyzing" ? "text-amber-400" :
            state === "scanning" ? "text-cyan-400" :
            "text-zinc-300"
          }`}>
            {state.toUpperCase()}
          </div>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
            {STATE_PROSE[state]}
          </p>
        </div>

        {/* Bottom-right findings + patches + live feed */}
        <div className="absolute bottom-6 right-6 z-20 w-96 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">LIVE FEED</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="size-3" /> {findingCount}
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="size-3" /> {patchCount}
              </span>
              <span className="flex items-center gap-1 text-cyan-400">
                <Zap className="size-3" /> {events.length}
              </span>
            </div>
          </div>
          <div className="custom-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
            {events.length === 0 ? (
              <div className="py-6 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                Waiting for engine events…
              </div>
            ) : (
              events.slice(0, 30).map((e) => <EventRow key={e.id} e={e} />)
            )}
          </div>
        </div>

        {/* Bottom-center hint */}
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
          <div className="rounded-full border border-zinc-700/50 bg-zinc-950/60 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500 backdrop-blur">
            V — switch view · ESC — exit · ideal for wall projection
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
