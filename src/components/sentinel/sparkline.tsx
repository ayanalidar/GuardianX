"use client";

import { useEffect, useState } from "react";

interface SparklineData {
  days: { date: string; label: string; scans: number; patches: number; findings: number; critical: number }[];
}

interface SparklineProps {
  metric: "scans" | "patches" | "findings" | "critical";
  color: string;
}

export function Sparkline({ metric, color }: SparklineProps) {
  const [data, setData] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/sparklines")
      .then((r) => r.json())
      .then((d: SparklineData) => {
        if (d.days) setData(d.days.map((day) => day[metric]));
      })
      .catch(() => null);
  }, [metric]);

  if (data.length === 0) return null;

  const max = Math.max(...data, 1);
  const width = 60;
  const height = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const colorMap: Record<string, string> = {
    emerald: "#10b981",
    cyan: "#06b6d4",
    amber: "#f59e0b",
    red: "#ef4444",
    violet: "#8b5cf6",
  };
  const stroke = colorMap[color] || "#10b981";
  const lastValue = data[data.length - 1] || 0;

  return (
    <div className="flex items-center gap-1">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 3px ${stroke}80)` }}
        />
        {/* Fill area under the line */}
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={stroke}
          opacity="0.1"
        />
        {/* Last point dot */}
        <circle
          cx={(data.length - 1) / (data.length - 1) * width}
          cy={height - (lastValue / max) * height}
          r="1.5"
          fill={stroke}
        >
          <animate attributeName="r" values="1.5;3;1.5" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

// ── Attack Heatmap Component ────────────────────────────────────────────────
export function AttackHeatmap() {
  const [data, setData] = useState<SparklineData | null>(null);

  useEffect(() => {
    fetch("/api/sparklines")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => null);
  }, []);

  if (!data?.days) return null;

  const allValues = data.days.flatMap((d) => [d.scans, d.patches, d.findings, d.critical]);
  const max = Math.max(...allValues, 1);

  return (
    <div className="holo-card-sharp hud-corners p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="section-header text-xs font-bold text-amber-300">
          <span className="font-mono uppercase tracking-wider">Attack Heatmap</span>
        </h4>
        <span className="font-mono text-[8px] text-zinc-600">7-DAY</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {data.days.map((day, i) => {
          const total = day.scans + day.findings + day.critical;
          const intensity = total / max;
          const bgColor =
            day.critical > 0 ? `rgba(239, 68, 68, ${0.2 + intensity * 0.6})` :
            day.findings > 0 ? `rgba(245, 158, 11, ${0.15 + intensity * 0.5})` :
            day.scans > 0 ? `rgba(6, 182, 212, ${0.1 + intensity * 0.4})` :
            "rgba(39, 39, 42, 0.5)";
          return (
            <div
              key={i}
              className="flex flex-col items-center rounded border border-zinc-800 p-1.5"
              style={{ background: bgColor }}
              title={`${day.label}: ${day.scans} scans, ${day.findings} findings, ${day.critical} critical`}
            >
              <span className="text-[8px] font-mono text-zinc-400">{day.label.slice(0, 2)}</span>
              <span className="text-[10px] font-bold text-zinc-200">{total}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[8px] text-zinc-600">
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-sm bg-cyan-500/60" />SCAN</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-sm bg-amber-500/60" />FINDING</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-sm bg-red-500/60" />CRITICAL</span>
      </div>
    </div>
  );
}
