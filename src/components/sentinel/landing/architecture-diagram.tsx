"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Cpu,
  Terminal,
  Database,
  Server,
  X,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * ArchitectureDiagram
 * -------------------
 * Interactive SVG + CSS diagram of the GuardianX platform topology.
 *
 * 5 nodes (color-coded):
 *   - Caddy (proxy, amber)      — HTTPS / WebSocket / security headers
 *   - Web App (Next.js, emerald) — Dashboard, auth, reports (port 3000)
 *   - Supabase (PostgreSQL, blue) — Data storage, auth, real-time
 *   - Sentinel Engine (red)      — SAST + DAST pipeline, AI analysis (3003)
 *   - Recon Tools (cyan)         — Nmap, Nuclei, SQLmap, FFuF (3004)
 *
 * Desktop: SVG with animated data packets flowing along the 4 connections.
 * Mobile: vertical stack of cards with simple arrow connectors.
 *
 * Clicking any node opens a popover with details. No external chart
 * libraries — pure SVG + framer-motion.
 */

interface ArchNode {
  id: string;
  name: string;
  subtitle: string;
  port?: string;
  desc: string;
  Icon: LucideIcon;
  /** SVG color hex */
  color: string;
  /** Tailwind text color class */
  textClass: string;
  /** Tailwind border color class */
  borderClass: string;
  /** Tailwind bg color class */
  bgClass: string;
  /** SVG center coords (viewBox 800x480) */
  x: number;
  y: number;
}

const NODES: ArchNode[] = [
  {
    id: "caddy",
    name: "Caddy",
    subtitle: "Reverse Proxy",
    desc: "Terminates TLS, enforces HTTPS redirects, WebSocket upgrade, HSTS + security headers, rate-limits abusive clients.",
    Icon: Globe,
    color: "#fbbf24",
    textClass: "text-amber-400",
    borderClass: "border-amber-500/40",
    bgClass: "bg-amber-500/10",
    x: 400,
    y: 70,
  },
  {
    id: "webapp",
    name: "Web App",
    subtitle: "Next.js · :3000",
    port: "3000",
    desc: "Dashboard, auth flows, scan orchestration UI, report builder. Streams live scan logs over WebSocket to the console.",
    Icon: Server,
    color: "#34d399",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-500/40",
    bgClass: "bg-emerald-500/10",
    x: 400,
    y: 220,
  },
  {
    id: "supabase",
    name: "Supabase",
    subtitle: "PostgreSQL",
    desc: "Primary datastore — users, tenants, scans, findings, patches, audit ledger. Row-Level Security per tenant + real-time subscriptions.",
    Icon: Database,
    color: "#60a5fa",
    textClass: "text-blue-400",
    borderClass: "border-blue-500/40",
    bgClass: "bg-blue-500/10",
    x: 640,
    y: 220,
  },
  {
    id: "engine",
    name: "Sentinel Engine",
    subtitle: "SAST + DAST · :3003",
    port: "3003",
    desc: "Runs the AI analysis pipeline: AST parsing, taint tracking, DAST verification, patch generation, adversarial arena. The brain of the platform.",
    Icon: Cpu,
    color: "#f87171",
    textClass: "text-red-400",
    borderClass: "border-red-500/40",
    bgClass: "bg-red-500/10",
    x: 400,
    y: 370,
  },
  {
    id: "recon",
    name: "Recon Tools",
    subtitle: "Nmap · Nuclei · :3004",
    port: "3004",
    desc: "Wrapper service around open-source offensive tooling — Nmap, Nuclei, SQLmap, FFuF. Sandboxed execution, results normalized to findings.",
    Icon: Terminal,
    color: "#22d3ee",
    textClass: "text-cyan-400",
    borderClass: "border-cyan-500/40",
    bgClass: "bg-cyan-500/10",
    x: 160,
    y: 370,
  },
];

interface Edge {
  id: string;
  from: string;
  to: string;
  /** endpoints already inset so packets don't overlap nodes */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  /** direction packets travel: "from-to" or "to-from" or "both" */
  direction: "from-to" | "to-from" | "both";
  label: string;
}

const EDGES: Edge[] = [
  {
    id: "caddy-webapp",
    from: "caddy",
    to: "webapp",
    x1: 400,
    y1: 105,
    x2: 400,
    y2: 185,
    color: "#fbbf24",
    direction: "both",
    label: "HTTPS",
  },
  {
    id: "webapp-supabase",
    from: "webapp",
    to: "supabase",
    x1: 445,
    y1: 220,
    x2: 595,
    y2: 220,
    color: "#60a5fa",
    direction: "both",
    label: "SQL · realtime",
  },
  {
    id: "webapp-engine",
    from: "webapp",
    to: "engine",
    x1: 400,
    y1: 255,
    x2: 400,
    y2: 335,
    color: "#f87171",
    direction: "both",
    label: "scan jobs",
  },
  {
    id: "engine-recon",
    from: "engine",
    to: "recon",
    x1: 355,
    y1: 370,
    x2: 205,
    y2: 370,
    color: "#22d3ee",
    direction: "both",
    label: "tool calls",
  },
];

const NODE_RADIUS = 38;

/**
 * Packet — a small glowing dot that travels along an edge.
 * We animate `cx`/`cy` from start → end with `repeat: Infinity`.
 * For "both" direction we render two packets travelling opposite ways.
 */
function Packet({
  edge,
  reverse,
  delay,
}: {
  edge: Edge;
  reverse?: boolean;
  delay: number;
}) {
  const fromX = reverse ? edge.x2 : edge.x1;
  const fromY = reverse ? edge.y2 : edge.y1;
  const toX = reverse ? edge.x1 : edge.x2;
  const toY = reverse ? edge.y1 : edge.y2;
  return (
    <motion.circle
      r={3.5}
      fill={edge.color}
      style={{ filter: `drop-shadow(0 0 4px ${edge.color}) drop-shadow(0 0 8px ${edge.color})` }}
      initial={{ cx: fromX, cy: fromY, opacity: 0 }}
      animate={{ cx: [fromX, toX], cy: [fromY, toY], opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 2.2,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

function ArchNodeDesktop({
  node,
  active,
  onToggle,
}: {
  node: ArchNode;
  active: boolean;
  onToggle: (id: string) => void;
}) {
  // Convert SVG coords → percentages for HTML overlay
  const leftPct = (node.x / 800) * 100;
  const topPct = (node.y / 480) * 100;

  return (
    <button
      type="button"
      onClick={() => onToggle(node.id)}
      className={`group absolute z-20 flex w-36 -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center rounded-xl border-2 bg-zinc-950/90 px-3 py-2.5 text-center backdrop-blur-sm transition-all duration-200 ${
        active ? node.borderClass + " scale-105" : "border-zinc-700/70 hover:border-zinc-600"
      }`}
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      aria-label={`Show details for ${node.name}`}
    >
      <div
        className={`flex size-9 items-center justify-center rounded-lg border ${node.borderClass} ${node.bgClass} ${node.textClass}`}
      >
        <node.Icon className="size-5" />
      </div>
      <div className="mt-1.5 text-[12px] font-bold text-zinc-100">{node.name}</div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {node.subtitle}
      </div>
      {/* Glow ring on hover/active */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-10 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
          active ? "!opacity-100" : ""
        }`}
        style={{ boxShadow: `0 0 24px ${node.color}55, 0 0 48px ${node.color}22` }}
      />
    </button>
  );
}

function DesktopDiagram() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeNode = NODES.find((n) => n.id === activeId) ?? null;

  const toggle = useCallback((id: string) => {
    setActiveId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <div className="relative">
      {/* SVG layer: lines + packets */}
      <svg
        viewBox="0 0 800 480"
        preserveAspectRatio="xMidYMid meet"
        className="h-[440px] w-full sm:h-[480px]"
        aria-hidden
      >
        {/* Connection lines */}
        {EDGES.map((edge) => (
          <g key={edge.id}>
            <line
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.color}
              strokeOpacity={0.25}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {/* Animated packets */}
            <Packet edge={edge} delay={0} />
            {edge.direction === "both" && <Packet edge={edge} reverse delay={1.1} />}

            {/* Edge label */}
            <text
              x={(edge.x1 + edge.x2) / 2}
              y={(edge.y1 + edge.y2) / 2 - 8}
              fill={edge.color}
              fillOpacity={0.6}
              fontSize={10}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              className="uppercase"
            >
              {edge.label}
            </text>
          </g>
        ))}

        {/* Subtle node halos (drawn under HTML nodes) */}
        {NODES.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={NODE_RADIUS + 6}
            fill="none"
            stroke={n.color}
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* HTML overlay: clickable nodes */}
      {NODES.map((n) => (
        <ArchNodeDesktop
          key={n.id}
          node={n}
          active={activeId === n.id}
          onToggle={toggle}
        />
      ))}

      {/* Popover */}
      <AnimatePresence>
        {activeNode && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className={`holo-card-sharp hud-corners absolute right-4 top-4 z-30 w-72 max-w-[80%] border-2 p-4 ${activeNode.borderClass} bg-zinc-950/95`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-8 items-center justify-center rounded-lg border ${activeNode.borderClass} ${activeNode.bgClass} ${activeNode.textClass}`}
                >
                  <activeNode.Icon className="size-4.5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-zinc-100">{activeNode.name}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    {activeNode.subtitle}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                aria-label="Close details"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{activeNode.desc}</p>
            {activeNode.port && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  Port
                </span>
                <span className={`font-mono text-xs ${activeNode.textClass}`}>
                  :{activeNode.port}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
        {"// click any node for details"}
      </div>
    </div>
  );
}

function MobileDiagram() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-stretch gap-0">
      {NODES.map((node, i) => {
        const isActive = activeId === node.id;
        return (
          <div key={node.id} className="relative">
            <button
              type="button"
              onClick={() => setActiveId((cur) => (cur === node.id ? null : node.id))}
              className={`flex w-full items-center gap-3 rounded-xl border-2 bg-zinc-950/80 p-3 text-left transition-colors ${
                isActive ? node.borderClass : "border-zinc-700/70"
              }`}
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${node.borderClass} ${node.bgClass} ${node.textClass}`}
              >
                <node.Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-100">{node.name}</span>
                  {node.port && (
                    <span className={`font-mono text-[10px] ${node.textClass}`}>
                      :{node.port}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  {node.subtitle}
                </div>
              </div>
            </button>

            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="px-2 pt-3 text-[12px] leading-relaxed text-zinc-400">
                    {node.desc}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connector arrow (between nodes, not after last) */}
            {i < NODES.length - 1 && (
              <div className="flex justify-center py-1.5" aria-hidden>
                <ArrowDown className={`size-4 ${node.textClass} opacity-60`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
          {"// Architecture"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
          The GuardianX platform topology
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Five services, one autonomous loop. Animated packets show live data flow.
          Click any node to inspect its role.
        </p>
      </div>

      {/* Color legend */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {NODES.map((n) => (
          <span
            key={n.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${n.borderClass} ${n.bgClass} ${n.textClass}`}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: n.color, boxShadow: `0 0 6px ${n.color}` }}
            />
            {n.name}
          </span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.55 }}
        className="holo-card-sharp hud-corners relative overflow-hidden border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-6"
      >
        {/* Desktop SVG view */}
        <div className="hidden sm:block">
          <DesktopDiagram />
        </div>
        {/* Mobile vertical stack */}
        <div className="sm:hidden">
          <MobileDiagram />
        </div>

        {/* Decorative grid */}
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
      </motion.div>

      {/* Footnote */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <ArrowRight className="size-3" />
          bidirectional data flow
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          live packet = active request
        </span>
      </div>
    </section>
  );
}
