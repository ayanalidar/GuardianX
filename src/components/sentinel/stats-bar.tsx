"use client";

import { Card } from "@/components/ui/card";
import {
  Clock,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Database,
} from "lucide-react";
import type { PatchStats } from "@/lib/sentinel/api";

interface StatsBarProps {
  stats: PatchStats | null;
  loading?: boolean;
}

interface StatDef {
  key: keyof PatchStats;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconWrap: string;
}

const STATS: StatDef[] = [
  {
    key: "pending",
    label: "Pending Review",
    icon: Clock,
    accent: "text-amber-300",
    iconWrap: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  },
  {
    key: "critical_pending",
    label: "Critical Pending",
    icon: ShieldAlert,
    accent: "text-red-300",
    iconWrap: "bg-red-500/10 border-red-500/30 text-red-400",
  },
  {
    key: "approved",
    label: "Approved",
    icon: ShieldCheck,
    accent: "text-emerald-300",
    iconWrap: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: ShieldX,
    accent: "text-zinc-300",
    iconWrap: "bg-zinc-500/10 border-zinc-500/30 text-zinc-400",
  },
  {
    key: "codebases",
    label: "Codebases",
    icon: Database,
    accent: "text-sky-300",
    iconWrap: "bg-sky-500/10 border-sky-500/30 text-sky-400",
  },
];

export function StatsBar({ stats, loading }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      {STATS.map((s) => {
        const value = stats ? stats[s.key] : null;
        return (
          <Card
            key={s.key}
            className="holo-card hud-corners gap-0 rounded-lg py-4"
          >
            <div className="flex items-center gap-3 px-4">
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${s.iconWrap}`}
              >
                <s.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {s.label}
                </div>
                <div
                  className={`text-2xl font-bold tabular-nums ${s.accent} neon-emerald`}
                >
                  {loading || value === null ? (
                    <span className="inline-block h-6 w-6 animate-pulse rounded bg-emerald-500/20" />
                  ) : (
                    value
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
