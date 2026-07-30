"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sentinelApi, type RuntimeStatus } from "@/lib/sentinel/api";
import { Activity, Heart, Shield, ShieldCheck, Skull, Zap } from "lucide-react";

export function RuntimeMonitor() {
  const { toast } = useToast();
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [healing, setHealing] = useState<string | null>(null);

  const load = useCallback(() => {
    sentinelApi.runtimeMonitor().then(setStatus).catch(() => null).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const heal = async (patchId: string) => {
    setHealing(patchId);
    try {
      const r = await sentinelApi.runtimeHeal(patchId);
      toast({ title: "Self-healing complete", description: r.message });
      load();
    } catch (err) {
      toast({ variant: "destructive", title: "Heal failed", description: err instanceof Error ? err.message : "unknown" });
    } finally {
      setHealing(null);
    }
  };

  const healthColor = status?.runtime_health === "secure" ? "#10b981" : status?.runtime_health === "at-risk" ? "#f59e0b" : "#ef4444";

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
          Self-Healing Runtime
        </span>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full pulse-dot" style={{ background: healthColor }} />
          <span className="font-mono text-[9px] uppercase" style={{ color: healthColor }}>
            {status?.runtime_health ?? "—"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-emerald-500/10" />)}
        </div>
      ) : !status || status.monitored_functions === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-zinc-400">
          <Heart className="mr-2 size-4 text-zinc-500" /> No functions monitored.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-emerald-400">{status.healed_functions}</div>
              <div className="text-[9px] uppercase text-zinc-400">Healed</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-red-400">{status.vulnerable_functions}</div>
              <div className="text-[9px] uppercase text-zinc-400">Vulnerable</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="font-mono text-lg font-bold text-amber-400">{status.total_attack_attempts}</div>
              <div className="text-[9px] uppercase text-zinc-400">Attacks</div>
            </div>
          </div>

          {/* Function list */}
          <div className="custom-scrollbar max-h-48 space-y-1.5 overflow-y-auto">
            {status.functions.slice(0, 6).map((f) => (
              <div
                key={f.patch_id}
                className={`flex items-center gap-2 rounded-lg border p-2 ${
                  f.runtime_status === "healed"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                }`}
              >
                {f.runtime_status === "healed" ? (
                  <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Skull className="size-3.5 shrink-0 text-red-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-zinc-300">{f.title}</p>
                  <p className="truncate font-mono text-[9px] text-zinc-500">
                    {f.codebase} · {f.attack_attempts > 0 ? `${f.attack_attempts} attacks` : "no attacks"}
                  </p>
                </div>
                {f.runtime_status === "vulnerable" && (
                  <Button
                    size="sm"
                    onClick={() => heal(f.patch_id)}
                    disabled={healing === f.patch_id}
                    className="h-6 shrink-0 gap-1 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-500"
                  >
                    {healing === f.patch_id ? (
                      <Activity className="size-2.5 animate-pulse" />
                    ) : (
                      <Zap className="size-2.5" />
                    )}
                    Heal
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
