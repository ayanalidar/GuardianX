"use client";

// Time-Travel Posture Debugger
// ───────────────────────────────────────────────────────────────────────────
// A full-screen "scrubber" view that lets you rewind the org's security
// posture day-by-day (up to 90 days back) and project forward by approving
// every pending patch.
//
//   ┌─ Header: TIME-TRAVEL POSTURE DEBUGGER + clock icon ─┐
//   ├─ Posture line chart (Recharts) — vertical line at scrubber position
//   ├─ Timeline scrubber (range input) — drag to pick a day
//   ├─ Projection toggle — dashed line extending into "future"
//   └─ Event log (scrollable) — per-day events with commit attribution
//
// Data: GET /api/posture-timeline?days=30
// Dark theme · emerald/cyan accents · hud-corners · mobile-first.
// framer-motion for the scrubber thumb + day card transitions.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FastForward,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types (mirror the API response) ────────────────────────────────────────
interface TimelineEvent {
  type: "scan" | "finding" | "patch" | "approval" | "audit";
  description: string;
  author?: string;
  commitHash?: string;
  severity?: string;
}

interface TimelineDay {
  date: string; // YYYY-MM-DD
  timestamp: number;
  postureScore: number;
  newFindings: number;
  resolvedFindings: number;
  newPatches: number;
  approvedPatches: number;
  newScans: number;
  events: TimelineEvent[];
}

interface TimelineResponse {
  timeline: TimelineDay[];
  currentScore: number;
  projectedScore: number;
  totalFindings: number;
  totalPatches: number;
  pendingPatches: number;
  approvedPatches: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(s: number): string {
  if (s >= 90) return "#10b981"; // emerald
  if (s >= 75) return "#84cc16"; // lime
  if (s >= 60) return "#f59e0b"; // amber
  if (s >= 40) return "#f97316"; // orange
  return "#ef4444"; // red
}

function scoreGrade(s: number): string {
  if (s >= 90) return "A";
  if (s >= 75) return "B";
  if (s >= 60) return "C";
  if (s >= 40) return "D";
  return "F";
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string): string {
  // MM/DD
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

// ── Fetcher ─────────────────────────────────────────────────────────────────
async function fetchTimeline(days: number, signal: AbortSignal): Promise<TimelineResponse> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch(`/api/posture-timeline?days=${days}`, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as TimelineResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.error ?? `Timeline fetch failed (${res.status})`);
  }
  return data;
}

// ── Event row icon ──────────────────────────────────────────────────────────
function EventIcon({ type, severity }: { type: TimelineEvent["type"]; severity?: string }) {
  const base = "size-3.5 shrink-0";
  switch (type) {
    case "scan":
      return <Shield className={`${base} text-cyan-400`} />;
    case "finding": {
      const c =
        severity === "critical"
          ? "#ef4444"
          : severity === "high"
            ? "#f97316"
            : severity === "medium"
              ? "#f59e0b"
              : "#06b6d4";
      return <ShieldAlert className={base} style={{ color: c }} />;
    }
    case "patch":
      return <Zap className={`${base} text-emerald-400`} />;
    case "approval":
      return <CheckCircle2 className={`${base} text-emerald-400`} />;
    case "audit":
      return <GitCommitHorizontal className={`${base} text-zinc-400`} />;
  }
}

// ── Event row ────────────────────────────────────────────────────────────────
function EventRow({ ev }: { ev: TimelineEvent }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="flex items-start gap-2.5 rounded-sm border border-zinc-800/70 bg-zinc-900/40 px-3 py-2 hover:border-emerald-500/30 hover:bg-zinc-900/70"
    >
      <span className="mt-0.5">
        <EventIcon type={ev.type} severity={ev.severity} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-mono text-[11px] leading-snug text-zinc-200">
          {ev.description}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-4 px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
          >
            {ev.type}
          </Badge>
          {ev.severity && (
            <Badge
              variant="outline"
              className="h-4 px-1 font-mono text-[9px] uppercase"
              style={{
                color:
                  ev.severity === "critical"
                    ? "#ef4444"
                    : ev.severity === "high"
                      ? "#f97316"
                      : ev.severity === "medium"
                        ? "#f59e0b"
                        : "#06b6d4",
                borderColor: "currentColor",
              }}
            >
              {ev.severity}
            </Badge>
          )}
          {ev.commitHash && (
            <Badge
              variant="outline"
              className="h-4 gap-1 px-1 font-mono text-[9px] text-cyan-400"
              style={{ borderColor: "#06b6d455", background: "#06b6d408" }}
            >
              <GitCommitHorizontal className="size-2.5" />
              {ev.commitHash.slice(0, 8)}
            </Badge>
          )}
          {ev.author && (
            <span className="font-mono text-[9px] text-zinc-500">· by {ev.author}</span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ── Custom chart tooltip ────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { date: string; score: number; projected?: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded border border-emerald-500/40 bg-zinc-950/95 px-2.5 py-1.5 font-mono text-[10px] shadow-lg">
      <div className="text-zinc-400">{formatDateLabel(p.date)}</div>
      <div className="text-emerald-400">Score: {p.score}</div>
      {p.projected !== undefined && (
        <div className="text-cyan-400">Projected: {p.projected}</div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function TimeTravelDebugger() {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showProjection, setShowProjection] = useState(false);
  const [days, setDays] = useState(30);
  const scrubberRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const d = await fetchTimeline(days, ac.signal);
      setData(d);
      // Default to the last day (today) on first load.
      setSelectedIdx(d.timeline.length - 1);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Failed to load timeline.");
      }
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Chart data ──────────────────────────────────────────────────────────
  // We merge actual + projected scores onto a single chart. The projected
  // value is only attached to the FINAL day's data point so the dashed
  // projection line jumps cleanly from "today" to "projected".
  const chartData = useMemo(() => {
    if (!data) return [];
    const lastIdx = data.timeline.length - 1;
    return data.timeline.map((d, i) => ({
      date: d.date,
      score: d.postureScore,
      // Projected point: same x-position as today, but the y is the projected
      // score. The Line uses `connectNulls` so we only set projected on the
      // last point + a synthetic "tomorrow" point for the dashed segment.
      projected: i === lastIdx ? data.projectedScore : null,
    }));
  }, [data]);

  // Synthetic "tomorrow" point so the dashed projection line extends one
  // step into the future (visually conveys forward-projection).
  const chartDataWithFuture = useMemo(() => {
    if (!data || chartData.length === 0) return chartData;
    const lastDay = data.timeline[data.timeline.length - 1]!;
    const tomorrow = new Date(lastDay.timestamp + 86400_000);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    return [
      ...chartData,
      { date: tomorrowIso, score: null, projected: data.projectedScore },
    ];
  }, [chartData, data]);

  const selectedDay = data?.timeline[selectedIdx] ?? null;
  const selectedScore = selectedDay?.postureScore ?? 0;
  const selectedColor = scoreColor(selectedScore);
  const scrubPct = data && data.timeline.length > 1
    ? (selectedIdx / (data.timeline.length - 1)) * 100
    : 0;

  return (
    <div className="holo-card-sharp hud-corners relative w-full overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10">
            <Clock className="size-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-cyan-400">
              Time-Travel Posture Debugger
            </h2>
            <p className="text-[11px] text-zinc-500">
              Scrub through history · project the future · attribute every change
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge
              variant="outline"
              className="border-zinc-700 font-mono text-[10px] text-zinc-400"
            >
              <Sparkles className="mr-1 size-3 text-cyan-400" />
              {data.timeline.length} days
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="border-cyan-500/30 bg-zinc-900/60 font-mono text-[11px] text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            REFRESH
          </Button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-6 py-10 text-center">
          <AlertTriangle className="size-7 text-rose-400" />
          <p className="font-mono text-sm uppercase tracking-widest text-rose-400">
            Timeline Offline
          </p>
          <p className="max-w-md text-xs text-zinc-500">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-rose-500/40 bg-rose-500/5 font-mono text-[11px] text-rose-300 hover:bg-rose-500/15"
          >
            RETRY
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="flex h-72 flex-col items-center justify-center gap-3">
          <Loader2 className="size-7 animate-spin text-cyan-400" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-400/80">
            Replaying timeline…
          </span>
        </div>
      ) : data && data.timeline.length > 0 ? (
        <div className="space-y-4">
          {/* ── Day picker badges ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[7, 14, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  days === d
                    ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                    : "border-zinc-700 bg-zinc-900/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* ── Posture chart ───────────────────────────────────────────── */}
          <div className="relative h-[220px] w-full overflow-hidden rounded-md border border-zinc-800 bg-gradient-to-b from-zinc-950 via-zinc-900/40 to-zinc-950 sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={showProjection ? chartDataWithFuture : chartData}
                margin={{ top: 12, right: 12, bottom: 4, left: -16 }}
              >
                <defs>
                  <linearGradient id="scoreLine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  domain={[0, 100]}
                  tickCount={6}
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "rgba(16,185,129,0.3)", strokeWidth: 1 }}
                />
                {/* ReferenceLine at the scrubber position */}
                <ReferenceLine
                  x={selectedDay?.date}
                  stroke={selectedColor}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  label={{
                    value: `${selectedScore}`,
                    fill: selectedColor,
                    fontSize: 10,
                    fontFamily: "monospace",
                    position: "top",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="url(#scoreLine)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#10b981", stroke: "#10b981" }}
                  isAnimationActive
                  animationDuration={700}
                  connectNulls
                />
                {showProjection && (
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: "#06b6d4" }}
                    isAnimationActive
                    animationDuration={500}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            {/* corner ticks */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 top-0 size-3 border-l border-t border-cyan-500/40" />
              <div className="absolute right-0 top-0 size-3 border-r border-t border-cyan-500/40" />
              <div className="absolute bottom-0 left-0 size-3 border-b border-l border-cyan-500/40" />
              <div className="absolute bottom-0 right-0 size-3 border-b border-r border-cyan-500/40" />
            </div>
          </div>

          {/* ── Scrubber ──────────────────────────────────────────────── */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5 text-zinc-500" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  Scrubber
                </span>
              </div>
              <div className="flex items-center gap-3">
                <motion.div
                  key={selectedDay?.date}
                  initial={{ opacity: 0.4, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className="flex items-baseline gap-2"
                >
                  <span className="font-mono text-[11px] text-zinc-400">
                    {selectedDay ? formatDateLabel(selectedDay.date) : "—"}
                  </span>
                  <span
                    className="font-mono text-xl font-bold tabular-nums sm:text-2xl"
                    style={{
                      color: selectedColor,
                      textShadow: `0 0 10px ${selectedColor}80`,
                    }}
                  >
                    {selectedScore}
                    <span className="ml-0.5 text-xs text-zinc-500">
                      /{scoreGrade(selectedScore)}
                    </span>
                  </span>
                </motion.div>
              </div>
            </div>

            <div className="relative pb-2">
              {/* Track background */}
              <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-emerald-500/30" />
              {/* Filled track up to scrubber */}
              <div
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                style={{ width: `${scrubPct}%` }}
              />
              {/* Animated thumb marker */}
              <motion.div
                className="pointer-events-none absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-300 bg-zinc-950 shadow-[0_0_12px_rgba(6,182,212,0.8)]"
                animate={{ left: `${scrubPct}%` }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              />
              <input
                ref={scrubberRef}
                type="range"
                min={0}
                max={data.timeline.length - 1}
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(parseInt(e.target.value, 10))}
                className="relative z-20 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent"
                aria-label="Timeline scrubber"
              />
            </div>

            <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-600">
              <span>
                {formatDateLabel(data.timeline[0]!.date)}
              </span>
              <span>today</span>
            </div>
          </div>

          {/* ── Score summary + projection ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreStat label="Current" value={data.currentScore} color={scoreColor(data.currentScore)} />
            <ScoreStat label="Pending" value={data.pendingPatches} color="#f59e0b" suffix=" patches" />
            <ScoreStat label="Approved" value={data.approvedPatches} color="#10b981" suffix=" patches" />
            <ScoreStat label="Findings" value={data.totalFindings} color="#06b6d4" suffix=" total" />
          </div>

          {/* Projection toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-500/25 bg-cyan-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <FastForward className="size-4 text-cyan-400" />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-cyan-400">
                  Project Forward
                </p>
                <p className="text-[10px] text-zinc-500">
                  {data.pendingPatches > 0
                    ? `Approve all ${data.pendingPatches} pending patches → projected posture ${data.projectedScore} (+${Math.max(0, data.projectedScore - data.currentScore)})`
                    : "No pending patches — posture is already at its projected ceiling."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProjection((s) => !s)}
              className={`border-cyan-500/40 bg-zinc-900/60 font-mono text-[11px] ${
                showProjection
                  ? "text-cyan-200 hover:bg-cyan-500/20"
                  : "text-cyan-400 hover:bg-cyan-500/10"
              }`}
            >
              <FastForward className="size-3.5" />
              {showProjection ? "HIDE PROJECTION" : "SHOW PROJECTION"}
            </Button>
          </div>

          {/* ── Event log ──────────────────────────────────────────────── */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5 text-emerald-400" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                  Event Log
                </span>
              </div>
              <span className="font-mono text-[10px] text-zinc-500">
                {selectedDay
                  ? `${selectedDay.events.length} events · ${selectedDay.newFindings} new findings · ${selectedDay.approvedPatches} approved`
                  : "—"}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-width]:6px">
              <AnimatePresence mode="popLayout">
                {selectedDay && selectedDay.events.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {selectedDay.events.map((ev, i) => (
                      <EventRow key={`${ev.type}-${i}`} ev={ev} />
                    ))}
                  </ul>
                ) : (
                  <div className="px-4 py-8 text-center text-xs text-zinc-600">
                    No notable events on this day.
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center">
          <Clock className="size-8 text-cyan-400/50" />
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">
            Empty Timeline
          </p>
          <p className="max-w-md text-[11px] text-zinc-600">
            Run scans + generate patches to populate your posture history.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Small score stat tile ───────────────────────────────────────────────────
function ScoreStat({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div
      className="rounded-md border bg-zinc-900/40 px-3 py-2"
      style={{ borderColor: `${color}33` }}
    >
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p
        className="font-mono text-lg font-bold tabular-nums"
        style={{ color, textShadow: `0 0 8px ${color}55` }}
      >
        {value}
        {suffix && <span className="ml-1 text-[10px] text-zinc-500">{suffix}</span>}
      </p>
    </div>
  );
}

export default TimeTravelDebugger;
