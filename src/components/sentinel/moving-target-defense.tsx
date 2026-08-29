"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, RotateCw, Clock, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SecretRotation {
  id: string;
  name: string;
  type: string;
  lastRotated: string;
  nextRotation: string;
  autoRotate: boolean;
}

export function MovingTargetDefense() {
  const [secrets, setSecrets] = useState<SecretRotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/moving-target/secrets");
      if (res.ok) {
        const data = await res.json();
        setSecrets(Array.isArray(data) ? data : data.secrets || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rotateNow = async () => {
    setRotating(true);
    try {
      await fetch("/api/moving-target/rotate", { method: "POST" });
      load();
    } catch {}
    setRotating(false);
  };

  const nextRotationIn = (nextRotation: string) => {
    const diff = new Date(nextRotation).getTime() - Date.now();
    if (diff <= 0) return "OVERDUE";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="holo-card-sharp hud-corners relative overflow-hidden p-5">
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/10">
                <Shield className="size-6 text-emerald-400" />
              </div>
              <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-500 pulse-dot" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-50"><span className="neon-emerald">MOVING</span> TARGET DEFENSE</h2>
              <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-500/60">Auto-rotating secrets · Credentials are stale within hours</div>
            </div>
          </div>
          <Button onClick={rotateNow} disabled={rotating} className="bg-emerald-600 text-white hover:bg-emerald-500">
            <RotateCw className={`size-3.5 ${rotating ? "animate-spin" : ""}`} /> Rotate Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Secrets Under Rotation" value={secrets.length} color="emerald" />
        <Stat label="Next Rotation" value={secrets.length ? nextRotationIn(secrets[0].nextRotation) : "—"} color="cyan" small />
        <Stat label="Auto-Rotate" value={secrets.filter(s => s.autoRotate).length} color="emerald" />
        <Stat label="Overdue" value={secrets.filter(s => new Date(s.nextRotation) < new Date()).length} color="red" />
      </div>

      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-emerald-500/60">{"// Secrets Schedule"}</div>
        {loading ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
        ) : secrets.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            No secrets under rotation yet. Add your API keys, database URLs, and JWT secrets to auto-rotate them.
          </div>
        ) : (
          <div className="space-y-2">
            {secrets.map((s) => {
              const overdue = new Date(s.nextRotation) < new Date();
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex-1">
                    <div className="font-mono text-sm text-zinc-200">{s.name}</div>
                    <div className="text-[10px] text-zinc-500">Type: {s.type}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-xs ${overdue ? "text-red-400" : "text-emerald-400"}`}>
                      {overdue ? "OVERDUE" : nextRotationIn(s.nextRotation)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Last: {new Date(s.lastRotated).toLocaleDateString()}</div>
                  </div>
                  {s.autoRotate && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[9px]">AUTO</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  const colorMap: Record<string, string> = { emerald: "text-emerald-400", red: "text-red-400", amber: "text-amber-400", cyan: "text-cyan-400" };
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className={`font-mono text-lg font-bold ${colorMap[color] || colorMap.emerald} ${small ? "text-xs" : ""}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}
