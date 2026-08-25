"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  AnimatePresence,
} from "framer-motion";
import {
  ArrowUp,
  Bug,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Zap,
} from "lucide-react";
import { CircuitBoard } from "../ai-visualizer";

/**
 * RecentScansCard
 * ---------------
 * Cinematic "LIVE SCAN FEED" panel. Streams the most recent public
 * scans from `GET /api/public-scan/recent?limit=20`, rendered as a
 * continuous right-to-left marquee of glass cards on top of the
 * CircuitBoard canvas (dimmed to 25% opacity) — visually matching the
 * Command Center background.
 *
 * Visual language:
 *   - Dark glass cards: bg-zinc-950/80 + backdrop-blur + holo-card-sharp
 *   - HUD corner brackets (hud-corners token)
 *   - Emerald accents, NO indigo/blue
 *   - Score color coding: 90+ emerald, 70-89 amber, 50-69 orange, <50 red
 *   - Severity distribution bar: critical=red, high=amber, medium=yellow,
 *     low=sky, info=zinc
 *
 * Behaviour:
 *   - Refetches every 30s (live)
 *   - Marquee pauses on hover
 *   - Marquee track is duplicated for seamless right-to-left scroll
 *   - Respects prefers-reduced-motion (renders a static grid)
 *   - Empty state: "Be the first to scan" with arrow up to ScanWidget
 *   - Loading state: 5 shimmering skeleton cards
 *
 * The component is self-contained — no props. Fetches its own data.
 */

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface RecentScan {
  id: string;
  url: string;
  score: number;
  findingsCount: number;
  severityCounts: Record<Severity, number>;
  createdAt: string;
}

interface RecentScansPayload {
  scans: RecentScan[];
  total: number;
}

const POLL_INTERVAL_MS = 30_000;
const MARQUEE_DURATION_SEC = 36; // one full track pass

const SCORE_META: Record<
  string,
  { text: string; ring: string; bg: string; bar: string; label: string }
> = {
  strong: { text: "text-emerald-300", ring: "ring-emerald-500/50", bg: "bg-emerald-500/10", bar: "bg-emerald-500", label: "STRONG" },
  fair: { text: "text-amber-300", ring: "ring-amber-500/50", bg: "bg-amber-500/10", bar: "bg-amber-500", label: "FAIR" },
  weak: { text: "text-orange-300", ring: "ring-orange-500/50", bg: "bg-orange-500/10", bar: "bg-orange-500", label: "WEAK" },
  critical: { text: "text-red-300", ring: "ring-red-500/50", bg: "bg-red-500/10", bar: "bg-red-500", label: "CRITICAL" },
};

function scoreBucket(score: number): keyof typeof SCORE_META {
  if (score >= 90) return "strong";
  if (score >= 70) return "fair";
  if (score >= 50) return "weak";
  return "critical";
}

const SEV_BAR_COLOR: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-yellow-400",
  low: "bg-sky-500",
  info: "bg-zinc-500",
};

const SEV_LABEL: Record<Severity, string> = {
  critical: "C",
  high: "H",
  medium: "M",
  low: "L",
  info: "I",
};

function truncateUrl(raw: string, max = 28): string {
  let u = raw.trim();
  if (!u) return "—";
  // Strip scheme + www for compactness.
  u = u.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  // Strip path if the host alone is already long.
  if (u.length > max) {
    const slash = u.indexOf("/");
    if (slash > 0 && slash <= max) u = u.slice(0, slash);
  }
  if (u.length <= max) return u;
  return u.slice(0, max - 1) + "…";
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Defensive parser — accepts both `{scans, total}` and a bare array. */
function parsePayload(data: unknown): RecentScansPayload {
  const empty: RecentScansPayload = { scans: [], total: 0 };
  if (!data) return empty;
  if (Array.isArray(data)) {
    return { scans: data.map(parseScan).filter(Boolean) as RecentScan[], total: data.length };
  }
  if (typeof data !== "object") return empty;
  const obj = data as Record<string, unknown>;
  const scansRaw = Array.isArray(obj.scans) ? obj.scans : Array.isArray(obj.recent) ? obj.recent : [];
  const scans = scansRaw.map(parseScan).filter(Boolean) as RecentScan[];
  const total =
    typeof obj.total === "number" && Number.isFinite(obj.total)
      ? obj.total
      : typeof obj.count === "number" && Number.isFinite(obj.count)
      ? obj.count
      : scans.length;
  return { scans, total };
}

function parseScan(raw: unknown): RecentScan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const score =
    typeof o.score === "number" && Number.isFinite(o.score)
      ? Math.max(0, Math.min(100, o.score))
      : 0;
  const severityCounts = readSeverityCounts(o);
  const findingsCount =
    typeof o.findingsCount === "number" && Number.isFinite(o.findingsCount)
      ? o.findingsCount
      : Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const createdAt =
    typeof o.createdAt === "string"
      ? o.createdAt
      : typeof o.completedAt === "string"
      ? o.completedAt
      : typeof o.created_at === "string"
      ? o.created_at
      : new Date().toISOString();
  return {
    id: String(o.id ?? `${o.url ?? "scan"}-${createdAt}`),
    url: String(o.url ?? "—"),
    score,
    findingsCount,
    severityCounts,
    createdAt,
  };
}

function readSeverityCounts(o: Record<string, unknown>): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  // Try flat fields: criticalCount, highCount, etc.
  (["critical", "high", "medium", "low", "info"] as Severity[]).forEach((sev) => {
    const flat = o[`${sev}Count`];
    if (typeof flat === "number" && Number.isFinite(flat)) out[sev] = Math.max(0, Math.floor(flat));
  });
  // Try nested: severityCounts / severityDistribution
  const nested =
    (o.severityCounts as Record<string, unknown> | undefined) ??
    (o.severityDistribution as Record<string, unknown> | undefined) ??
    (o.counts as Record<string, unknown> | undefined);
  if (nested && typeof nested === "object") {
    (["critical", "high", "medium", "low", "info"] as Severity[]).forEach((sev) => {
      const v = nested[sev] ?? nested[`${sev}Count`];
      if (typeof v === "number" && Number.isFinite(v)) out[sev] = Math.max(0, Math.floor(v));
    });
  }
  // If we still have nothing but a findings array, count by severity.
  if (
    out.critical + out.high + out.medium + out.low + out.info === 0 &&
    Array.isArray(o.findings)
  ) {
    for (const f of o.findings as unknown[]) {
      if (!f || typeof f !== "object") continue;
      const sev = String((f as Record<string, unknown>).severity ?? "info").toLowerCase() as Severity;
      if (sev in out) out[sev]++;
    }
  }
  return out;
}

function SeverityBar({ counts }: { counts: Record<Severity, number> }) {
  const total = counts.critical + counts.high + counts.medium + counts.low + counts.info;
  if (total === 0) {
    return (
      <div className="flex h-1.5 items-center gap-1">
        <div className="h-1.5 w-full rounded-sm bg-zinc-800" />
      </div>
    );
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900">
      {(["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => {
        const n = counts[sev];
        if (n === 0) return null;
        const pct = (n / total) * 100;
        return (
          <div
            key={sev}
            className={`h-full ${SEV_BAR_COLOR[sev]}`}
            style={{ width: `${pct}%` }}
            title={`${sev}: ${n}`}
          />
        );
      })}
    </div>
  );
}

function ScanCard({ scan }: { scan: RecentScan }) {
  const bucket = scoreBucket(scan.score);
  const meta = SCORE_META[bucket];
  const criticalCount = scan.severityCounts.critical;

  return (
    <div className="holo-card-sharp hud-corners group relative w-[280px] shrink-0 overflow-hidden rounded-lg border border-emerald-500/20 bg-zinc-950/80 p-3 backdrop-blur transition-all hover:border-emerald-500/50 hover:shadow-[0_0_24px_rgba(16,185,129,0.22)] sm:w-[220px] lg:w-[200px]">
      {/* Top row: URL + score */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-emerald-500/60">
            <Globe className="size-2.5" /> target
          </div>
          <div
            className="truncate font-mono text-xs text-zinc-200"
            title={scan.url}
          >
            {truncateUrl(scan.url)}
          </div>
        </div>
        <div
          className={`flex flex-col items-end rounded-md ring-1 ${meta.ring} ${meta.bg} px-2 py-1`}
        >
          <span className={`font-mono text-2xl font-bold leading-none tabular-nums ${meta.text}`}>
            {Math.round(scan.score)}
          </span>
          <span className="mt-0.5 font-mono text-[7px] uppercase tracking-widest text-zinc-500">
            {meta.label}
          </span>
        </div>
      </div>

      {/* Findings + critical badge */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
          <Bug className="size-3 text-zinc-500" />
          <span className="tabular-nums text-zinc-300">{scan.findingsCount}</span>
          <span className="text-zinc-600">findings</span>
        </div>
        {criticalCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-red-300">
            <Skull className="size-2.5" />
            {criticalCount} crit
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-300/80">
            <ShieldCheck className="size-2.5" /> clean
          </span>
        )}
      </div>

      {/* Severity distribution bar */}
      <div className="mb-2">
        <SeverityBar counts={scan.severityCounts} />
      </div>

      {/* Severity legend + time */}
      <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-widest text-zinc-600">
        <div className="flex items-center gap-1">
          {(["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => (
            <span key={sev} className="flex items-center gap-0.5" title={`${sev}: ${scan.severityCounts[sev]}`}>
              <span className={`size-1.5 rounded-sm ${SEV_BAR_COLOR[sev]}`} />
              <span className="text-zinc-600">{SEV_LABEL[sev]}</span>
            </span>
          ))}
        </div>
        <span className="tabular-nums text-zinc-500">{timeAgo(scan.createdAt)}</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="w-[280px] shrink-0 rounded-lg border border-emerald-500/10 bg-zinc-950/60 p-3 sm:w-[220px] lg:w-[200px]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1.5">
          <div className="h-2 w-12 animate-pulse rounded bg-zinc-800" />
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="size-10 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="mb-2 h-3 w-20 animate-pulse rounded bg-zinc-800" />
      <div className="mb-2 h-1.5 w-full animate-pulse rounded bg-zinc-800" />
      <div className="flex items-center justify-between">
        <div className="h-2 w-16 animate-pulse rounded bg-zinc-800" />
        <div className="h-2 w-10 animate-pulse rounded bg-zinc-800" />
      </div>
    </div>
  );
}

/**
 * Marquee — continuous right-to-left scroll using framer-motion's
 * useAnimationFrame. Pauses on hover. The track is duplicated so the
 * loop is seamless.
 */
function Marquee({
  children,
  durationSec,
}: {
  children: React.ReactNode;
  durationSec: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useAnimationFrame((_, delta) => {
    if (paused || reducedMotion) return;
    const trackWidth = trackRef.current?.scrollWidth ?? 0;
    if (trackWidth === 0) return;
    // The track contains the children twice (duplicated) so half the
    // width is one full set — wrap there for a seamless loop.
    const half = trackWidth / 2;
    if (half <= 0) return;
    const speed = half / durationSec; // px / sec
    let next = x.get() - (delta / 1000) * speed;
    if (-next >= half) next = 0;
    x.set(next);
  });

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {reducedMotion ? (
        <div className="flex w-max gap-3 px-3">{children}</div>
      ) : (
        <motion.div ref={trackRef} style={{ x }} className="flex w-max gap-3 px-3 will-change-transform">
          {children}
          {children}
        </motion.div>
      )}
      {/* Edge fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-zinc-950 to-transparent" />
    </div>
  );
}

export function RecentScansCard() {
  const [scans, setScans] = useState<RecentScan[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [, setTick] = useState(0);

  // Fetch + poll every 30s. The `tick` state is bumped once a minute so
  // the "Xm ago" labels in the marquee stay fresh between polls.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let nowTimer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/public-scan/recent?limit=20", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;
        const parsed = parsePayload(data);
        setScans(parsed.scans);
        setTotal(parsed.total);
        if (parsed.scans.length === 0) setStatus("empty");
        else setStatus("ready");
      } catch {
        if (cancelled) return;
        // Keep whatever we already had; only flip to error on the very
        // first failure so the panel doesn't blink empty after a poll hiccup.
        setStatus((prev) => (prev === "loading" ? "error" : prev));
      }
    };

    load();
    pollTimer = setInterval(load, POLL_INTERVAL_MS);
    nowTimer = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (nowTimer) clearInterval(nowTimer);
    };
  }, []);

  const totalCount = useMemo(() => {
    if (total > 0) return total;
    if (scans.length > 0) return scans.length;
    return 0;
  }, [total, scans.length]);

  return (
    <section
      aria-label="Live scan feed"
      className="relative isolate w-full overflow-hidden border-y border-emerald-500/15 bg-zinc-950/40 py-10"
    >
      {/* Cinematic CircuitBoard background, dimmed */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-25">
        <CircuitBoard opacity={1} showHud={false} />
      </div>
      {/* Dark overlay so cards stay legible */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.35) 50%, rgba(9,9,11,0.7) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[120rem] px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.34em] text-emerald-500/80">
              <span className="pulse-dot relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live scan feed
            </div>
            <h3 className="neon-emerald text-2xl font-bold text-zinc-50 sm:text-3xl">
              Recent Public Scans
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Real-time stream of non-intrusive scans run by visitors. Updated every 30s.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-right">
              <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/60">
                total scans
              </div>
              <div className="font-mono text-xl font-bold tabular-nums text-emerald-300">
                {totalCount.toLocaleString()}
              </div>
            </div>
            <div
              className={`hidden rounded-md border px-3 py-2 text-right sm:block ${
                status === "ready"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : status === "error"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                status
              </div>
              <div
                className={`font-mono text-sm font-bold ${
                  status === "ready"
                    ? "text-emerald-300"
                    : status === "error"
                    ? "text-red-300"
                    : "text-amber-300"
                }`}
              >
                {status === "ready" ? "LIVE" : status === "loading" ? "SYNC" : status === "empty" ? "WAIT" : "ERR"}
              </div>
            </div>
          </div>
        </div>

        {/* Main display */}
        <AnimatePresence mode="wait">
          {status === "loading" ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-3 px-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </motion.div>
          ) : status === "empty" || scans.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex min-h-[220px] flex-col items-center justify-center text-center"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="mb-3 flex size-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10"
              >
                <ArrowUp className="size-7 text-emerald-400" />
              </motion.div>
              <h4 className="text-lg font-semibold text-zinc-100">
                Be the first to scan
              </h4>
              <p className="mt-1 max-w-md text-sm text-zinc-400">
                Enter your URL above and run a free scan — it&apos;ll appear here in the live feed
                for the world to see your security posture.
              </p>
            </motion.div>
          ) : status === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[220px] flex-col items-center justify-center text-center"
            >
              <div className="mb-3 flex size-14 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10">
                <ShieldAlert className="size-7 text-red-400" />
              </div>
              <h4 className="text-lg font-semibold text-zinc-100">
                Live feed unavailable
              </h4>
              <p className="mt-1 max-w-md text-sm text-zinc-400">
                The scan feed API is unreachable right now. Your own scans will still
                appear in your dashboard after sign-up.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Marquee durationSec={MARQUEE_DURATION_SEC}>
                {scans.map((s) => (
                  <ScanCard key={s.id} scan={s} />
                ))}
              </Marquee>

              {/* Footnote */}
              <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[10px] text-zinc-600">
                <Zap className="size-3 text-emerald-500/60" />
                <span>
                  Streaming {scans.length} of {totalCount.toLocaleString()} total scans · refreshes every 30s
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
