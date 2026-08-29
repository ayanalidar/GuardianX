"use client";

/**
 * NeuralLink
 * ----------
 * A React + canvas port of jaredrhod's ai-visualizer "neural" face.
 * Renders a constellation of nodes (brain regions / clusters) connected
 * by faint mesh lines, with traveling dots that pulse along the tendrils.
 *
 * Mapping to GuardianX events (via SignalBus):
 *   - new finding → a new node lights up red
 *   - new patch   → a green connection forms between two nodes
 *   - scanning    → rapid dot traffic
 *   - analyzing   → all nodes brighten, drift speeds up
 *   - idle        → slow pulse, occasional stray thought
 *
 * The board uses a single field canvas + bloom pass (mirrors the
 * original). Cheap enough for the homepage at low opacity; vivid enough
 * for the immersive view at full opacity.
 */

import { useEffect, useRef } from "react";
import { useSignalBus, type VisualizerState } from "./signal-bus";

interface NeuralLinkProps {
  opacity?: number;
  showChrome?: boolean;
  forcedState?: VisualizerState;
  className?: string;
}

const BG = "#02030a";
const INK: [number, number, number] = [96, 140, 220];
const INK_BRIGHT: [number, number, number] = [170, 210, 255];
const AMBER: [number, number, number] = [255, 176, 64];
const RED: [number, number, number] = [255, 52, 52];
const GREEN: [number, number, number] = [74, 240, 122];
const CYAN: [number, number, number] = [56, 200, 255];

type RGB = [number, number, number];

interface Cluster {
  label: string | null;
  cx: number; cy: number; spread: number; hue: RGB; n: number;
}

// Brain-region clusters. Coordinates are in normalized [-1, 1] space.
const CLUSTERS: Cluster[] = [
  { label: "PREFRONTAL",   cx:  0.74, cy: -0.16, spread: 0.11, hue: [96, 165, 250],  n: 90 },
  { label: "MOTOR",        cx:  0.30, cy: -0.44, spread: 0.10, hue: [52, 211, 153],  n: 80 },
  { label: "SENSORY",      cx: -0.06, cy: -0.50, spread: 0.11, hue: [255, 150, 60],  n: 90 },
  { label: "ASSOCIATION",  cx:  0.38, cy:  0.04, spread: 0.13, hue: [150, 110, 250], n: 100 },
  { label: "LANGUAGE",     cx:  0.10, cy:  0.32, spread: 0.10, hue: [56, 200, 255],  n: 80 },
  { label: "VISUAL",       cx: -0.78, cy: -0.06, spread: 0.11, hue: [240, 80, 120],  n: 90 },
  { label: "HIPPOCAMPUS",  cx: -0.32, cy:  0.26, spread: 0.10, hue: [250, 200, 70], n: 70 },
  { label: "CEREBELLUM",   cx: -0.62, cy:  0.36, spread: 0.10, hue: [110, 230, 90],  n: 80 },
  { label: "BRAINSTEM",    cx: -0.16, cy:  0.52, spread: 0.08, hue: [190, 120, 255], n: 60 },
];

interface Node {
  x: number; y: number; z: number;
  hue: RGB;
  ci: number;
  twPhase: number; twSpeed: number;
}
interface Tendril {
  pts: [number, number][]; ci: number;
  sway: number; sf: number; sp: number;
  dots: number[];
  proj9: [number, number][];
}

interface Brain {
  nodes: Node[];
  tendrils: Tendril[];
  heat: Float32Array;
  dots: { ti: number; t: number; s: number }[];
}

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

function gauss(rnd: () => number): number {
  let u = 0, v = 0;
  while (!u) u = rnd();
  while (!v) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v);
}

function buildBrain(): Brain {
  const rnd = mulberry32(7);
  const nodes: Node[] = [];
  CLUSTERS.forEach((cl, ci) => {
    const nCore = cl.n * 0.7 | 0;
    for (let i = 0; i < cl.n; i++) {
      const s = i < nCore ? cl.spread * 0.55 : cl.spread * 1.25;
      nodes.push({
        x: cl.cx + gauss(rnd) * s,
        y: cl.cy + gauss(rnd) * s,
        z: gauss(rnd) * 0.1,
        hue: [
          cl.hue[0] * (0.6 + rnd() * 0.4),
          cl.hue[1] * (0.6 + rnd() * 0.4),
          cl.hue[2] * (0.6 + rnd() * 0.4),
        ] as RGB,
        ci,
        twPhase: rnd() * 6.2832,
        twSpeed: 0.8 + rnd() * 1.4,
      });
    }
  });

  // Tendrils — sparse curves drifting outward from cluster anchors.
  const tendrils: Tendril[] = [];
  for (let k = 0; k < 30; k++) {
    const ci = Math.floor(rnd() * CLUSTERS.length);
    const cl = CLUSTERS[ci];
    const a: [number, number] = [cl.cx + gauss(rnd) * cl.spread, cl.cy + gauss(rnd) * cl.spread];
    let out: [number, number] = [a[0] - cl.cx, a[1] - cl.cy];
    const ol = Math.hypot(out[0], out[1]) + 1e-6;
    out = [out[0] / ol, out[1] / ol];
    const up: [number, number] = a[1] < 0.1 ? [0, -0.6] : [0, 0.3];
    const reach = 0.35 + rnd() * 0.5;
    const end: [number, number] = [
      a[0] + (out[0] + up[0]) * reach + gauss(rnd) * 0.12,
      a[1] + (out[1] + up[1]) * reach + gauss(rnd) * 0.12,
    ];
    const ctrl: [number, number] = [
      (a[0] + end[0]) / 2 + gauss(rnd) * 0.1,
      (a[1] + end[1]) / 2 + gauss(rnd) * 0.1,
    ];
    const curve: [number, number][] = [];
    for (let s = 0; s < 9; s++) {
      const tt = s / 8;
      curve.push([
        (1 - tt) * (1 - tt) * a[0] + 2 * (1 - tt) * tt * ctrl[0] + tt * tt * end[0],
        (1 - tt) * (1 - tt) * a[1] + 2 * (1 - tt) * tt * ctrl[1] + tt * tt * end[1],
      ]);
    }
    const dset = new Set<number>();
    while (dset.size < 2) dset.add(3 + Math.floor(rnd() * 6));
    tendrils.push({
      pts: curve, ci,
      sway: 0.006 + rnd() * 0.012,
      sf: 0.15 + rnd() * 0.25,
      sp: rnd() * 6.2832,
      dots: [...dset].sort((x, y) => x - y).concat([8]),
      proj9: [],
    });
  }

  return {
    nodes,
    tendrils,
    heat: new Float32Array(CLUSTERS.length),
    dots: [],
  };
}

function dim(c: RGB, f: number): string {
  return `rgba(${(c[0] * f) | 0},${(c[1] * f) | 0},${(c[2] * f) | 0},1)`;
}

const STATE_LABEL: Record<VisualizerState, string> = {
  idle: "IDLE",
  scanning: "SCANNING",
  analyzing: "ANALYZING",
  finding: "FINDING",
  patching: "PATCHING",
};

export function NeuralLink({ opacity = 1, showChrome = true, forcedState, className }: NeuralLinkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state: busState } = useSignalBus();
  const stateRef = useRef<VisualizerState>(forcedState ?? busState);
  stateRef.current = forcedState ?? busState;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, cx = 0, cy = 0, scalePx = 0;
    let field: HTMLCanvasElement | null = null;
    let fg: CanvasRenderingContext2D | null = null;
    let buf: ImageData | null = null;
    let bufData: Uint8ClampedArray | null = null;
    let touched: Int32Array | null = null;
    let touchedN = 0;
    const brain = buildBrain();
    let now = 0;
    let last = performance.now();
    let raf = 0;
    let inViewport = true;
    let docVisible = !document.hidden;
    let running = !reduced && inViewport && docVisible;
    const _pr: [number, number, number] = [0, 0, 0];
    const _live: [number, number, number] = [0, 0, 0];

    function resize() {
      if (!canvas) return;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W;
      canvas.height = H;
      cx = (W * 0.46) | 0;
      cy = (H * 0.52) | 0;
      scalePx = Math.min(W, H) * 0.52;
      field = document.createElement("canvas");
      field.width = W; field.height = H;
      fg = field.getContext("2d");
      buf = fg!.createImageData(W, H);
      bufData = buf.data;
      touched = new Int32Array(W * H);
      touchedN = 0;
    }

    function project(x: number, y: number, z: number, t: number, out: [number, number, number]) {
      const yaw = 0.16 * Math.sin(t * 0.45);
      const wob = 0.06 * Math.sin(t * 0.31 + 1.3);
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const cxw = Math.cos(wob), sxw = Math.sin(wob);
      const x2 = x * cyw + z * syw;
      const z2 = -x * syw + z * cyw;
      const y2 = y * cxw - z2 * sxw;
      const z3 = y * sxw + z2 * cxw;
      const persp = 3 / (3 + z3);
      out[0] = cx + x2 * scalePx * persp;
      out[1] = cy + y2 * scalePx * persp * 0.98;
      out[2] = persp;
    }

    function splat(xi: number, yi: number, r: number, g: number, b: number, f: number) {
      if (!bufData || !touched) return;
      if (xi < 1 || xi >= W - 2 || yi < 1 || yi >= H - 2) return;
      const i = (yi * W + xi) * 4;
      if (bufData[i + 3] === 0) {
        touched[touchedN++] = i;
        bufData[i + 3] = 255;
      }
      bufData[i] = Math.min(255, bufData[i] + r * f);
      bufData[i + 1] = Math.min(255, bufData[i + 1] + g * f);
      bufData[i + 2] = Math.min(255, bufData[i + 2] + b * f);
    }

    function frame(ts: number) {
      if (!running || !fg || !buf || !bufData || !field) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(50, ts - last);
      last = ts;
      now += dt;
      const st = stateRef.current;
      const t = now / 1000;
      const dts = dt / 1000;
      const env =
        st === "analyzing" ? 0.9 :
        st === "scanning" ? 0.6 :
        st === "finding" ? 0.7 :
        st === "patching" ? 0.5 :
        0.2;

      // Clear touched (touched/bufData are assigned together in resize();
      // the early-return above already proved !bufData, so touched is set.)
      for (let k = 0; k < touchedN; k++) {
        const i = touched![k];
        bufData[i] = 0; bufData[i + 1] = 0; bufData[i + 2] = 0; bufData[i + 3] = 0;
      }
      touchedN = 0;

      const breath = 1 + 0.008 * Math.sin(t * 0.5) + 0.018 * env;
      const base =
        st === "idle" ? 0.38 :
        st === "scanning" ? 0.5 :
        st === "analyzing" ? 0.95 :
        st === "finding" ? 0.7 :
        st === "patching" ? 0.6 :
        0.38;
      const alert = st === "finding";

      // Heat — drive clusters per-state
      const heat = brain.heat;
      const decay = 1.6 + 3.4 * (st === "analyzing" ? 1 : 0);
      for (let i = 0; i < heat.length; i++) heat[i] *= Math.max(0, 1 - dts * decay);
      if (st === "scanning" || st === "analyzing") {
        heat[2] = Math.max(heat[2], 0.6 + 0.4 * env); // SENSORY
        heat[5] = Math.max(heat[5], 0.3 + 0.3 * env); // VISUAL
      }
      if (st === "patching") {
        heat[1] = Math.max(heat[1], 0.6 + 0.4 * env); // MOTOR
        heat[4] = Math.max(heat[4], 0.6 + 0.4 * env); // LANGUAGE
      }
      if (st === "finding") {
        heat[5] = Math.max(heat[5], 0.8); // VISUAL red
      }

      // Traveling dots
      const rate = (st === "analyzing" ? 13 : st === "scanning" ? 9 : st === "finding" ? 7 : 1.4) * (1 + 1.5 * env);
      if (Math.random() < rate * dts) {
        brain.dots.push({ ti: Math.random() * brain.tendrils.length | 0, t: 0, s: 0.35 + Math.random() * 0.35 });
      }
      const dotSpeed = 1 + 1.6 * (st === "analyzing" ? 1 : 0) + 0.6 * (st === "scanning" ? 1 : 0);
      for (const d of brain.dots) d.t += dts * d.s * dotSpeed;
      brain.dots = brain.dots.filter((d) => d.t < 1).slice(0, 60);

      // Nodes → pixel buffer
      for (let i = 0; i < brain.nodes.length; i++) {
        const node = brain.nodes[i];
        const ci = node.ci;
        const cc = CLUSTERS[ci];
        const bfac = 1 + 0.035 * Math.sin(t * 0.7 + ci * 1.7);
        _live[0] = (cc.cx + (node.x - cc.cx) * bfac) * breath;
        _live[1] = (cc.cy + (node.y - cc.cy) * bfac) * breath;
        _live[2] = node.z * breath;
        project(_live[0], _live[1], _live[2], t, _pr);
        const tw = 0.62 + 0.38 * Math.sin(t * node.twSpeed + node.twPhase);
        const bright = Math.min((base + 0.32 * env + 0.7 * heat[ci]) * tw * _pr[2], 1.18);
        let r: number, g: number, b: number;
        if (alert) {
          r = 255 * bright;
          g = (50 + node.hue[1] * 0.1) * bright;
          b = 45 * bright;
        } else {
          r = node.hue[0] * bright;
          g = node.hue[1] * bright;
          b = node.hue[2] * bright;
        }
        splat(_pr[0] | 0, _pr[1] | 0, r, g, b, 1);
        splat((_pr[0] | 0) + 1, _pr[1] | 0, r, g, b, 0.45);
        splat(_pr[0] | 0, (_pr[1] | 0) + 1, r, g, b, 0.45);
      }
      fg!.putImageData(buf, 0, 0);

      // Lines into the same field (so they bloom)
      fg!.globalCompositeOperation = "lighter";
      for (const td of brain.tendrils) {
        const off = td.sway * Math.sin(t * td.sf + td.sp);
        fg!.strokeStyle = dim(alert ? RED : [120, 132, 168], 0.42 + 0.15 * env);
        fg!.lineWidth = 1;
        fg!.beginPath();
        const proj9: [number, number][] = [];
        for (let s = 0; s < 9; s++) {
          const p = td.pts[s];
          _live[0] = (p[0] + off * Math.pow(s / 8, 2)) * breath;
          _live[1] = p[1] * breath;
          _live[2] = 0;
          project(_live[0], _live[1], _live[2], t, _pr);
          proj9.push([_pr[0], _pr[1]]);
          if (s === 0) fg!.moveTo(_pr[0], _pr[1]);
          else fg!.lineTo(_pr[0], _pr[1]);
        }
        fg!.stroke();
        fg!.fillStyle = dim(alert ? RED : [235, 240, 255], 0.75 + 0.25 * env);
        for (const di of td.dots) {
          fg!.beginPath();
          fg!.arc(proj9[di][0], proj9[di][1], 2, 0, 6.29);
          fg!.fill();
        }
        td.proj9 = proj9;
      }
      fg!.fillStyle = alert ? dim(RED, 1) : "rgb(245,248,255)";
      for (const d of brain.dots) {
        const proj9 = brain.tendrils[d.ti].proj9;
        if (!proj9 || proj9.length === 0) continue;
        const seg = d.t * 8;
        const kk = Math.min(7, seg | 0);
        const frac = seg - kk;
        if (!proj9[kk + 1]) continue;
        const x = proj9[kk][0] + (proj9[kk + 1][0] - proj9[kk][0]) * frac;
        const y = proj9[kk][1] + (proj9[kk + 1][1] - proj9[kk][1]) * frac;
        fg!.beginPath();
        fg!.arc(x, y, 3, 0, 6.29);
        fg!.fill();
      }
      fg!.globalCompositeOperation = "source-over";

      // Bloom — two-pass: shrink + blur via globalAlpha overlay of the field.
      // (ctx is the outer canvas context; it's checked non-null at the top
      // of the effect — TS can't carry that narrowing through a nested
      // function declaration, so we re-assert here.)
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, W, H);
      ctx!.globalAlpha = 0.85;
      ctx!.drawImage(field, 0, 0);
      ctx!.globalAlpha = 0.4;
      ctx!.filter = "blur(6px)";
      ctx!.drawImage(field, 0, 0);
      ctx!.filter = "none";
      ctx!.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
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
      // Static render once
      if (field && fg && buf && bufData) {
        // Snapshot the narrowed bindings into local consts with explicit
        // types. The for-loop below calls splat(), which captures the
        // outer `let` bufData/touched by reference; after that call TS
        // conservatively widens the outer `let`s back to `| null`, and
        // in this branch it even infers `fg` as `never` (because the
        // for-loop is the last statement TS analyzes before the next
        // use). Capturing into typed consts sidesteps the narrowing
        // loss entirely.
        const fgc = fg as CanvasRenderingContext2D;
        const bufc = buf as ImageData;
        const fieldc = field as HTMLCanvasElement;
        // Just splat the nodes once, no animation
        const t = 0;
        for (let i = 0; i < brain.nodes.length; i++) {
          const node = brain.nodes[i];
          const cc = CLUSTERS[node.ci];
          _live[0] = cc.cx; _live[1] = cc.cy; _live[2] = 0;
          project(_live[0], _live[1], _live[2], t, _pr);
          splat(_pr[0] | 0, _pr[1] | 0, node.hue[0], node.hue[1], node.hue[2], 1);
        }
        fgc.putImageData(bufc, 0, 0);
        ctx!.fillStyle = BG;
        ctx!.fillRect(0, 0, W, H);
        ctx!.drawImage(fieldc, 0, 0);
      }
    } else if (running) {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  const state = forcedState ?? busState;
  const stateColor =
    state === "finding" ? "text-red-400" :
    state === "patching" ? "text-emerald-400" :
    state === "analyzing" ? "text-amber-400" :
    state === "scanning" ? "text-cyan-400" :
    "text-zinc-400";

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`} style={{ opacity, background: BG }}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      {showChrome && (
        <div className="pointer-events-none absolute inset-0 z-10 select-none font-mono">
          <div className="absolute left-4 top-4 size-7 border-l border-t border-cyan-500/40" />
          <div className="absolute right-4 top-4 size-7 border-r border-t border-cyan-500/40" />
          <div className="absolute bottom-4 left-4 size-7 border-l border-b border-cyan-500/40" />
          <div className="absolute bottom-4 right-4 size-7 border-r border-b border-cyan-500/40" />
          <div className="absolute left-7 top-7">
            <div className="text-sm font-bold tracking-[0.4em] text-cyan-300">GUARDIANX</div>
            <div className="mt-1 text-[9px] tracking-[0.3em] text-zinc-500">NEURAL CORE // COGNITIVE</div>
          </div>
          <div className="absolute right-7 top-7 text-right">
            <div className={`text-sm tracking-[0.5em] ${stateColor} ${state !== "idle" ? "animate-pulse" : ""}`}>
              {STATE_LABEL[state]}
            </div>
            <div className="mt-1 text-[9px] tracking-[0.3em] text-cyan-400/70">COGNITIVE MAP</div>
          </div>
        </div>
      )}
    </div>
  );
}
