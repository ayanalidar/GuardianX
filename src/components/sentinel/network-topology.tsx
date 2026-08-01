"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface TopoClient {
  id: string;
  name: string;
  status: string;
  stats: { critical_findings: number; findings: number; patches: number };
  target_url: string | null;
}

const NODE_COLORS: Record<string, string> = {
  compliant: "#10b981",
  defending: "#f43f5e",
  testing: "#f59e0b",
  patching: "#8b5cf6",
  scanning: "#06b6d4",
  onboarding: "#52525b",
};

export function NetworkTopology({ onSelectClient }: { onSelectClient: (id: string) => void }) {
  const [clients, setClients] = useState<TopoClient[]>([]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => null);
    const id = setInterval(() => {
      fetch("/api/clients")
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setClients(d); })
        .catch(() => null);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Layout: GuardianX engine in center, clients arranged in a circle around it
  const centerX = 200;
  const centerY = 150;
  const radius = 110;
  const clientNodes = clients.map((c, i) => {
    const angle = (i / Math.max(clients.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...c,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      color: NODE_COLORS[c.status] || "#52525b",
    };
  });

  return (
    <div className="holo-card-sharp hud-corners p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="section-header text-xs font-bold text-cyan-300">
          <span className="font-mono uppercase tracking-wider">Network Topology</span>
        </h4>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span className="font-mono text-[8px] uppercase tracking-wider text-cyan-400">LIVE MAP</span>
        </div>
      </div>

      <svg viewBox="0 0 400 300" className="w-full" style={{ maxHeight: "240px" }}>
        {/* Animated grid background */}
        <defs>
          <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(6, 182, 212, 0.08)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="engine-glow">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.4)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
          </radialGradient>
          <radialGradient id="pulse-grad">
            <stop offset="0%" stopColor="rgba(239, 68, 68, 0.6)" />
            <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" />
          </radialGradient>
        </defs>

        <rect width="400" height="300" fill="url(#topo-grid)" />

        {/* Connection lines from engine to each client */}
        {clientNodes.map((node, i) => {
          const isCritical = node.stats.critical_findings > 0;
          const isActive = node.status !== "onboarding" && node.status !== "compliant";
          return (
            <g key={`line-${node.id}`}>
              <line
                x1={centerX}
                y1={centerY}
                x2={node.x}
                y2={node.y}
                stroke={isCritical ? "#ef4444" : isActive ? node.color : "#3f3f46"}
                strokeWidth={isCritical ? 1.5 : 1}
                strokeDasharray={isActive ? "4 2" : "none"}
                opacity={isActive ? 0.5 : 0.2}
              >
                {isActive && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="6"
                    to="0"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                )}
              </line>
              {/* Animated attack vector (red dot traveling) */}
              {isCritical && (
                <circle r="2" fill="#ef4444">
                  <animateMotion
                    dur="2s"
                    repeatCount="indefinite"
                    path={`M ${centerX} ${centerY} L ${node.x} ${node.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Central engine node */}
        <circle cx={centerX} cy={centerY} r="30" fill="url(#engine-glow)" />
        <circle
          cx={centerX}
          cy={centerY}
          r="18"
          fill="rgba(16, 185, 129, 0.1)"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <circle cx={centerX} cy={centerY} r="18" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5">
          <animate attributeName="r" from="18" to="30" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
        </circle>
        <text
          x={centerX}
          y={centerY - 1}
          textAnchor="middle"
          fill="#10b981"
          fontSize="8"
          fontWeight="bold"
          fontFamily="monospace"
        >
          GUARDIANX
        </text>
        <text
          x={centerX}
          y={centerY + 8}
          textAnchor="middle"
          fill="#06b6d4"
          fontSize="6"
          fontFamily="monospace"
        >
          ENGINE
        </text>

        {/* Client nodes */}
        {clientNodes.map((node) => {
          const isCritical = node.stats.critical_findings > 0;
          return (
            <g
              key={node.id}
              onClick={() => onSelectClient(node.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Pulse ring for critical clients */}
              {isCritical && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="14"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1"
                >
                  <animate attributeName="r" from="14" to="22" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r="12"
                fill={`${node.color}30`}
                stroke={node.color}
                strokeWidth="1.5"
              />
              {/* Status dot */}
              <circle
                cx={node.x}
                cy={node.y}
                r="3"
                fill={node.color}
              >
                {(node.status !== "onboarding" && node.status !== "compliant") && (
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
                )}
              </circle>
              {/* Client name label */}
              <text
                x={node.x}
                y={node.y + 24}
                textAnchor="middle"
                fill="#a1a1aa"
                fontSize="7"
                fontFamily="monospace"
              >
                {node.name.length > 12 ? node.name.slice(0, 11) + "…" : node.name}
              </text>
              {/* Critical badge */}
              {isCritical && (
                <text
                  x={node.x + 10}
                  y={node.y - 8}
                  fill="#ef4444"
                  fontSize="8"
                  fontWeight="bold"
                >
                  ⚠{node.stats.critical_findings}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-mono text-[8px] text-zinc-500">
        {Object.entries(NODE_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {status.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
