"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe2, Activity, Crosshair } from "lucide-react";

/**
 * LiveAttackMap
 * -------------
 * Decorative "world map" — actually a stylized dot-grid globe with
 * attack origins appearing as pulsing blips, then a tracking line
 * arcing to a central "target" point.
 *
 * No images. Pure SVG + CSS animations.
 */

interface Attack {
  id: number;
  x: number; // % 0–100
  y: number; // % 0–100
  label: string;
  color: string;
}

const ATTACK_LABELS = [
  "SQL Injection",
  "Brute Force",
  "XSS Probe",
  "CVE-2024-3094",
  "Auth Bypass",
  "Path Traversal",
  "RCE Attempt",
  "SSRF Probe",
  "LFI Attempt",
  "Zero-Day Scan",
  "Bot Crawl",
  "Credential Stuffing",
];
const ATTACK_COLORS = ["#f87171", "#fbbf24", "#fb923c", "#a78bfa", "#22d3ee"];

const TARGET = { x: 50, y: 50 };

export function LiveAttackMap() {
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [counter, setCounter] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  // Spawn attack blips at 1.1s intervals, but pause when the section is
  // scrolled out of view OR the document is hidden — saves a setInterval
  // and the per-tick React state churn when the user is elsewhere.
  useEffect(() => {
    let id = 0;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let inViewport = true;
    let docVisible = !document.hidden;

    const spawn = () => {
      if (cancelled) return;
      const a: Attack = {
        id: ++id,
        x: 8 + Math.random() * 84,
        y: 12 + Math.random() * 76,
        label: ATTACK_LABELS[Math.floor(Math.random() * ATTACK_LABELS.length)],
        color: ATTACK_COLORS[Math.floor(Math.random() * ATTACK_COLORS.length)],
      };
      setAttacks((prev) => [...prev.slice(-7), a]);
      setCounter((c) => c + 1);
      setTimeout(() => {
        if (cancelled) return;
        setAttacks((prev) => prev.filter((p) => p.id !== a.id));
      }, 3500);
    };

    const start = () => {
      if (interval || cancelled) return;
      spawn();
      interval = setInterval(spawn, 1100);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const updateRunning = () => {
      if (inViewport && docVisible) start();
      else stop();
    };

    const onVisibility = () => {
      docVisible = !document.hidden;
      updateRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (sectionRef.current && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry) {
            inViewport = entry.isIntersecting;
            updateRunning();
          }
        },
        { threshold: 0.05 },
      );
      io.observe(sectionRef.current);
    } else {
      // No IO available — just start.
      start();
    }

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-red-500/70">
            <Crosshair className="size-3" /> {"// Live attack feed"}
          </div>
          <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">Threats blocked, right now</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Decorative real-time view of attack origins across the global threat landscape.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 font-mono text-xs text-red-300">
          <Activity className="size-3.5" />
          <span className="tabular-nums">{counter}</span>
          <span className="text-zinc-500">events this session</span>
        </div>
      </div>

      <div className="holo-card-sharp hud-corners relative overflow-hidden p-4 sm:p-6">
        {/* Header strip */}
        <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Globe2 className="size-3.5 text-cyan-400" /> global threat surface
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            monitoring
          </span>
        </div>

        {/* Map area */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-zinc-800/80 bg-black/60">
          {/* Dotted grid (stylized continents) */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-50"
            viewBox="0 0 160 90"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern id="worldDots" width="4" height="4" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.6" fill="rgba(16,185,129,0.45)" />
              </pattern>
              {/* Continent silhouettes (very rough, just for vibe) */}
              <mask id="continentMask">
                <rect width="160" height="90" fill="black" />
                {/* North America */}
                <ellipse cx="32" cy="30" rx="22" ry="14" fill="white" />
                {/* South America */}
                <ellipse cx="44" cy="62" rx="10" ry="16" fill="white" />
                {/* Europe */}
                <ellipse cx="74" cy="26" rx="10" ry="9" fill="white" />
                {/* Africa */}
                <ellipse cx="78" cy="50" rx="13" ry="18" fill="white" />
                {/* Asia */}
                <ellipse cx="108" cy="30" rx="22" ry="13" fill="white" />
                {/* Oceania */}
                <ellipse cx="128" cy="62" rx="10" ry="7" fill="white" />
              </mask>
            </defs>
            <rect width="160" height="90" fill="url(#worldDots)" mask="url(#continentMask)" />
            {/* Latitude lines */}
            <line x1="0" y1="45" x2="160" y2="45" stroke="rgba(16,185,129,0.12)" strokeWidth="0.3" />
            <line x1="0" y1="30" x2="160" y2="30" stroke="rgba(16,185,129,0.08)" strokeWidth="0.3" />
            <line x1="0" y1="60" x2="160" y2="60" stroke="rgba(16,185,129,0.08)" strokeWidth="0.3" />
          </svg>

          {/* Crosshair on target */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative size-12">
              <motion.div
                className="absolute inset-0 rounded-full border border-emerald-500/60"
                animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
              <div className="absolute inset-2 rounded-full border border-emerald-400/80 bg-emerald-500/20" />
              <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-500/30" />
              <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-emerald-500/30" />
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
              YOU · guardianx.io
            </div>
          </div>

          {/* Attacks */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {attacks.map((a) => {
              const midX = (a.x + TARGET.x) / 2;
              const midY = Math.min(a.y, TARGET.y) - 18;
              const d = `M ${a.x} ${a.y} Q ${midX} ${midY} ${TARGET.x} ${TARGET.y}`;
              return (
                <motion.path
                  key={`arc-${a.id}`}
                  d={d}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={0.3}
                  strokeOpacity={0.6}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />
              );
            })}
          </svg>

          {/* Attack blips + labels */}
          <AnimatePresence>
            {attacks.map((a) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.4 }}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${a.x}%`, top: `${a.y}%` }}
              >
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 size-3 rounded-full"
                    style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
                    animate={{ scale: [1, 2.4], opacity: [0.8, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                  <div
                    className="size-2 rounded-full"
                    style={{ background: a.color, boxShadow: `0 0 6px ${a.color}` }}
                  />
                  <div
                    className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider"
                    style={{ background: "rgba(0,0,0,0.6)", color: a.color }}
                  >
                    {a.label}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Scanline sweep */}
          <div className="attack-scan pointer-events-none absolute inset-x-0 top-0 h-full" />
        </div>

        {/* Footer stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] text-zinc-500">
          <div className="rounded border border-zinc-800/60 bg-zinc-900/40 px-2 py-1.5">
            <div className="text-zinc-400">origins</div>
            <div className="text-red-300">12 countries</div>
          </div>
          <div className="rounded border border-zinc-800/60 bg-zinc-900/40 px-2 py-1.5">
            <div className="text-zinc-400">top vector</div>
            <div className="text-amber-300">SQL Injection</div>
          </div>
          <div className="rounded border border-zinc-800/60 bg-zinc-900/40 px-2 py-1.5">
            <div className="text-zinc-400">blocked</div>
            <div className="text-emerald-300">100% · auto-patched</div>
          </div>
        </div>
      </div>
    </section>
  );
}
