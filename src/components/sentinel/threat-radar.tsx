"use client";

import { useMemo } from "react";
import type { Finding } from "@/lib/sentinel/api";

interface ThreatRadarProps {
  findings: Finding[];
  active?: boolean;
}

const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#0ea5e9",
  info: "#6b7280",
};

/**
 * Sci-fi threat radar: a circular scope with a rotating sweep line.
 * Each confirmed finding appears as a blip positioned by index + jitter,
 * colored by severity. The sweep reveals blips as it passes.
 */
export function ThreatRadar({ findings, active }: ThreatRadarProps) {
  // Position blips deterministically around the radar
  const blips = useMemo(() => {
    return findings.map((f, i) => {
      const angle = (i / Math.max(findings.length, 1)) * Math.PI * 2 + (i * 0.7);
      const radius = 25 + ((i * 37) % 55); // 25-80% of radar radius
      const x = 50 + Math.cos(angle) * radius * 0.5;
      const y = 50 + Math.sin(angle) * radius * 0.5;
      return { x, y, color: SEV_COLOR[f.severity] ?? "#6b7280", id: f.id };
    });
  }, [findings]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      {/* Outer ring */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.15)" />
            <stop offset="70%" stopColor="rgba(16,185,129,0.05)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(16,185,129,0)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.5)" />
          </linearGradient>
        </defs>

        {/* Background glow */}
        <circle cx="50" cy="50" r="48" fill="url(#radarGlow)" />

        {/* Concentric rings */}
        {[12, 24, 36, 48].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="rgba(16,185,129,0.2)"
            strokeWidth="0.3"
          />
        ))}

        {/* Cross hairs */}
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(16,185,129,0.15)" strokeWidth="0.3" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(16,185,129,0.15)" strokeWidth="0.3" />
        <line x1="15" y1="15" x2="85" y2="85" stroke="rgba(16,185,129,0.08)" strokeWidth="0.3" />
        <line x1="85" y1="15" x2="15" y2="85" stroke="rgba(16,185,129,0.08)" strokeWidth="0.3" />

        {/* Rotating sweep */}
        <g className="radar-sweep" style={{ transformOrigin: "50px 50px" }}>
          <path
            d="M 50 50 L 98 50 A 48 48 0 0 0 74 8.5 Z"
            fill="url(#sweepGrad)"
            opacity="0.6"
          />
          <line x1="50" y1="50" x2="98" y2="50" stroke="rgba(16,185,129,0.8)" strokeWidth="0.4" />
        </g>

        {/* Center dot */}
        <circle cx="50" cy="50" r="1.5" fill="rgba(16,185,129,0.9)" className="pulse-dot" />

        {/* Blips */}
        {blips.map((b) => (
          <g key={b.id} className="blip-appear">
            <circle cx={b.x} cy={b.y} r="1.8" fill={b.color} opacity="0.9" />
            <circle cx={b.x} cy={b.y} r="3.5" fill="none" stroke={b.color} strokeWidth="0.3" opacity="0.5">
              <animate attributeName="r" from="1.8" to="6" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>

      {/* Status label */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/70">
          {active ? "● scanning" : findings.length > 0 ? `${findings.length} threats` : "standby"}
        </div>
      </div>

      {/* Corner brackets */}
      <div className="absolute left-0 top-0 size-3 border-l border-t border-emerald-500/40" />
      <div className="absolute right-0 top-0 size-3 border-r border-t border-emerald-500/40" />
      <div className="absolute bottom-0 left-0 size-3 border-b border-l border-emerald-500/40" />
      <div className="absolute bottom-0 right-0 size-3 border-b border-r border-emerald-500/40" />
    </div>
  );
}
