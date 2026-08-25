"use client";

/**
 * GestureControl
 * --------------
 * barehands-inspired hand-tracking for the GuardianX War Room.
 *
 * barehands (github.com/jaredrhod/barehands) is a hand-tracked glass
 * interface built on MediaPipe's `@mediapipe/tasks-vision` HandLandmarker
 * running in a vanilla HTML page. We port its *gesture vocabulary* —
 * pinch, swipe, palm, fist, two-hand zoom — onto the slightly older
 * `@mediapipe/hands` + `@mediapipe/camera_utils` npm packages, because
 * those ship as ES modules with first-class TypeScript types and a
 * `Camera` helper that owns the rAF loop. Same model, same landmarks,
 * same gestures; just packaged for React.
 *
 * Landmarks used (MediaPipe Hands, 21 points per hand):
 *
 *     0  wrist
 *     4  thumb tip
 *     8  index tip     ← cursor position
 *    12  middle tip
 *    16  ring tip
 *    20  pinky tip
 *    2  thumb MCP, 5/9/13/17 finger MCPs (knuckles)
 *
 * Gesture → intent:
 *
 *   pinch (thumb+index < 0.05) → click / select (synthetic click on
 *                                 the element under the cursor)
 *   swipe (wrist x travels > 0.3 in < 350ms) → tab nav (onSwipe)
 *   open palm (4 fingers extended) → scroll the viewport under cursor
 *   fist (4 fingers curled, thumb in) → close modal / dispatch ESC
 *   two-hand pinch                 → zoom (distance grows = zoom in)
 *
 * The component renders:
 *   - a small camera preview in the corner (toggleable)
 *   - an optional hand-landmark skeleton overlay (calibration)
 *   - a fixed-position cursor that tracks the index fingertip
 *
 * Everything degrades gracefully: if `getUserMedia` is denied, if the
 * MediaPipe WASM fails to load, or if the browser can't do WebGL — the
 * component shows a "GESTURE OFFLINE" chip and the rest of the War Room
 * keeps working with voice and mouse.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hand,
  HandMetal,
  Camera as CameraIcon,
  CameraOff,
  Loader2,
  ZoomIn,
  X,
  MoveHorizontal,
} from "lucide-react";
import {
  type NormalizedLandmark,
  type Results,
} from "@mediapipe/hands";
// The @mediapipe/hands + @mediapipe/camera_utils packages ship as
// IIFE-on-window rather than real ESM. A static named import
// (`import { Hands }`) makes the bundler error with "The export Hands
// was not found" because the module genuinely has zero ESM exports.
// Instead we side-effect-import the JS (which executes the IIFE and
// attaches `Hands` / `HAND_CONNECTIONS` / `Camera` to `globalThis`),
// then read them off `globalThis` at runtime. Type-only imports above
// are erased at compile time so they don't trip the bundler.
import "@mediapipe/hands";
import "@mediapipe/camera_utils";

// Runtime symbol access. `as any` because the packages don't declare
// these as ESM exports — they're attached to globalThis by the IIFEs
// above. They're only referenced inside useEffect/useCallback, which
// run in the browser where the side-effect imports have already fired.
const Hands = (globalThis as any).Hands as (typeof import("@mediapipe/hands"))["Hands"];
const HAND_CONNECTIONS = (globalThis as any).HAND_CONNECTIONS as (typeof import("@mediapipe/hands"))["HAND_CONNECTIONS"];
const Camera = (globalThis as any).Camera as (typeof import("@mediapipe/camera_utils"))["Camera"];

// ── Types ──────────────────────────────────────────────────────────────────
export type GestureEvent =
  | { kind: "click"; x: number; y: number }
  | { kind: "swipe"; direction: "left" | "right" }
  | { kind: "fist" }
  | { kind: "palm" }
  | { kind: "zoom"; delta: number };

export interface GestureControlHandle {
  enable(): Promise<void>;
  disable(): void;
  isEnabled(): boolean;
}

export interface GestureControlProps {
  /** Notified on every recognized gesture. Parent (War Room overlay) uses
   *  swipe to switch tabs and fist to close the overlay. */
  onGesture?: (e: GestureEvent) => void;
  /** Optional CSS class for the wrapper. */
  className?: string;
}

// ── Gesture thresholds (tuned for ~6ft webcam distance) ─────────────────────
const PINCH_DIST = 0.055;        // normalized; thumb-index < this = pinch
const SWIPE_DELTA = 0.32;        // wrist x must travel this far
const SWIPE_WINDOW_MS = 380;     // ...within this time window
const FIST_CLICK_DEBOUNCE_MS = 450;
const SWIPE_DEBOUNCE_MS = 600;
const SCROLL_SPEED = 14;         // px per frame of palm-scroll
const ZOOM_PINCH_MIN = 0.06;     // below this we don't trust two-hand zoom

// ── Helpers ────────────────────────────────────────────────────────────────
function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** A finger is "extended" if its tip is above (smaller y) its PIP joint. */
function isFingerExtended(lm: NormalizedLandmark[], tip: number, pip: number): boolean {
  return lm[tip].y < lm[pip].y - 0.01;
}

/** Thumb extended: tip x is further from the index MCP than the thumb IP. */
function isThumbExtended(lm: NormalizedLandmark[]): boolean {
  // In selfie mode, left hand is mirrored. Use distance from wrist as a
  // rough proxy: an extended thumb is further from the wrist (landmark 0)
  // than a curled thumb.
  return dist(lm[4], lm[0]) > dist(lm[2], lm[0]) * 1.1;
}

function countExtendedFingers(lm: NormalizedLandmark[]): number {
  let n = 0;
  if (isFingerExtended(lm, 8, 6)) n++;   // index
  if (isFingerExtended(lm, 12, 10)) n++; // middle
  if (isFingerExtended(lm, 16, 14)) n++; // ring
  if (isFingerExtended(lm, 20, 18)) n++; // pinky
  return n;
}

// ── Component ──────────────────────────────────────────────────────────────
export const GestureControl = forwardRef<GestureControlHandle, GestureControlProps>(
  function GestureControl({ onGesture, className }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const handsRef = useRef<Hands | null>(null);
    const cameraRef = useRef<Camera | null>(null);

    // Mutable gesture state — kept in a ref so the onResults closure
    // always reads the latest without re-subscribing.
    const gs = useRef({
      lastPinch: false,
      lastFist: false,
      lastPalm: false,
      lastSwipeAt: 0,
      lastFistAt: 0,
      wristHistory: [] as Array<{ x: number; y: number; t: number }>,
      cursorX: 0,
      cursorY: 0,
      zoomPrevDist: null as number | null,
    }).current;

    const [enabled, setEnabled] = useState(false);
    const [booting, setBooting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(true);
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [handsVisible, setHandsVisible] = useState(0);
    const [pinching, setPinching] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [lastGesture, setLastGesture] = useState<string | null>(null);

    // ── The onResults handler — owns all gesture detection ────────────────
    // Defined with useCallback + refs so we can swap it in without
    // re-creating the Hands instance.
    const onGestureRef = useRef(onGesture);
    useEffect(() => {
      onGestureRef.current = onGesture;
    }, [onGesture]);

    const handleResults = useCallback((results: Results) => {
      const hands = results.multiHandLandmarks || [];
      setHandsVisible(hands.length);

      // Draw skeleton on the canvas overlay (mirror to match selfie view).
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Mirror horizontally so the preview matches a selfie view.
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          if (results.image) {
            ctx.drawImage(results.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
          }
          if (showSkeleton) {
            for (const lm of hands) {
              ctx.strokeStyle = "rgba(61, 220, 132, 0.8)";
              ctx.lineWidth = 2;
              for (const [a, b] of HAND_CONNECTIONS) {
                const p1 = lm[a];
                const p2 = lm[b];
                if (!p1 || !p2) continue;
                ctx.beginPath();
                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                ctx.stroke();
              }
              ctx.fillStyle = "rgba(255, 179, 71, 0.9)";
              for (const p of lm) {
                ctx.beginPath();
                ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          ctx.restore();
        }
      }

      // No hands → idle cursor, reset history.
      if (hands.length === 0) {
        gs.lastPinch = false;
        gs.lastFist = false;
        gs.lastPalm = false;
        gs.wristHistory = [];
        gs.zoomPrevDist = null;
        setPinching(false);
        setCursorPos(null);
        return;
      }

      // ── Primary hand: hand[0]. Cursor + click + fist + palm + swipe ───
      const primary = hands[0];
      const indexTip = primary[8];
      const thumbTip = primary[4];
      const wrist = primary[0];

      // Map normalized (selfie-mirrored) → screen. We flip x so the
      // user's right hand moves the cursor right (mirror).
      const screenX = (1 - indexTip.x) * window.innerWidth;
      const screenY = indexTip.y * window.innerHeight;
      gs.cursorX = screenX;
      gs.cursorY = screenY;
      setCursorPos({ x: screenX, y: screenY });

      // ── Pinch → click (rising edge) ────────────────────────────────────
      const pinchDist = dist(thumbTip, indexTip);
      const isPinching = pinchDist < PINCH_DIST;
      if (isPinching && !gs.lastPinch) {
        setPinching(true);
        // Synthetic click at the cursor position.
        const target = document.elementFromPoint(screenX, screenY) as HTMLElement | null;
        if (target) {
          // Walk up to the closest clickable ancestor — most War Room
          // chrome uses <button>, [role="button"], or [data-gx-clickable].
          const clickable = target.closest(
            'button, a, [role="button"], [role="tab"], [data-gx-clickable], input, select, summary',
          ) as HTMLElement | null;
          (clickable ?? target).click();
        }
        onGestureRef.current?.({ kind: "click", x: screenX, y: screenY });
        flash("PINCH");
      }
      if (!isPinching && gs.lastPinch) {
        setPinching(false);
      }
      gs.lastPinch = isPinching;

      // ── Finger-count gestures: fist / palm ──────────────────────────────
      const extended = countExtendedFingers(primary);
      const thumbExt = isThumbExtended(primary);
      const isFist = extended === 0 && !thumbExt;
      const isPalm = extended >= 4 && thumbExt;

      if (isFist && !gs.lastFist && Date.now() - gs.lastFistAt > FIST_CLICK_DEBOUNCE_MS) {
        gs.lastFistAt = Date.now();
        onGestureRef.current?.({ kind: "fist" });
        // Also dispatch a synthetic ESC so any open modal/dialog closes.
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flash("FIST");
      }
      gs.lastFist = isFist;

      if (isPalm && !gs.lastPalm) {
        onGestureRef.current?.({ kind: "palm" });
        flash("PALM");
      }
      // Open palm + vertical motion → scroll the viewport.
      if (isPalm) {
        // Track palm Y velocity using the middle-finger MCP (9).
        const mcp = primary[9];
        const prev = gs.wristHistory[gs.wristHistory.length - 1];
        if (prev) {
          const dy = mcp.y - prev.y;
          // dy > 0 (palm moves down) → scroll down
          window.scrollBy({ top: dy * SCROLL_SPEED * 60, behavior: "auto" });
        }
        gs.wristHistory = [{ x: wrist.x, y: mcp.y, t: Date.now() }];
      } else {
        // ── Swipe → tab nav (only when not palm-scrolling) ───────────────
        gs.wristHistory.push({ x: wrist.x, y: wrist.y, t: Date.now() });
        // Trim to the swipe window.
        const cutoff = Date.now() - SWIPE_WINDOW_MS;
        while (gs.wristHistory.length > 0 && gs.wristHistory[0].t < cutoff) {
          gs.wristHistory.shift();
        }
        if (gs.wristHistory.length >= 2 && Date.now() - gs.lastSwipeAt > SWIPE_DEBOUNCE_MS) {
          const oldest = gs.wristHistory[0];
          const dx = wrist.x - oldest.x;
          // In selfie-mirrored space, wrist moving left in image = right
          // in real space. Flip the sign so "swipe right" means the
          // user moved their hand to the right.
          if (Math.abs(dx) > SWIPE_DELTA) {
            // dx > 0 (wrist traveled right in normalized image space)
            // → in mirrored view, that's a swipe to the left.
            const direction = dx > 0 ? "left" : "right";
            gs.lastSwipeAt = Date.now();
            gs.wristHistory = [];
            onGestureRef.current?.({ kind: "swipe", direction });
            flash(`SWIPE ${direction.toUpperCase()}`);
          }
        }
      }
      gs.lastPalm = isPalm;

      // ── Two-hand zoom ──────────────────────────────────────────────────
      if (hands.length >= 2) {
        const a = hands[0][8]; // primary index tip
        const b = hands[1][8]; // secondary index tip
        const d = dist(a, b);
        // Both hands must be pinching for zoom to engage, so a stray
        // second hand doesn't pan the view.
        const aPinch = dist(hands[0][4], hands[0][8]) < PINCH_DIST;
        const bPinch = dist(hands[1][4], hands[1][8]) < PINCH_DIST;
        if (aPinch && bPinch && d > ZOOM_PINCH_MIN) {
          if (gs.zoomPrevDist != null) {
            const delta = d - gs.zoomPrevDist;
            if (Math.abs(delta) > 0.01) {
              onGestureRef.current?.({ kind: "zoom", delta });
              flash(delta > 0 ? "ZOOM +" : "ZOOM −");
            }
          }
          gs.zoomPrevDist = d;
        } else {
          gs.zoomPrevDist = null;
        }
      } else {
        gs.zoomPrevDist = null;
      }
    }, [gs, showSkeleton]);

    function flash(label: string) {
      setLastGesture(label);
      window.setTimeout(() => {
        setLastGesture((cur) => (cur === label ? null : cur));
      }, 900);
    }

    // ── Boot: instantiate Hands + Camera, start streaming ────────────────
    const enable = useCallback(async () => {
      if (enabled || booting) return;
      setBooting(true);
      setError(null);
      try {
        if (!videoRef.current) throw new Error("video element not ready");
        // Hands needs to load WASM assets. locateFile routes them to the
        // jsDelivr CDN so we don't have to serve them ourselves.
        const hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
          selfieMode: true,
        });
        hands.onResults(handleResults);
        await hands.initialize();
        handsRef.current = hands;

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              try {
                await handsRef.current.send({ image: videoRef.current });
              } catch {
                /* a single frame failure is non-fatal */
              }
            }
          },
          facingMode: "user",
          width: 640,
          height: 480,
        });
        await camera.start();
        cameraRef.current = camera;
        setEnabled(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Camera permission denied is the most common failure — give the
        // user a friendlier message.
        if (/permission|denied|notallowed/i.test(msg)) {
          setError("Camera permission denied. Gesture control needs webcam access.");
        } else if (/webgl|gpu/i.test(msg)) {
          setError("WebGL unavailable. Gesture control needs a GPU-capable browser.");
        } else {
          setError(`Gesture init failed: ${msg}`);
        }
      } finally {
        setBooting(false);
      }
    }, [booting, enabled, handleResults]);

    const disable = useCallback(() => {
      try {
        cameraRef.current?.stop();
      } catch {
        /* noop */
      }
      try {
        handsRef.current?.close();
      } catch {
        /* noop */
      }
      cameraRef.current = null;
      handsRef.current = null;
      setEnabled(false);
      setPinching(false);
      setCursorPos(null);
      setHandsVisible(0);
      gs.lastPinch = false;
      gs.lastFist = false;
      gs.lastPalm = false;
      gs.wristHistory = [];
      gs.zoomPrevDist = null;
    }, [gs]);

    // ── Cleanup on unmount ───────────────────────────────────────────────
    useEffect(() => {
      return () => {
        try {
          cameraRef.current?.stop();
        } catch {
          /* noop */
        }
        try {
          handsRef.current?.close();
        } catch {
          /* noop */
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      (): GestureControlHandle => ({
        enable,
        disable,
        isEnabled: () => enabled,
      }),
      [enable, disable, enabled],
    );

    // ── Render ────────────────────────────────────────────────────────────
    return (
      <div className={className}>
        {/* Hidden video element — MediaPipe reads frames from here. */}
        <video
          ref={videoRef}
          className="pointer-events-none absolute h-px w-px opacity-0"
          autoPlay
          playsInline
          muted
        />

        {/* Camera preview + skeleton overlay (corner) */}
        <AnimatePresence>
          {enabled && showPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute bottom-4 right-4 z-30 overflow-hidden rounded-lg border border-emerald-500/40 bg-zinc-950/80 shadow-xl backdrop-blur"
            >
              <canvas
                ref={canvasRef}
                width={320}
                height={240}
                className="block h-[120px] w-[160px] object-cover"
              />
              <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-black/60 px-2 py-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                  CAM · {handsVisible}H
                </span>
                <button
                  onClick={() => setShowSkeleton((s) => !s)}
                  className="font-mono text-[9px] text-zinc-500 hover:text-emerald-300"
                >
                  {showSkeleton ? "HIDE SKEL" : "SHOW SKEL"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating cursor (follows index fingertip) */}
        <AnimatePresence>
          {enabled && cursorPos && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: cursorPos.x - 16, y: cursorPos.y - 16 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 35, mass: 0.4 }}
              className="pointer-events-none fixed left-0 top-0 z-[300] size-8"
            >
              <div
                className={`size-8 rounded-full border-2 transition-colors ${
                  pinching
                    ? "border-red-400 bg-red-500/40 shadow-[0_0_24px_rgba(255,77,94,0.7)]"
                    : "border-emerald-400 bg-emerald-500/10 shadow-[0_0_16px_rgba(61,220,132,0.5)]"
                }`}
              >
                {/* crosshair */}
                <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gesture flash toast (top-center) */}
        <AnimatePresence>
          {enabled && lastGesture && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-emerald-500/50 bg-zinc-950/90 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-emerald-300 backdrop-blur"
            >
              {lastGesture}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle / status card */}
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hand className="size-4 text-emerald-400" />
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">
                Gesture Control
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  enabled ? "bg-emerald-500 animate-pulse" : error ? "bg-red-500" : "bg-zinc-600"
                }`}
              />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                {enabled ? `${handsVisible} HAND${handsVisible === 1 ? "" : "S"}` : error ? "OFFLINE" : "STANDBY"}
              </span>
            </div>
          </div>

          {/* Status / error strip */}
          <div className="min-h-[2.5rem] rounded-lg border border-zinc-800 bg-black/40 p-2 font-mono text-xs">
            {error ? (
              <div className="flex items-start gap-2 text-red-400">
                <X className="mt-0.5 size-3 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            ) : enabled ? (
              <div className="flex items-center gap-2 text-emerald-300">
                <HandMetal className="size-3 shrink-0" />
                <span>Tracking {handsVisible} hand{handsVisible === 1 ? "" : "s"}. Move your hands to control the War Room.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-zinc-500">
                <CameraOff className="size-3 shrink-0" />
                <span>Camera off. Enable to start hand tracking (needs webcam permission).</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (enabled ? disable() : enable())}
              disabled={booting}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                enabled
                  ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              {booting ? <Loader2 className="size-3 animate-spin" /> : enabled ? <CameraOff className="size-3" /> : <CameraIcon className="size-3" />}
              {booting ? "Starting…" : enabled ? "Disable" : "Enable"}
            </button>
            {enabled && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPreview((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {showPreview ? <CameraOff className="size-3" /> : <CameraIcon className="size-3" />}
                  {showPreview ? "Hide Cam" : "Show Cam"}
                </button>
                <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-black/40 px-3 py-1.5 font-mono text-[10px] text-zinc-500">
                  <MoveHorizontal className="size-3" /> SWIPE
                  <span className="text-zinc-700">·</span>
                  <Hand className="size-3" /> PINCH
                  <span className="text-zinc-700">·</span>
                  <HandMetal className="size-3" /> FIST
                  <span className="text-zinc-700">·</span>
                  <ZoomIn className="size-3" /> 2H ZOOM
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
);
