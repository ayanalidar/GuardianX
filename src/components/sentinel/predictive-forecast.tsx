"use client";

// Predictive Threat Forecast — AI-powered widget that forecasts the next
// likely attack vectors based on recent scans + findings. Renders as a
// 6-axis radar chart with a confidence count-up header and AI-generated
// prose explanation below.
//
// Auto-refreshes every 60s. Shows a loading skeleton on first load and an
// error state with retry on failure. Dark theme (bg-zinc-950, emerald/cyan/
// amber accents), holo-card-sharp + hud-corners + neon-emerald.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Brain, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ForecastData {
  scores: {
    web: number;
    api: number;
    auth: number;
    crypto: number;
    infra: number;
    supply_chain: number;
  };
  top_3: Array<{ vector: string; likelihood: number; reasoning: string }>;
  confidence: number;
  generatedAt: string;
}

const AXES: Array<{ key: keyof ForecastData["scores"]; label: string }> = [
  { key: "web", label: "Web App" },
  { key: "api", label: "API" },
  { key: "auth", label: "Auth" },
  { key: "crypto", label: "Crypto" },
  { key: "infra", label: "Infra" },
  { key: "supply_chain", label: "Supply Chain" },
];

function confidenceColor(c: number): string {
  if (c >= 75) return "#10b981"; // emerald
  if (c >= 50) return "#06b6d4"; // cyan
  if (c >= 30) return "#f59e0b"; // amber
  return "#f43f5e"; // rose
}

// ── Count-up hook (animated number ticker) ─────────────────────────────────
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

async function fetchForecast(signal: AbortSignal): Promise<ForecastData> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/predictive-forecast", {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as ForecastData & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? `Forecast failed (${res.status})`);
  }
  return data;
}

export function PredictiveForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const d = await fetchForecast(ac.signal);
      setData(d);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Forecast failed.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const confidence = data?.confidence ?? 0;
  const confAnimated = useCountUp(confidence);
  const confColor = confidenceColor(confidence);

  const chartData = data
    ? AXES.map((a) => ({ axis: a.label, value: data.scores[a.key] ?? 0 }))
    : AXES.map((a) => ({ axis: a.label, value: 0 }));

  return (
    <div className="holo-card-sharp hud-corners relative w-full overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
            <Brain className="size-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-400">
              Predictive Threat Forecast
            </h2>
            <p className="text-[11px] text-zinc-500">
              AI-predicted next attack vectors · refreshes every 60s
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="border-emerald-500/30 bg-zinc-900/60 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          REFRESH
        </Button>
      </div>

      {/* Confidence banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="mb-4 flex items-center justify-between gap-4 rounded-md border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent px-4 py-3 sm:mb-6"
      >
        <div className="flex items-center gap-3">
          <Sparkles className="size-4 text-emerald-400" style={{ filter: `drop-shadow(0 0 6px ${confColor})` }} />
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            Forecast Confidence
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          {loading && !data ? (
            <Skeleton className="h-8 w-20 bg-emerald-500/20" />
          ) : (
            <span
              className="font-mono text-3xl font-bold tabular-nums sm:text-4xl"
              style={{ color: confColor, textShadow: `0 0 12px ${confColor}80, 0 0 24px ${confColor}40` }}
            >
              {confAnimated}
              <span className="text-lg">%</span>
            </span>
          )}
        </div>
      </motion.div>

      {/* Body: chart + prose, stacked on mobile, side-by-side on desktop */}
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Radar chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
            className="relative aspect-square w-full max-w-[360px] justify-self-center"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="72%">
                <PolarGrid
                  stroke="rgba(16,185,129,0.18)"
                  strokeDasharray="2 3"
                />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tickCount={5}
                  tick={{ fill: "#52525b", fontSize: 9 }}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Radar
                  name="Likelihood"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="#10b981"
                  fillOpacity={0.25}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                  dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }}
                />
              </RadarChart>
            </ResponsiveContainer>
            {/* corner ticks */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 top-0 size-3 border-l border-t border-emerald-500/40" />
              <div className="absolute right-0 top-0 size-3 border-r border-t border-emerald-500/40" />
              <div className="absolute bottom-0 left-0 size-3 border-b border-l border-emerald-500/40" />
              <div className="absolute bottom-0 right-0 size-3 border-b border-r border-emerald-500/40" />
            </div>
          </motion.div>

          {/* Top 3 predictions prose */}
          <div className="flex flex-col gap-3">
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="size-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-400">
                Top 3 Predicted Vectors
              </span>
            </div>
            {data.top_3.length === 0 ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-4 text-center text-xs text-zinc-500">
                No predictions available — run scans to enable forecasting.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.top_3.map((p, i) => {
                  const c = confidenceColor(p.likelihood);
                  return (
                    <motion.div
                      key={`${p.vector}-${i}`}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 22,
                        delay: 0.1 + i * 0.12,
                      }}
                      className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex size-5 items-center justify-center rounded-sm font-mono text-[10px] font-bold"
                            style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-zinc-200">
                            {p.vector}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-current font-mono text-[10px]"
                          style={{ color: c, borderColor: `${c}55`, background: `${c}10` }}
                        >
                          {p.likelihood}% likelihood
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-400">
                        {p.reasoning}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
            {data.generatedAt && (
              <div className="mt-1 text-right font-mono text-[10px] text-zinc-600">
                Generated {new Date(data.generatedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Skeleton className="aspect-square w-full max-w-[360px] justify-self-center rounded-full bg-emerald-500/10" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md bg-emerald-500/10" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-rose-400" />
      <div>
        <p className="font-mono text-sm font-bold uppercase tracking-widest text-rose-400">
          Forecast Offline
        </p>
        <p className="mt-1 max-w-md text-xs text-zinc-500">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="border-rose-500/40 bg-rose-500/5 font-mono text-[11px] text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
      >
        <RefreshCw className="size-3.5" />
        RETRY FORECAST
      </Button>
    </div>
  );
}

export default PredictiveForecast;
