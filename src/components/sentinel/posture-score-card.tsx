"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { sentinelApi, type PostureScore } from "@/lib/sentinel/api";
import { ShieldCheck } from "lucide-react";

export function PostureScoreCard() {
  const [score, setScore] = useState<PostureScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => {
      sentinelApi.postureScore().then((s) => {
        if (active) { setScore(s); setLoading(false); }
      }).catch(() => active && setLoading(false));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const overall = score?.overall ?? 0;
  const grade = score?.overall_grade ?? "-";
  const color = overall >= 90 ? "#10b981" : overall >= 75 ? "#84cc16" : overall >= 60 ? "#f59e0b" : overall >= 40 ? "#f97316" : "#ef4444";
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (overall / 100) * circumference;

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
          Posture Score
        </span>
        <ShieldCheck className="size-3.5 text-emerald-400/50" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Skeleton className="size-24 rounded-full bg-emerald-500/20" />
        </div>
      ) : (
        <div className="flex items-center gap-4">
          {/* Circular gauge */}
          <div className="relative size-24 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(16,185,129,0.1)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 4px ${color})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold neon-emerald" style={{ color }}>{overall}</span>
              <span className="text-xs font-mono" style={{ color }}>{grade}</span>
            </div>
          </div>
          {/* Per-codebase breakdown */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {score?.codebases.slice(0, 4).map((cb) => (
              <div key={cb.codebase_id} className="flex items-center gap-2">
                <span className="truncate font-mono text-[10px] text-zinc-400">{cb.codebase_name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${cb.score}%`, background: cb.color }} />
                </div>
                <span className="shrink-0 font-mono text-[10px] font-bold" style={{ color: cb.color }}>{cb.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
