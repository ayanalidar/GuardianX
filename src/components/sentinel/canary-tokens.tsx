"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Bird, Shield, AlertTriangle, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CanaryToken {
  id: string;
  token: string;
  resourceType: string;
  resourceId: string;
  label: string;
  createdAt: string;
  triggeredAt: string | null;
  triggeredBy: string | null;
  triggerSource: string | null;
  isActive: boolean;
}

export function CanaryTokens() {
  const [tokens, setTokens] = useState<CanaryToken[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/canary/list");
      if (res.ok) {
        const data = await res.json();
        setTokens(Array.isArray(data) ? data : data.tokens || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const triggered = tokens.filter(t => t.triggeredAt);
  const active = tokens.filter(t => !t.triggeredAt && t.isActive);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="holo-card-sharp hud-corners relative overflow-hidden p-5">
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="flex size-12 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/10">
              <Bird className="size-6 text-emerald-400" />
            </div>
            <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-500 pulse-dot" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-50"><span className="neon-emerald">CANARY</span> TOKENS</h2>
            <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-500/60">Per-data cryptographic honeypots · Know exactly what leaked</div>
          </div>
        </div>
      </div>

      {triggered.length > 0 && (
        <div className="holo-card-sharp hud-corners border-red-500/40 bg-red-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-400" />
            <span className="font-mono text-xs font-bold text-red-300">⚠ {triggered.length} TRIGGERED CANARY{triggered.length > 1 ? "S" : ""}</span>
          </div>
          <div className="space-y-1">
            {triggered.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs">
                <span className="font-mono text-red-300">{t.label}</span>
                <span className="font-mono text-zinc-500">{t.triggerSource}</span>
                <span className="ml-auto font-mono text-zinc-600">{new Date(t.triggeredAt!).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="font-mono text-lg font-bold text-emerald-400">{active.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Active Tokens</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="font-mono text-lg font-bold text-red-400">{triggered.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Triggered</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="font-mono text-lg font-bold text-cyan-400">{tokens.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total</div>
        </div>
      </div>

      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-emerald-500/60">{"// Canary Tokens"}</div>
        {loading ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            No canary tokens deployed yet. Generate per-data canary tokens to detect exactly which data path leaks.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 ${t.triggeredAt ? "border-red-500/40 bg-red-500/5" : "border-zinc-800 bg-zinc-950/60"}`}>
                <div className="flex-1">
                  <div className="font-mono text-sm text-zinc-200">{t.label}</div>
                  <div className="font-mono text-[10px] text-zinc-500">Type: {t.resourceType}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-zinc-500">{t.token.slice(0, 20)}...</div>
                  <div className="text-[10px] text-zinc-600">{new Date(t.createdAt).toLocaleDateString()}</div>
                </div>
                {t.triggeredAt ? (
                  <Badge className="border-red-500/30 bg-red-500/10 text-red-300 text-[9px]">TRIGGERED</Badge>
                ) : (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[9px]">SAFE</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
