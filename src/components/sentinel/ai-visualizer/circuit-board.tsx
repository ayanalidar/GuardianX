"use client";

/**
 * CircuitBoard
 * ------------
 * A React + canvas port of jaredrhod's ai-visualizer "board" face.
 * Renders a full-bleed procedural circuit board: traces routed across a
 * grid, components (ICs, resistors, caps) sitting on top, and data
 * pulses that flow along the traces lighting up components as they hit.
 * A central chip "breathes" at idle and amps up under load.
 *
 * Visualizer states (from the SignalBus):
 *   idle      — calm crawl, occasional shimmer
 *   scanning  — pulses flowing outward, chip breathing steady
 *   analyzing — whole board amps up, fast traffic
 *   finding   — red wash + red pulses
 *   patching  — green flow, components flash green
 *
 * HUD: brand "GUARDIANX", status mode, clock, signal indicator.
 *
 * Performance: rAF loop is paused when the canvas is off-screen (via
 * IntersectionObserver) or when the tab is hidden. DPR is capped at 1.5.
 */

import { useEffect, useRef, useState } from "react";
import { useSignalBus, type VisualizerState } from "./signal-bus";

interface CircuitBoardProps {
  /** When true, renders HUD + decorative chrome. Default true. */
  showHud?: boolean;
  /** Opacity 0..1 for the whole canvas (used to dim on homepage). */
  opacity?: number;
  /** Override the bus state. If omitted, uses the SignalBus. */
  forcedState?: VisualizerState;
  /** Optional CSS class for the wrapping div. */
  className?: string;
}

const COLORS = {
  green: "#3ddc84",
  greenHot: "#a6ffd0",
  amber: "#e7c368",
  amberHot: "#ffe9ae",
  red: "#ff4d5e",
  redHot: "#ffb0b8",
  ink: "#020705",
};

// Deterministic RNG so the board looks identical every boot.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Trace {
  pts: [number, number][];
  cum: number[];
  len: number;
  bb: [number, number, number, number];
  amber: boolean;
  chip: boolean;
  endComp: number;
  out: number[];
}
interface Comp {
  type: "ic" | "res" | "cap";
  gx: number; gy: number;
  x: number; y: number; w: number; h: number;
  wc: number; hc: number;
  glow: number;
  amber: boolean;
  flashCol: string | null;
}
interface Pulse {
  ti: number;
  d: number;
  sp: number;
  col: string | null;
  inward: boolean;
}
interface Board {
  cell: number;
  cols: number;
  rows: number;
  traces: Trace[];
  comps: Comp[];
  chip: { x: number; y: number; w: number; h: number; glow: number; glowIn: number };
}

const DIRS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function buildBoard(W: number, H: number, seed = 7): Board {
  const rnd = mulberry32(seed);
  const cell = Math.max(16, Math.round(Math.min(W, H) / 56));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const occ = new Set<string>();
  const traces: Trace[] = [];
  const comps: Comp[] = [];
  const key = (x: number, y: number) => `${x}_${y}`;

  // Center chip
  const chW = Math.round(Math.min(W * 0.235, 620));
  const chH = Math.round(chW * 0.3);
  const chip = {
    x: W * 0.5 - chW / 2,
    y: H * 0.5 - chH / 2,
    w: chW,
    h: chH,
    glow: 0,
    glowIn: 0,
  };
  const cx0 = Math.floor(chip.x / cell) - 1;
  const cy0 = Math.floor(chip.y / cell) - 1;
  const cx1 = Math.ceil((chip.x + chW) / cell) + 1;
  const cy1 = Math.ceil((chip.y + chH) / cell) + 1;
  for (let gx = cx0; gx <= cx1; gx++) {
    for (let gy = cy0; gy <= cy1; gy++) occ.add(key(gx, gy));
  }

  // Components
  const place = (wc: number, hc: number) => {
    for (let tr = 0; tr < 60; tr++) {
      const gx = 1 + Math.floor(rnd() * (cols - wc - 2));
      const gy = 1 + Math.floor(rnd() * (rows - hc - 2));
      let free = true;
      for (let a = gx - 1; a <= gx + wc && free; a++) {
        for (let b = gy - 1; b <= gy + hc && free; b++) {
          if (occ.has(key(a, b))) free = false;
        }
      }
      if (!free) continue;
      for (let a = gx; a < gx + wc; a++) {
        for (let b = gy; b < gy + hc; b++) occ.add(key(a, b));
      }
      return { gx, gy };
    }
    return null;
  };
  for (let i = 0; i < 34; i++) {
    const roll = rnd();
    const type: Comp["type"] = roll < 0.42 ? "ic" : roll < 0.78 ? "res" : "cap";
    const wc = type === "ic" ? 4 + Math.floor(rnd() * 3) : type === "res" ? 1 : 2;
    const hc = type === "ic" ? 3 + Math.floor(rnd() * 2) : type === "res" ? 3 + Math.floor(rnd() * 3) : 2;
    const spot = place(wc, hc);
    if (!spot) continue;
    comps.push({
      type,
      gx: spot.gx, gy: spot.gy, wc, hc,
      x: spot.gx * cell, y: spot.gy * cell, w: wc * cell, h: hc * cell,
      glow: 0,
      amber: rnd() < 0.18,
      flashCol: null,
    });
  }

  // Trace router
  const route = (sx: number, sy: number, dir: number, maxLen?: number): Trace | null => {
    let x = sx, y = sy, d = dir;
    const pts: [number, number][] = [[x, y]];
    let run = 2 + Math.floor(rnd() * 5);
    let blocked = 0;
    const total = maxLen ?? 14 + Math.floor(rnd() * 30);
    for (let s = 0; s < total; s++) {
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1 || occ.has(key(nx, ny))) {
        d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
        if (++blocked > 2) break;
        continue;
      }
      blocked = 0;
      x = nx; y = ny;
      occ.add(key(x, y));
      pts.push([x, y]);
      if (--run <= 0) {
        if (rnd() < 0.7) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
        run = 2 + Math.floor(rnd() * 6);
      }
    }
    if (pts.length < 5) return null;
    // Simplify collinear runs
    const keep: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = keep[keep.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) keep.push(b);
    }
    keep.push(pts[pts.length - 1]);
    const px: [number, number][] = keep.map((p) => [p[0] * cell + cell / 2, p[1] * cell + cell / 2]);
    const cum = [0];
    for (let i = 1; i < px.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]));
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    px.forEach((p) => {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    });
    return {
      pts: px, cum, len: cum[cum.length - 1],
      bb: [x0 - 8, y0 - 8, x1 + 8, y1 + 8],
      amber: rnd() < 0.18, chip: false, endComp: -1, out: [],
    };
  };

  // Traces from the chip pins outward
  const pinsPerSide = Math.max(6, Math.round(chH / cell) + 2);
  const addPinTraces = (side: number) => {
    const n = side < 2 ? pinsPerSide : 6;
    for (let i = 0; i < n; i++) {
      let gx: number, gy: number, dir: number;
      if (side === 0) { gx = cx0; gy = cy0 + 2 + Math.floor(rnd() * (cy1 - cy0 - 3)); dir = 4; }
      else if (side === 1) { gx = cx1; gy = cy0 + 2 + Math.floor(rnd() * (cy1 - cy0 - 3)); dir = 0; }
      else if (side === 2) { gx = cx0 + 2 + Math.floor(rnd() * (cx1 - cx0 - 3)); gy = cy0; dir = 6; }
      else { gx = cx0 + 2 + Math.floor(rnd() * (cx1 - cx0 - 3)); gy = cy1; dir = 2; }
      const t = route(gx, gy, dir);
      if (t) { t.chip = true; traces.push(t); }
    }
  };
  addPinTraces(0); addPinTraces(1); addPinTraces(2); addPinTraces(3);

  // Background traces
  for (let i = 0; i < 130; i++) {
    const gx = 1 + Math.floor(rnd() * (cols - 2));
    const gy = 1 + Math.floor(rnd() * (rows - 2));
    if (occ.has(key(gx, gy))) continue;
    occ.add(key(gx, gy));
    const t = route(gx, gy, [0, 2, 4, 6][Math.floor(rnd() * 4)]);
    if (t) traces.push(t);
  }

  // Bind trace ends to nearby components
  traces.forEach((t) => {
    let best = -1, bd = 1e9;
    comps.forEach((c, ci) => {
      const dx = Math.max(c.gx - t.pts[t.pts.length - 1][0] / cell, 0, t.pts[t.pts.length - 1][0] / cell - (c.gx + c.wc - 1));
      const dy = Math.max(c.gy - t.pts[t.pts.length - 1][1] / cell, 0, t.pts[t.pts.length - 1][1] / cell - (c.gy + c.hc - 1));
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = ci; }
    });
    t.endComp = bd <= 9 ? best : -1;
    comps.forEach((c, ci) => {
      const dx = Math.max(c.gx - t.pts[0][0] / cell, 0, t.pts[0][0] / cell - (c.gx + c.wc - 1));
      const dy = Math.max(c.gy - t.pts[0][1] / cell, 0, t.pts[0][1] / cell - (c.gy + c.hc - 1));
      if (dx * dx + dy * dy <= 9) t.out.push(ci);
    });
  });

  return { cell, cols, rows, traces, comps, chip };
}

function hex2rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h: string, a: number): string {
  const [r, g, b] = hex2rgb(h);
  return `rgba(${r},${g},${b},${a})`;
}

function makeGlow(col: string, sz: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = sz;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
  const [r, gg, b] = hex2rgb(col);
  grd.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grd.addColorStop(0.25, `rgba(${r},${gg},${b},0.55)`);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, sz, sz);
  return c;
}

function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

const STATE_LABELS: Record<VisualizerState, string> = {
  idle: "IDLE",
  scanning: "SCANNING",
  analyzing: "ANALYZING",
  finding: "FINDING",
  patching: "PATCHING",
};

export function CircuitBoard({
  showHud = true,
  opacity = 1,
  forcedState,
  className,
}: CircuitBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state: busState, connected } = useSignalBus();
  const state = forcedState ?? busState;
  const [clock, setClock] = useState(new Date());

  // Live clock — cheap, runs at 1Hz so it doesn't drive rAF.
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // External ref so the canvas rAF loop always reads the latest state
  // without re-mounting (which would tear down the board on every transition).
  const stateRef = useRef<VisualizerState>(state);
  stateRef.current = state;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    // `board` is assigned in `resize()` before any drawing happens. We use a
    // non-null assertion at declaration to keep the helper functions below
    // from having to sprinkle `!` everywhere (TypeScript can't narrow `let`
    // variables through function declarations / nested callbacks).
    let board: Board = null as unknown as Board;
    let bgLayer: HTMLCanvasElement | null = null;
    const glowSprites: Record<string, HTMLCanvasElement> = {};
    let pulses: Pulse[] = [];
    let now = 0;
    let last = performance.now();
    let raf = 0;
    let inViewport = true;
    let docVisible = !document.hidden;
    let running = !reduced && inViewport && docVisible;

    const ensureGlow = (col: string) => {
      if (!glowSprites[col]) glowSprites[col] = makeGlow(col, 64);
    };
    [COLORS.green, COLORS.amber, COLORS.red].forEach(ensureGlow);

    const renderBG = () => {
      bgLayer = document.createElement("canvas");
      bgLayer.width = W;
      bgLayer.height = H;
      drawWorld(bgLayer.getContext("2d")!, [0, 0, W, H]);
    };

    const drawWorld = (g: CanvasRenderingContext2D, v: [number, number, number, number]) => {
      if (!board) return;
      const [vx0, vy0, vx1, vy1] = v;
      const hit = (x0: number, y0: number, x1: number, y1: number) =>
        x1 >= vx0 && x0 <= vx1 && y1 >= vy0 && y0 <= vy1;

      // Substrate
      const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
      grd.addColorStop(0, "#07160e");
      grd.addColorStop(0.55, "#04100a");
      grd.addColorStop(1, "#020705");
      g.fillStyle = grd;
      g.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

      // FR4 weave
      g.save();
      g.globalCompositeOperation = "soft-light";
      const wv = Math.max(5, Math.round(board.cell * 0.3));
      g.strokeStyle = "rgba(190,255,220,.10)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = Math.floor(vx0 / wv) * wv; x <= vx1; x += wv) {
        g.moveTo(x, vy0); g.lineTo(x, vy1);
      }
      for (let y = Math.floor(vy0 / wv) * wv; y <= vy1; y += wv) {
        g.moveTo(vx0, y); g.lineTo(vx1, y);
      }
      g.stroke();
      g.restore();

      // Traces
      g.lineCap = "round";
      g.lineJoin = "round";
      const tlw = Math.max(1.4, board.cell * 0.09);
      board.traces.forEach((t) => {
        if (!hit(t.bb[0], t.bb[1], t.bb[2], t.bb[3])) return;
        const path = () => {
          g.beginPath();
          g.moveTo(t.pts[0][0], t.pts[0][1]);
          for (let i = 1; i < t.pts.length; i++) g.lineTo(t.pts[i][0], t.pts[i][1]);
        };
        // Shadow
        g.save();
        g.translate(1.1, 1.4);
        path();
        g.strokeStyle = "rgba(0,0,0,.30)";
        g.lineWidth = tlw + 0.6;
        g.stroke();
        g.restore();
        // Copper
        path();
        g.strokeStyle = t.amber ? "rgba(231,195,104,.15)" : "rgba(61,220,132,.17)";
        g.lineWidth = tlw;
        g.stroke();
        // Vias
        [t.pts[0], t.pts[t.pts.length - 1]].forEach((p) => {
          const vR = Math.max(2.6, board.cell * 0.14);
          g.beginPath();
          g.arc(p[0], p[1], vR, 0, 6.29);
          g.strokeStyle = "rgba(120,220,170,.22)";
          g.lineWidth = 1.4;
          g.stroke();
          g.fillStyle = "rgba(1,4,3,.95)";
          g.beginPath();
          g.arc(p[0], p[1], Math.max(1.2, board.cell * 0.06), 0, 6.29);
          g.fill();
        });
      });

      // Components
      board.comps.forEach((c) => {
        if (!hit(c.x - 8, c.y - 8, c.x + c.w + 16, c.y + c.h + 16)) return;
        const col = c.amber ? COLORS.amber : COLORS.green;
        if (c.type === "ic") {
          const bx = c.x + board.cell * 0.3, by = c.y + board.cell * 0.3;
          const bw = c.w - board.cell * 0.6, bh = c.h - board.cell * 0.6;
          g.save();
          g.shadowColor = "rgba(0,0,0,.55)";
          g.shadowBlur = 9;
          g.shadowOffsetX = 4.5;
          g.shadowOffsetY = 6.5;
          g.fillStyle = "#050c08";
          g.beginPath();
          g.roundRect(bx, by, bw, bh, 3);
          g.fill();
          g.restore();
          const bg2 = g.createLinearGradient(bx, by, bx + bw, by + bh);
          bg2.addColorStop(0, "rgba(14,26,19,.94)");
          bg2.addColorStop(0.45, "rgba(5,12,8,.94)");
          bg2.addColorStop(1, "rgba(2,6,4,.94)");
          g.fillStyle = bg2;
          g.beginPath();
          g.roundRect(bx, by, bw, bh, 3);
          g.fill();
          g.strokeStyle = rgba(col, 0.24);
          g.lineWidth = 1;
          g.beginPath();
          g.roundRect(bx, by, bw, bh, 3);
          g.stroke();
        } else if (c.type === "res") {
          for (let i = 0; i < c.hc; i++) {
            const rx = c.x + board.cell * 0.12;
            const ry = c.y + i * board.cell + board.cell * 0.22;
            const rw = c.w - board.cell * 0.24;
            const rh = board.cell * 0.56;
            g.fillStyle = "#040a06";
            g.beginPath();
            g.roundRect(rx, ry, rw, rh, 2);
            g.fill();
            g.strokeStyle = rgba(col, 0.22);
            g.lineWidth = 1;
            g.beginPath();
            g.roundRect(rx, ry, rw, rh, 2);
            g.stroke();
          }
        } else {
          const cxp = c.x + c.w / 2, cyp = c.y + c.h / 2, cr = c.w * 0.34;
          g.fillStyle = "#040a06";
          g.beginPath();
          g.arc(cxp, cyp, cr, 0, 6.29);
          g.fill();
          const dg = g.createRadialGradient(cxp - cr * 0.4, cyp - cr * 0.45, cr * 0.1, cxp, cyp, cr);
          dg.addColorStop(0, "rgba(58,96,73,.95)");
          dg.addColorStop(0.45, "rgba(14,28,19,.95)");
          dg.addColorStop(1, "rgba(2,6,4,.95)");
          g.fillStyle = dg;
          g.beginPath();
          g.arc(cxp, cyp, cr, 0, 6.29);
          g.fill();
          g.strokeStyle = rgba(col, 0.26);
          g.lineWidth = 1.4;
          g.beginPath();
          g.arc(cxp, cyp, cr, 0, 6.29);
          g.stroke();
        }
      });
    }

    const drawChipBase = (g: CanvasRenderingContext2D) => {
      const { x, y, w, h } = board.chip;
      const npx = 12;
      for (let i = 0; i < npx; i++) {
        const px = x + w * 0.08 + w * 0.84 * (i / (npx - 1));
        g.fillStyle = "rgba(210,240,220,.40)";
        g.fillRect(px - 2, y - board.cell * 0.34, 4, board.cell * 0.3);
        g.fillStyle = "rgba(170,210,190,.34)";
        g.fillRect(px - 2, y + h + board.cell * 0.04, 4, board.cell * 0.3);
      }
      g.save();
      g.shadowColor = "rgba(0,0,0,.65)";
      g.shadowBlur = 30;
      g.shadowOffsetX = 12;
      g.shadowOffsetY = 16;
      g.fillStyle = "#040a07";
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
      g.restore();
      const tg = g.createLinearGradient(x, y, x + w, y + h);
      tg.addColorStop(0, "rgba(30,52,40,.5)");
      tg.addColorStop(0.45, "rgba(6,13,9,0)");
      tg.addColorStop(1, "rgba(0,0,0,.25)");
      g.fillStyle = tg;
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
      g.strokeStyle = "#1e3a2b";
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.stroke();
      g.fillStyle = "rgba(61,220,132,.4)";
      g.beginPath();
      g.arc(x + 14, y + 14, 4, 0, 6.29);
      g.fill();
    }

    const spawnPulse = (ti: number) => {
      const t = board.traces[ti];
      const st = stateRef.current;
      let col: string | null = null;
      if (st === "finding") col = COLORS.red;
      else if (st === "patching") col = COLORS.green;
      else if (st === "analyzing") col = COLORS.amber;
      else if (st === "scanning") col = t.amber ? COLORS.amber : COLORS.green;
      pulses.push({ ti, d: 0, sp: 0.18 * Math.min(W, H) / 1000, col, inward: false });
    }

    const frame = (ts: number) => {
      if (!running || !bgLayer) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(50, ts - last);
      last = ts;
      now += dt;

      const st = stateRef.current;
      const E =
        st === "idle" ? 0.25 :
        st === "scanning" ? 0.55 :
        st === "analyzing" ? 1 :
        st === "finding" ? 0.85 :
        st === "patching" ? 0.7 : 0.25;

      // Spawn pulses
      const cap = 6 + 80 * E;
      const tries = E > 0.6 ? 4 : 1;
      for (let i = 0; i < tries; i++) {
        if (pulses.length < cap && Math.random() < 0.05 + 0.85 * E) {
          const chipSide = Math.random() < 0.62;
          const pool: number[] = [];
          board.traces.forEach((t, idx) => {
            if (t.chip === chipSide) pool.push(idx);
          });
          if (pool.length) spawnPulse(pool[Math.floor(Math.random() * pool.length)]);
        }
      }
      // Idle life: components occasionally shimmer
      if (Math.random() < 0.005 + 0.05 * E) {
        const c = board.comps[Math.floor(Math.random() * board.comps.length)];
        if (c) c.glow = Math.max(c.glow, 0.3 + 0.3 * E);
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bgLayer, 0, 0);
      ctx.globalCompositeOperation = "lighter";

      // State wash
      if (st === "finding") {
        const pulse = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.fillStyle = `rgba(255,77,94,${0.06 * pulse})`;
        ctx.fillRect(0, 0, W, H);
      } else if (st === "patching") {
        const g1 = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.5);
        g1.addColorStop(0, "rgba(61,220,132,.10)");
        g1.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, W, H);
      } else if (st === "analyzing") {
        const g1 = ctx.createRadialGradient(W * 0.3, H * 0.34, 0, W * 0.3, H * 0.34, W * 0.42);
        g1.addColorStop(0, "rgba(231,195,104,.08)");
        g1.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, W, H);
      }

      // Pulses
      const tailLen = Math.min(W, H) * (0.1 + 0.13 * E);
      const speedK = 0.55 + 4.85 * E;
      pulses = pulses.filter((p) => {
        if (!board) return false;
        const t = board.traces[p.ti];
        p.d += p.sp * dt * speedK;
        const base = p.col || (t.amber ? COLORS.amber : COLORS.green);
        if (p.d >= t.len + tailLen) {
          if (t.endComp >= 0) {
            const c = board.comps[t.endComp];
            c.glow = 1;
            c.flashCol = base;
          }
          return false;
        }
        const col = p.col || (t.amber ? COLORS.amberHot : COLORS.greenHot);
        const head = Math.min(p.d, t.len);
        let i = 1;
        while (i < t.cum.length && t.cum[i] < p.d - tailLen) i++;
        for (; i < t.cum.length && t.cum[i - 1] < head; i++) {
          const s0 = Math.max(t.cum[i - 1], p.d - tailLen);
          const s1 = Math.min(t.cum[i], head);
          if (s1 <= s0) continue;
          const seg = t.cum[i] - t.cum[i - 1] || 1;
          const f0 = (s0 - t.cum[i - 1]) / seg;
          const f1 = (s1 - t.cum[i - 1]) / seg;
          const ax = t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * f0;
          const ay = t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * f0;
          const bx = t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * f1;
          const by = t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * f1;
          const mid = (s0 + s1) / 2;
          const back = (p.d - mid) / tailLen;
          const a = Math.pow(Math.max(0, 1 - back), 1.6) * (0.45 + 0.5 * E);
          ctx.strokeStyle = rgba(base, a);
          ctx.lineWidth = Math.max(1.6, board.cell * 0.11) * (1 + 0.5 * (1 - back));
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        // Head
        if (p.d <= t.len) {
          let j = 1;
          while (j < t.cum.length && t.cum[j] < p.d) j++;
          if (j < t.cum.length) {
            const seg = t.cum[j] - t.cum[j - 1] || 1;
            const f = (p.d - t.cum[j - 1]) / seg;
            const hx = t.pts[j - 1][0] + (t.pts[j][0] - t.pts[j - 1][0]) * f;
            const hy = t.pts[j - 1][1] + (t.pts[j][1] - t.pts[j - 1][1]) * f;
            const hs = 9 + 9 * E;
            ctx.globalAlpha = 0.75 + 0.25 * E;
            ctx.drawImage(glowSprites[base] || glowSprites[COLORS.green], hx - hs / 2, hy - hs / 2, hs, hs);
            ctx.globalAlpha = 1;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(hx, hy, Math.max(1.2, board.cell * 0.06), 0, 6.29);
            ctx.fill();
          }
        }
        return true;
      });

      // Component flashes
      board.comps.forEach((c) => {
        if (c.glow <= 0.02) {
          c.glow = 0;
          c.flashCol = null;
          return;
        }
        const col = c.flashCol || (c.amber ? COLORS.amber : COLORS.green);
        ensureGlow(col);
        const gsp = glowSprites[col] || glowSprites[COLORS.green];
        const cxp = c.x + c.w / 2, cyp = c.y + c.h / 2;
        const s = Math.max(c.w, c.h) * (2.2 + 0.8 * E);
        ctx.globalAlpha = 0.45 * c.glow;
        ctx.drawImage(gsp, cxp - s / 2, cyp - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(col, 0.25 + 0.65 * c.glow);
        ctx.lineWidth = 1.6;
        if (c.type === "cap") {
          ctx.beginPath();
          ctx.arc(cxp, cyp, c.w * 0.34, 0, 6.29);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.roundRect(c.x + board.cell * 0.3, c.y + board.cell * 0.3, c.w - board.cell * 0.6, c.h - board.cell * 0.6, 3);
          ctx.stroke();
        }
        c.glow *= Math.exp(-dt / 480);
      });

      // Chip
      {
        const { x, y, w, h } = board.chip;
        const breathe = 0.5 + 0.5 * Math.sin(now / 1100);
        const talk = st === "analyzing" || st === "scanning" ? 0.4 : 0;
        const scale = 1 + 0.012 * Math.sin(now / 620) + 0.05 * talk + 0.018 * E;
        const ccx = x + w / 2, ccy = y + h / 2;
        ctx.save();
        ctx.translate(ccx, ccy);
        ctx.scale(scale, scale);
        ctx.translate(-ccx, -ccy);
        // Heart glow
        const heartCol = st === "finding" ? COLORS.red : st === "patching" ? COLORS.green : COLORS.amber;
        ensureGlow(heartCol);
        const cg = Math.min(1, (0.22 + 0.55 * E) + 0.14 * breathe + 0.3 * talk);
        const s = w * (1.7 + 0.6 * E + 0.45 * talk);
        ctx.globalAlpha = cg;
        ctx.drawImage(glowSprites[heartCol], ccx - s / 2, ccy - (s * 0.62) / 2, s, s * 0.62);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        drawChipBase(ctx);
        // Label
        const fs = Math.round(h * 0.26);
        ctx.font = `600 ${fs}px "SF Mono", Menlo, Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(${Math.min(255, 140 + 80 * E + 70 * talk) | 0},255,${Math.min(255, 190 + 30 * E + 40 * talk) | 0},0.9)`;
        ctx.shadowColor = rgba(heartCol, 0.6 + 0.3 * E);
        ctx.shadowBlur = 14 + 26 * E + 30 * talk;
        ctx.fillText("GUARDIANX", ccx, ccy);
        ctx.shadowBlur = 0;
        ctx.restore();
        ctx.globalCompositeOperation = "lighter";
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }

    const resize = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = canvas.clientWidth * dpr;
      H = canvas.clientHeight * dpr;
      canvas.width = W;
      canvas.height = H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      board = buildBoard(W, H, 7);
      renderBG();
      pulses = [];
    }

    const updateRunning = () => {
      const was = running;
      running = !reduced && inViewport && docVisible;
      if (running && !was) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!running && was) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onVisibility = () => {
      docVisible = !document.hidden;
      updateRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry && entry.target === canvas) {
            inViewport = entry.isIntersecting;
            updateRunning();
          }
        },
        { threshold: 0 },
      );
      io.observe(canvas);
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      // Static: just blit the baked layer once.
      ctx.clearRect(0, 0, W, H);
      if (bgLayer) ctx.drawImage(bgLayer, 0, 0);
    } else if (running) {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
    // We intentionally only set up once; `state` is read live via the
    // external stateRef. (Pushing state into deps would tear down the
    // canvas every state change, which kills the animation.)
  }, []);

  const stateColor =
    state === "finding" ? "text-red-400" :
    state === "patching" ? "text-emerald-400" :
    state === "analyzing" ? "text-amber-400" :
    state === "scanning" ? "text-cyan-400" :
    "text-zinc-400";

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`} style={{ opacity }}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        data-state={state}
      />
      {showHud && (
        <div className="pointer-events-none absolute inset-0 z-10 select-none font-mono">
          {/* Corner brackets */}
          <div className="absolute left-4 top-4 size-7 border-l border-t border-emerald-500/40" />
          <div className="absolute right-4 top-4 size-7 border-r border-t border-emerald-500/40" />
          <div className="absolute bottom-4 left-4 size-7 border-l border-b border-emerald-500/40" />
          <div className="absolute bottom-4 right-4 size-7 border-r border-b border-emerald-500/40" />

          {/* Brand */}
          <div className="absolute left-8 top-8">
            <div className="text-lg tracking-[0.62em] text-emerald-300" style={{ textShadow: "0 0 12px rgba(120,255,190,.4)" }}>
              GUARDIANX
            </div>
            <div className="mt-1 text-[10px] tracking-[0.34em] text-zinc-500">
              NEURAL LINK —{" "}
              <span className={connected ? "text-emerald-400" : "text-zinc-600"}>
                {connected ? "CONNECTED" : "OFFLINE"}
              </span>
            </div>
          </div>

          {/* Status block */}
          <div className="absolute right-8 top-8 text-right">
            <div className={`text-base tracking-[0.5em] ${stateColor} ${state !== "idle" ? "animate-pulse" : ""}`}>
              {STATE_LABELS[state]}
            </div>
            <div className="mt-1 text-xs tracking-[0.3em] text-emerald-400/70">
              {fmtClock(clock)}
            </div>
            <div className="ml-auto mt-3 size-10 rounded-full border border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_24px_rgba(61,220,132,.5)]" />
          </div>

          {/* Signal bus indicator */}
          <div className="absolute bottom-8 left-8 text-[10px] tracking-[0.3em] text-zinc-500">
            SIGNAL BUS —{" "}
            <span className={connected ? "text-emerald-400" : "text-zinc-600"}>
              {connected ? "ONLINE" : "STANDBY"}
            </span>
          </div>
          <div className="absolute bottom-8 right-8 text-[10px] tracking-[0.3em] text-zinc-500">
            {"// REAL-TIME COGNITION //"}
          </div>
        </div>
      )}
    </div>
  );
}
