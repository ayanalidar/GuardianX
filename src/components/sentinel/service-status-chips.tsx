"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, Crosshair, ShieldCheck, Loader2 } from "lucide-react";

interface RunningService {
  id: string;
  type: string;
  client: string;
  target: string;
  status: string;
  stage: string | null;
  duration: string;
}

export function ServiceStatusChips() {
  const [services, setServices] = useState<RunningService[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const load = () => {
      fetch("/api/service-status")
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) {
            setServices(d.running || []);
            setPendingCount(d.pending_patches || 0);
          }
        })
        .catch(() => null);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (services.length === 0 && pendingCount === 0) return null;

  return (
    <div className="holo-card-sharp hud-corners flex flex-wrap items-center gap-2 p-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{"// Running:"}</span>
      <AnimatePresence mode="popLayout">
        {services.map((s) => {
          const isSAST = s.type === "SAST";
          const Icon = isSAST ? Bug : Crosshair;
          const color = isSAST ? "cyan" : "red";
          const colorMap = {
            cyan: { text: "text-cyan-400", border: "border-cyan-500/30", bg: "bg-cyan-500/5" },
            red: { text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5" },
          };
          const cfg = colorMap[color as keyof typeof colorMap];
          return (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`inline-flex items-center gap-1.5 rounded-full border ${cfg.border} ${cfg.bg} px-2.5 py-1 text-[10px]`}
            >
              <Icon className={`size-3 ${cfg.text} animate-pulse`} />
              <span className={cfg.text}>{s.type}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{s.client}</span>
              <span className="text-zinc-600">{s.duration}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {pendingCount > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-[10px]">
          <ShieldCheck className="size-3 text-amber-400" />
          <span className="text-amber-400">{pendingCount} pending review</span>
        </div>
      )}
    </div>
  );
}
