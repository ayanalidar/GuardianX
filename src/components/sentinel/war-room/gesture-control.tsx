"use client";

/**
 * GestureControl (advanced)
 * -------------------------
 * Hand-tracked gesture control for GuardianX. Two tracking engines:
 *
 *  • advanced (default, prop `advanced={true}`) — 5-frame moving-average
 *    smoothing on the index fingertip, more discriminating pinch/fist
 *    heuristics, additional gestures (swipe_up, swipe_down, select_mode,
 *    rotate), two-hand pinch-midpoint zoom, and hover-dwell auto-click.
 *
 *  • simple (`advanced={false}`) — the original barehands-port heuristics
 *    (basic pinch distance, finger-count fist/palm, wrist-x swipe). Kept
 *    for back-compat.
 *
 * Both engines share the same UI: a floating cursor that tracks the index
 * fingertip, an optional camera preview (hidden by default — toggle with
 * the tiny CAM button in the corner), and a gesture flash toast.
 *
 * `compact={true}` strips the UI down to just the floating cursor + a tiny
 * status chip, for embedding in the Command Center where gesture control
 * runs silently in the background.
 *
 * Still built on the legacy `@mediapipe/hands` + `@mediapipe/camera_utils`
 * packages (IIFE-on-window). The `Hands` / `HAND_CONNECTIONS` / `Camera`
 * symbols are read off `globalThis` — see the side-effect imports below.
 *
 * Landmarks (MediaPipe Hands, 21 points per hand):
 *
 *     0  wrist                9  middle MCP
 *     2  thumb IP             10 middle PIP
 *     4  thumb tip            12 middle tip
 *     5  index MCP            13 ring MCP
 *     6  index PIP             14 ring PIP
 *     8  index tip            16 ring tip
 *                            17 pinky MCP
 *                            18 pinky PIP
 *                            20 pinky tip
 *
 * Gesture → intent:
 *
 *   pinch (thumb+index < 0.05, thumb tip below index MCP)  → click / select
 *   fist (4 tips below PIPs, thumb near index MCP)         → ESC / close modal
 *   open palm (5 fingers extended)                          → scroll viewport
 *   swipe (wrist travels > 0.25 in < 300ms)                → tab nav (left/right)
 *                                                           or swipe_up / swipe_down
 *   3-finger swipe (mid+ring+pinky ext, index+thumb curled,
 *                   wrist moves)                           → swipe (vertical)
 *   L-shape (thumb+index ext, middle+ring+pinky curled)    → select_mode
 *   two-hand pinch (both hands pinching, moving apart)     → zoom in/out
 *   palm-rotate (open palm + wrist rotation)               → rotate viewport
 *   hover dwell (cursor over clickable > 800ms)            → auto-click
 *
 * Everything degrades gracefully: if `getUserMedia` is denied, if the
 * MediaPipe WASM fails to load, or if the browser can't do WebGL — the
 * component shows a "GESTURE OFFLINE" chip and the rest of the host
 * (War Room overlay or Command Center) keeps working with voice + mouse.
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
  MousePointer2,
  Grab,
  Pointer,
} from "lucide-react";
import { type NormalizedLandmark, type Results } from "@mediapipe/hands";
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
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Runtime symbol access — done LAZILY inside the enable() effect, not at
// module load. The @mediapipe/hands + @mediapipe/camera_utils packages
// ship as IIFE-on-window. The side-effect imports above execute the IIFE
// which attaches `Hands` / `HAND_CONNECTIONS` / `Camera` to `window`/
// `globalThis`. But on Vercel's production build (Turbopack), the
// top-level `const Hands = (globalThis as any).Hands` was evaluating
// BEFORE the IIFE had attached the symbol — resulting in `undefined`,
// which then threw "p1 is not a constructor" when `new Hands({...})`
// ran inside the effect.
//
// Fix: read the symbols off globalThis INSIDE the effect, at runtime,
// right before they're needed. By that point the side-effect imports
// have definitely fired.
function getHandsCtor(): typeof import("@mediapipe/hands")["Hands"] {
  const g = globalThis as any;
  return g.Hands || g.window?.Hands;
}
function getHandConnections(): typeof import("@mediapipe/hands")["HAND_CONNECTIONS"] {
  const g = globalThis as any;
  return g.HAND_CONNECTIONS || g.window?.HAND_CONNECTIONS;
}
function getCameraCtor(): typeof import("@mediapipe/camera_utils")["Camera"] {
  const g = globalThis as any;
  return g.Camera || g.window?.Camera;
}

// ── Types ──────────────────────────────────────────────────────────────────
export type GestureEvent =
  | { kind: "click"; x: number; y: number }
  | { kind: "swipe"; direction: "left" | "right" }
  | { kind: "swipe_up" }
  | { kind: "swipe_down" }
  | { kind: "fist" }
  | { kind: "palm" }
  | { kind: "zoom"; delta: number }
  | { kind: "select_mode" }
  | { kind: "rotate"; delta: number };

export interface GestureControlHandle {
  enable(): Promise<void>;
  disable(): void;
  isEnabled(): boolean;
}

export interface GestureControlProps {
  /** Notified on every recognized gesture. Parent (War Room overlay /
   *  Command Center) uses swipe to switch tabs, fist to close, etc. */
  onGesture?: (e: GestureEvent) => void;
  /** Optional CSS class for the wrapper. */
  className?: string;
  /** Use the advanced heuristics: 5-frame moving-average smoothing on the
   *  index fingertip, more discriminating pinch/fist detection, new
   *  gesture variants (swipe_up, swipe_down, select_mode, rotate), two-hand
   *  pinch-midpoint zoom, and hover-dwell auto-click. Default true.
   *  Set false to fall back to the original simple heuristics (back-compat). */
  advanced?: boolean;
  /** Compact mode for the Command Center — renders only the floating cursor
   *  + a tiny status chip. No camera preview, no CAM toggle, no controls
   *  card. Gesture control runs silently in the background. */
  compact?: boolean;
}

// ── Cursor visual state ────────────────────────────────────────────────────
type CursorMode = "default" | "pinching" | "fist" | "palm" | "select";

// ── Gesture thresholds (tuned for ~6ft webcam distance) ─────────────────────
// Simple-mode thresholds (back-compat with the original barehands port).
const PINCH_DIST = 0.055;        // normalized; thumb-index < this = pinch
const SWIPE_DELTA = 0.32;         // wrist x must travel this far
const SWIPE_WINDOW_MS = 380;     // ...within this time window
const FIST_CLICK_DEBOUNCE_MS = 450;
const SWIPE_DEBOUNCE_MS = 600;
const SCROLL_SPEED = 14;         // px per frame of palm-scroll
const ZOOM_PINCH_MIN = 0.06;     // below this we don't trust two-hand zoom

// Advanced-mode thresholds.
const PINCH_DIST_ADV = 0.05;            // thumb-index tip distance for pinch
const SWIPE_DELTA_ADV = 0.25;           // wrist travel for swipe
const SWIPE_WINDOW_MS_ADV = 300;        // ...within this time window
const PINCH_DEBOUNCE_ADV_MS = 300;
const FIST_DEBOUNCE_ADV_MS = 500;
const SWIPE_DEBOUNCE_ADV_MS = 600;
const SELECT_MODE_DEBOUNCE_MS = 800;
const ROTATE_DEBOUNCE_MS = 400;
const ROTATE_MIN_DELTA_RAD = 0.3;
const ZOOM_PINCH_MIN_ADV = 0.06;
const HOVER_DWELL_MS = 800;
const SMOOTH_FRAMES = 5;
const FIST_THUMB_MCP_DIST = 0.08;       // thumb tip ↔ index MCP for "fist"

// ── Helpers ────────────────────────────────────────────────────────────────
function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** A finger is "extended" if its tip is above (smaller y) its PIP joint. */
function isFingerExtended(lm: NormalizedLandmark[], tip: number, pip: number): boolean {
  return lm[tip].y < lm[pip].y - 0.01;
}

/** A finger is "curled" if its tip is below (larger y) its PIP joint. */
function isFingerCurled(lm: NormalizedLandmark[], tip: number, pip: number): boolean {
  return lm[tip].y > lm[pip].y + 0.005;
}

/** Thumb extended: tip x is further from the wrist than the thumb IP. */
function isThumbExtended(lm: NormalizedLandmark[]): boolean {
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
  function GestureControl(
    { onGesture, className, advanced = true, compact = false },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // `Hands` / `Camera` are runtime consts (constructed off globalThis),
    // so the ref type is `InstanceType<typeof Hands>` (the instance type),
    // not `Hands` itself (which would be the constructor type).
    const handsRef = useRef<InstanceType<ReturnType<typeof getHandsCtor>> | null>(null);
    const cameraRef = useRef<InstanceType<ReturnType<typeof getCameraCtor>> | null>(null);

    // Refs for values the onResults closure needs to read fresh without
    // re-creating the callback (and thus re-wiring Hands).
    const advancedRef = useRef(advanced);
    useEffect(() => { advancedRef.current = advanced; }, [advanced]);
    const showSkeletonRef = useRef(true);

    // Mutable gesture state — kept in a ref so the onResults closure
    // always reads the latest without re-subscribing.
    const gs = useRef({
      // Shared state (used by both simple + advanced engines).
      lastPinch: false,
      lastFist: false,
      lastPalm: false,
      lastSwipeAt: 0,
      lastFistAt: 0,
      wristHistory: [] as Array<{ x: number; y: number; t: number }>,
      cursorX: 0,
      cursorY: 0,
      zoomPrevDist: null as number | null,

      // Advanced-mode state.
      indexHistory: [] as Array<{ x: number; y: number }>,
      lastPinchAdv: false,
      lastPinchAdvAt: 0,
      lastFistAdv: false,
      lastFistAdvAt: 0,
      lastSelectMode: false,
      lastSelectModeAt: 0,
      lastRotateAt: 0,
      prevPalmAngle: null as number | null,
      zoomPrevMidDist: null as number | null,

      // Hover-dwell state.
      dwellEl: null as HTMLElement | null,
      dwellStart: 0,
    }).current;

    const [enabled, setEnabled] = useState(false);
    const [booting, setBooting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [handsVisible, setHandsVisible] = useState(0);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [cursorMode, setCursorMode] = useState<CursorMode>("default");
    const [dwellProgress, setDwellProgress] = useState(0);
    const [lastGesture, setLastGesture] = useState<string | null>(null);

    // Keep showSkeleton ref in sync so onResults reads the latest.
    useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);

    // Keep onGesture in a ref so we don't re-create handleResults.
    const onGestureRef = useRef(onGesture);
    useEffect(() => { onGestureRef.current = onGesture; }, [onGesture]);

    // ── Synthetic click helper ──────────────────────────────────────────
    const clickAt = useCallback((x: number, y: number) => {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!target) return;
      // Walk up to the closest clickable ancestor — most GuardianX chrome
      // uses <button>, [role="button"], or [data-gx-clickable].
      const clickable = target.closest(
        'button, a, [role="button"], [role="tab"], [data-gx-clickable], input, select, summary',
      ) as HTMLElement | null;
      (clickable ?? target).click();
      onGestureRef.current?.({ kind: "click", x, y });
    }, []);

    function flash(label: string) {
      setLastGesture(label);
      window.setTimeout(() => {
        setLastGesture((cur) => (cur === label ? null : cur));
      }, 900);
    }

    // ── Skeleton drawing (shared by simple + advanced) ──────────────────
    const drawSkeleton = useCallback(
      (results: Results, hands: NormalizedLandmark[][]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Mirror horizontally so the preview matches a selfie view.
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        if (results.image) {
          ctx.drawImage(results.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
        }
        if (showSkeletonRef.current) {
          for (const lm of hands) {
            ctx.strokeStyle = "rgba(61, 220, 132, 0.8)";
            ctx.lineWidth = 2;
            for (const [a, b] of (getHandConnections() || [])) {
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
      },
      [],
    );

    // ── Simple-mode handler (back-compat with the original heuristics) ──
    const handleResultsSimple = useCallback((results: Results) => {
      const hands = results.multiHandLandmarks || [];
      setHandsVisible(hands.length);

      if (hands.length === 0) {
        gs.lastPinch = false;
        gs.lastFist = false;
        gs.lastPalm = false;
        gs.wristHistory = [];
        gs.zoomPrevDist = null;
        setCursorPos(null);
        setCursorMode("default");
        return;
      }

      const primary = hands[0];
      const indexTip = primary[8];
      const thumbTip = primary[4];
      const wrist = primary[0];

      const screenX = (1 - indexTip.x) * window.innerWidth;
      const screenY = indexTip.y * window.innerHeight;
      gs.cursorX = screenX;
      gs.cursorY = screenY;
      setCursorPos({ x: screenX, y: screenY });

      // Pinch → click (rising edge)
      const pinchDist = dist(thumbTip, indexTip);
      const isPinching = pinchDist < PINCH_DIST;
      if (isPinching && !gs.lastPinch) {
        clickAt(screenX, screenY);
        setCursorMode("pinching");
        flash("PINCH");
      }
      if (!isPinching && gs.lastPinch) {
        setCursorMode("default");
      }
      gs.lastPinch = isPinching;

      // Finger-count gestures: fist / palm
      const extended = countExtendedFingers(primary);
      const thumbExt = isThumbExtended(primary);
      const isFist = extended === 0 && !thumbExt;
      const isPalm = extended >= 4 && thumbExt;

      if (isFist && !gs.lastFist && Date.now() - gs.lastFistAt > FIST_CLICK_DEBOUNCE_MS) {
        gs.lastFistAt = Date.now();
        onGestureRef.current?.({ kind: "fist" });
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        setCursorMode("fist");
        flash("FIST");
      }
      if (!isFist && gs.lastFist) {
        setCursorMode(isPinching ? "pinching" : "default");
      }
      gs.lastFist = isFist;

      if (isPalm && !gs.lastPalm) {
        onGestureRef.current?.({ kind: "palm" });
        setCursorMode("palm");
        flash("PALM");
      }
      if (isPalm) {
        const mcp = primary[9];
        const prev = gs.wristHistory[gs.wristHistory.length - 1];
        if (prev) {
          const dy = mcp.y - prev.y;
          window.scrollBy({ top: dy * SCROLL_SPEED * 60, behavior: "auto" });
        }
        gs.wristHistory = [{ x: wrist.x, y: mcp.y, t: Date.now() }];
      } else {
        gs.wristHistory.push({ x: wrist.x, y: wrist.y, t: Date.now() });
        const cutoff = Date.now() - SWIPE_WINDOW_MS;
        while (gs.wristHistory.length > 0 && gs.wristHistory[0].t < cutoff) {
          gs.wristHistory.shift();
        }
        if (gs.wristHistory.length >= 2 && Date.now() - gs.lastSwipeAt > SWIPE_DEBOUNCE_MS) {
          const oldest = gs.wristHistory[0];
          const dx = wrist.x - oldest.x;
          if (Math.abs(dx) > SWIPE_DELTA) {
            // In selfie-mirrored space, wrist.x increasing = user moved
            // hand left (preserved from original semantics for back-compat).
            const direction = dx > 0 ? "left" : "right";
            gs.lastSwipeAt = Date.now();
            gs.wristHistory = [];
            onGestureRef.current?.({ kind: "swipe", direction });
            flash(`SWIPE ${direction.toUpperCase()}`);
          }
        }
      }
      if (!isPalm && gs.lastPalm) {
        setCursorMode(isPinching ? "pinching" : isFist ? "fist" : "default");
      }
      gs.lastPalm = isPalm;

      // Two-hand zoom
      if (hands.length >= 2) {
        const a = hands[0][8];
        const b = hands[1][8];
        const d = dist(a, b);
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
    }, [clickAt, gs]);

    // ── Advanced-mode handler (new heuristics) ───────────────────────────
    const handleResultsAdvanced = useCallback((results: Results) => {
      const hands = results.multiHandLandmarks || [];
      setHandsVisible(hands.length);

      // No hands → idle cursor, reset history.
      if (hands.length === 0) {
        gs.lastPinchAdv = false;
        gs.lastFistAdv = false;
        gs.lastPalm = false;
        gs.lastSelectMode = false;
        gs.wristHistory = [];
        gs.indexHistory = [];
        gs.zoomPrevDist = null;
        gs.zoomPrevMidDist = null;
        gs.prevPalmAngle = null;
        gs.dwellEl = null;
        gs.dwellStart = 0;
        setCursorPos(null);
        setCursorMode("default");
        setDwellProgress(0);
        return;
      }

      const primary = hands[0];
      const indexTip = primary[8];
      const thumbTip = primary[4];
      const indexMcp = primary[5];
      const wrist = primary[0];

      // ── 5-frame moving average on the index tip (smooths jitter) ─────
      gs.indexHistory.push({ x: indexTip.x, y: indexTip.y });
      if (gs.indexHistory.length > SMOOTH_FRAMES) gs.indexHistory.shift();
      let sx = 0;
      let sy = 0;
      for (const p of gs.indexHistory) {
        sx += p.x;
        sy += p.y;
      }
      const smoothX = sx / gs.indexHistory.length;
      const smoothY = sy / gs.indexHistory.length;

      // Map normalized (selfie-mirrored) → screen. Flip x so the user's
      // right hand moves the cursor right (mirror).
      const screenX = (1 - smoothX) * window.innerWidth;
      const screenY = smoothY * window.innerHeight;
      gs.cursorX = screenX;
      gs.cursorY = screenY;
      setCursorPos({ x: screenX, y: screenY });

      // ── Compute hand-shape signals ──────────────────────────────────
      const pinchDist = dist(thumbTip, indexTip);
      // Pinch: thumb-index tip distance small AND thumb tip is below the
      // index MCP (thumb is moving DOWN toward the index, not just
      // nearby by accident — the original simple-mode pinch fired
      // whenever thumb+index happened to be close, which caused many
      // false positives during normal cursor movement).
      const isPinching =
        pinchDist < PINCH_DIST_ADV &&
        thumbTip.y > indexMcp.y;

      // Fist: all 4 finger tips below their PIP joints (curled down) AND
      // thumb tip near index MCP. Much more discriminating than the
      // simple-mode "0 extended fingers" check.
      const isFist =
        primary[8].y  > primary[6].y  &&
        primary[12].y > primary[10].y &&
        primary[16].y > primary[14].y &&
        primary[20].y > primary[18].y &&
        dist(primary[4], primary[5]) < FIST_THUMB_MCP_DIST;

      // Open palm: all 5 fingers extended.
      const indexExt  = isFingerExtended(primary, 8, 6);
      const middleExt = isFingerExtended(primary, 12, 10);
      const ringExt   = isFingerExtended(primary, 16, 14);
      const pinkyExt  = isFingerExtended(primary, 20, 18);
      const thumbExt  = isThumbExtended(primary);
      const isPalm = indexExt && middleExt && ringExt && pinkyExt && thumbExt;

      // L-shape: thumb + index extended, middle+ring+pinky curled.
      const isLShape =
        indexExt && thumbExt &&
        isFingerCurled(primary, 12, 10) &&
        isFingerCurled(primary, 16, 14) &&
        isFingerCurled(primary, 20, 18);

      // 3-finger pose: middle+ring+pinky extended, index+thumb curled.
      // Used to gate vertical swipe (so you don't accidentally swipe_up
      // when you're just reaching for the top of the screen).
      const is3Finger =
        middleExt && ringExt && pinkyExt &&
        isFingerCurled(primary, 8, 6) &&
        !thumbExt;

      // ── Pinch → click (rising edge, debounced) ──────────────────────
      const now = Date.now();
      let mode: CursorMode = "default";
      if (isPinching) {
        mode = "pinching";
        if (!gs.lastPinchAdv && now - gs.lastPinchAdvAt > PINCH_DEBOUNCE_ADV_MS) {
          gs.lastPinchAdvAt = now;
          clickAt(screenX, screenY);
          // Pinch click supersedes any in-progress dwell.
          gs.dwellEl = null;
          gs.dwellStart = 0;
          setDwellProgress(0);
          flash("PINCH");
        }
      }
      gs.lastPinchAdv = isPinching;

      // ── Fist → ESC (rising edge, debounced) ──────────────────────────
      if (isFist) {
        mode = "fist";
        if (!gs.lastFistAdv && now - gs.lastFistAdvAt > FIST_DEBOUNCE_ADV_MS) {
          gs.lastFistAdvAt = now;
          onGestureRef.current?.({ kind: "fist" });
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          flash("FIST");
        }
      }
      gs.lastFistAdv = isFist;

      // ── Open palm → scroll + (optional) rotate ───────────────────────
      if (isPalm) {
        mode = "palm";
        if (!gs.lastPalm) {
          onGestureRef.current?.({ kind: "palm" });
          flash("PALM");
        }
        // Scroll using palm MCP y velocity.
        const mcp = primary[9];
        const prev = gs.wristHistory[gs.wristHistory.length - 1];
        if (prev) {
          const dy = mcp.y - prev.y;
          // dy > 0 (palm moves down) → scroll down
          window.scrollBy({ top: dy * SCROLL_SPEED * 60, behavior: "auto" });
        }
        gs.wristHistory = [{ x: wrist.x, y: mcp.y, t: now }];

        // Palm-rotate: angle of the wrist → middle-MCP line. Optional
        // gesture — when the user holds an open palm and rotates their
        // wrist, we emit `{kind: "rotate", delta}` for the parent to
        // apply to its viewport rotation.
        const angle = Math.atan2(primary[9].y - primary[0].y, primary[9].x - primary[0].x);
        if (gs.prevPalmAngle != null && now - gs.lastRotateAt > ROTATE_DEBOUNCE_MS) {
          let delta = angle - gs.prevPalmAngle;
          // Wrap to [-π, π].
          if (delta > Math.PI)  delta -= 2 * Math.PI;
          if (delta < -Math.PI) delta += 2 * Math.PI;
          if (Math.abs(delta) > ROTATE_MIN_DELTA_RAD) {
            gs.lastRotateAt = now;
            onGestureRef.current?.({ kind: "rotate", delta });
            flash(delta > 0 ? "ROTATE ↻" : "ROTATE ↺");
          }
        }
        gs.prevPalmAngle = angle;
      } else {
        gs.prevPalmAngle = null;

        // ── Swipe detection (when not palm-scrolling) ─────────────────
        // In 3-finger pose we allow vertical swipes (swipe_up /
        // swipe_down). Otherwise the generic swipe (any hand shape)
        // only emits left/right (back-compat with the original
        // `direction: "left" | "right"` union variant).
        gs.wristHistory.push({ x: wrist.x, y: wrist.y, t: now });
        const cutoff = now - SWIPE_WINDOW_MS_ADV;
        while (gs.wristHistory.length > 0 && gs.wristHistory[0].t < cutoff) {
          gs.wristHistory.shift();
        }
        if (gs.wristHistory.length >= 2 && now - gs.lastSwipeAt > SWIPE_DEBOUNCE_ADV_MS) {
          const oldest = gs.wristHistory[0];
          const dx = wrist.x - oldest.x;
          const dy = wrist.y - oldest.y;
          const adx = Math.abs(dx);
          const ady = Math.abs(dy);

          if (adx > SWIPE_DELTA_ADV && adx >= ady) {
            // Horizontal swipe (any pose). Selfie-mirrored: wrist.x
            // increasing = user moved hand left (preserved from the
            // original semantics for back-compat).
            const direction = dx > 0 ? "left" : "right";
            gs.lastSwipeAt = now;
            gs.wristHistory = [];
            onGestureRef.current?.({ kind: "swipe", direction });
            flash(`SWIPE ${direction.toUpperCase()}`);
          } else if (is3Finger && ady > SWIPE_DELTA_ADV && ady > adx) {
            // 3-finger vertical swipe. Y is NOT flipped in selfie mode,
            // so dy < 0 = hand moving up = swipe_up.
            gs.lastSwipeAt = now;
            gs.wristHistory = [];
            if (dy < 0) {
              onGestureRef.current?.({ kind: "swipe_up" });
              flash("SWIPE UP");
            } else {
              onGestureRef.current?.({ kind: "swipe_down" });
              flash("SWIPE DOWN");
            }
          }
        }
      }
      gs.lastPalm = isPalm;

      // ── L-shape → select_mode (rising edge, debounced) ──────────────
      if (isLShape) {
        mode = "select";
        if (!gs.lastSelectMode && now - gs.lastSelectModeAt > SELECT_MODE_DEBOUNCE_MS) {
          gs.lastSelectModeAt = now;
          onGestureRef.current?.({ kind: "select_mode" });
          flash("SELECT MODE");
        }
      }
      gs.lastSelectMode = isLShape;

      setCursorMode(mode);

      // ── Hover dwell (only when in default mode) ──────────────────────
      // The rAF loop in the effect reads gs.dwellEl / gs.dwellStart and
      // updates the progress ring + fires the synthetic click when it
      // reaches 100%. Here we just feed it the current clickable element
      // under the cursor — but only when we're in default mode (no
      // pinch/fist/palm/select). Pinch click already cancels dwell above.
      // We also exclude the gesture-control's own UI (marked with
      // `data-gesture-ui`) so dwelling over the disable button doesn't
      // auto-disable gesture control.
      if (mode === "default") {
        const el = document.elementFromPoint(screenX, screenY) as HTMLElement | null;
        const clickable = el?.closest(
          'button, a, [role="button"], [role="tab"], [data-gx-clickable], input, select, summary',
        ) as HTMLElement | null;
        const isGestureUi = !!clickable?.closest("[data-gesture-ui]");
        const target = clickable && !isGestureUi ? clickable : null;
        if (target !== gs.dwellEl) {
          gs.dwellEl = target;
          gs.dwellStart = target ? now : 0;
        }
      } else {
        gs.dwellEl = null;
        gs.dwellStart = 0;
      }

      // ── Two-hand zoom (advanced: pinch-midpoint distance) ───────────
      // Both hands pinching (thumb-index distance < threshold on each),
      // measure distance between the two pinch midpoints. If growing →
      // zoom in, if shrinking → zoom out.
      if (hands.length >= 2) {
        const aPinch = dist(hands[0][4], hands[0][8]) < ZOOM_PINCH_MIN_ADV;
        const bPinch = dist(hands[1][4], hands[1][8]) < ZOOM_PINCH_MIN_ADV;
        if (aPinch && bPinch) {
          const midA = {
            x: (hands[0][4].x + hands[0][8].x) / 2,
            y: (hands[0][4].y + hands[0][8].y) / 2,
          };
          const midB = {
            x: (hands[1][4].x + hands[1][8].x) / 2,
            y: (hands[1][4].y + hands[1][8].y) / 2,
          };
          const d = dist2D(midA, midB);
          if (gs.zoomPrevMidDist != null) {
            const delta = d - gs.zoomPrevMidDist;
            if (Math.abs(delta) > 0.005) {
              onGestureRef.current?.({ kind: "zoom", delta: delta * 10 });
              flash(delta > 0 ? "ZOOM +" : "ZOOM −");
            }
          }
          gs.zoomPrevMidDist = d;
        } else {
          gs.zoomPrevMidDist = null;
        }
      } else {
        gs.zoomPrevMidDist = null;
      }
    }, [clickAt, gs]);

    // ── Dispatch wrapper ────────────────────────────────────────────────
    const handleResults = useCallback(
      (results: Results) => {
        drawSkeleton(results, results.multiHandLandmarks || []);
        if (advancedRef.current) {
          handleResultsAdvanced(results);
        } else {
          handleResultsSimple(results);
        }
      },
      [drawSkeleton, handleResultsAdvanced, handleResultsSimple],
    );

    // ── Hover-dwell rAF loop — reads gs.dwellEl/dwellStart each tick ──
    // Decoupled from the MediaPipe frame loop because we want the
    // progress ring to animate smoothly even when the camera is at ~15fps.
    useEffect(() => {
      if (!enabled) return;
      let rafId: number;
      let lastReported = -1;
      const tick = () => {
        const progress =
          gs.dwellEl && gs.dwellStart
            ? Math.min(1, (Date.now() - gs.dwellStart) / HOVER_DWELL_MS)
            : 0;
        // Only update state when progress changes by ~5% to avoid
        // render thrash at 60fps.
        if (Math.abs(progress - lastReported) > 0.04 ||
            (progress === 0 && lastReported !== 0)) {
          lastReported = progress;
          setDwellProgress(progress);
        }
        if (progress >= 1 && gs.dwellEl) {
          const target = gs.dwellEl;
          gs.dwellEl = null;
          gs.dwellStart = 0;
          lastReported = 0;
          setDwellProgress(0);
          target.click();
          onGestureRef.current?.({ kind: "click", x: gs.cursorX, y: gs.cursorY });
          flash("DWELL CLICK");
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [enabled, gs]);

    // ── Boot: instantiate Hands + Camera, start streaming ────────────────
    const enable = useCallback(async () => {
      if (enabled || booting) return;
      setBooting(true);
      setError(null);
      try {
        if (!videoRef.current) throw new Error("video element not ready");
        // Hands needs to load WASM + model assets. We serve them locally
        // from /public/mediapipe/hands/ (copied from node_modules/@mediapipe/hands
        // at build time) so we don't depend on a CDN that can be blocked by ad
        // blockers or network issues.
        // Read the constructor lazily — see getHandsCtor() comment above.
        const HandsCtor = getHandsCtor();
        if (!HandsCtor || typeof HandsCtor !== "function") {
          throw new Error("MediaPipe Hands library failed to load. Check your network connection + ad blocker.");
        }
        const hands = new HandsCtor({
          locateFile: (file: string) => `/mediapipe/hands/${file}`,
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

        const CameraCtor = getCameraCtor();
        if (!CameraCtor || typeof CameraCtor !== "function") {
          throw new Error("MediaPipe Camera library failed to load.");
        }
        const camera = new CameraCtor(videoRef.current, {
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
      setCursorPos(null);
      setCursorMode("default");
      setDwellProgress(0);
      setHandsVisible(0);
      gs.lastPinch = false;
      gs.lastFist = false;
      gs.lastPalm = false;
      gs.lastPinchAdv = false;
      gs.lastFistAdv = false;
      gs.lastSelectMode = false;
      gs.wristHistory = [];
      gs.indexHistory = [];
      gs.zoomPrevDist = null;
      gs.zoomPrevMidDist = null;
      gs.prevPalmAngle = null;
      gs.dwellEl = null;
      gs.dwellStart = 0;
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

    // ── Cursor visual (shared by compact + non-compact) ──────────────────
    const cursorColor =
      cursorMode === "pinching"
        ? "border-red-400 bg-red-500/40 shadow-[0_0_24px_rgba(255,77,94,0.7)]"
        : cursorMode === "fist"
          ? "border-violet-400 bg-violet-500/40 shadow-[0_0_24px_rgba(167,139,250,0.7)]"
          : cursorMode === "palm"
            ? "border-cyan-400 bg-cyan-500/30 shadow-[0_0_24px_rgba(34,211,238,0.7)]"
            : cursorMode === "select"
              ? "border-amber-400 bg-amber-500/30 shadow-[0_0_24px_rgba(251,191,36,0.7)]"
              : "border-emerald-400 bg-emerald-500/10 shadow-[0_0_16px_rgba(61,220,132,0.5)]";

    const renderCursor = () => (
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
              className={`size-8 rounded-full border-2 transition-colors ${cursorColor}`}
            >
              {/* crosshair */}
              <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
            {/* Hover-dwell progress ring (amber, fills clockwise). */}
            {dwellProgress > 0 && (
              <svg
                className="absolute -inset-1 size-10 -rotate-90"
                viewBox="0 0 40 40"
                aria-hidden
              >
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="rgba(251,191,36,0.9)"
                  strokeWidth="2"
                  strokeDasharray={`${dwellProgress * 113} 113`}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );

    // ── Render: compact mode (Command Center) ─────────────────────────────
    if (compact) {
      return (
        <div className={className} data-gesture-ui>
          {/* Hidden video element — MediaPipe reads frames from here.
              Camera still streams, just no visible preview UI. */}
          <video
            ref={videoRef}
            className="pointer-events-none absolute h-px w-px opacity-0"
            autoPlay
            playsInline
            muted
          />
          {renderCursor()}
          {/* Tiny status chip — only shown when enabled. */}
          {enabled && (
            <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-zinc-950/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-400/80 backdrop-blur">
              <Hand className="size-3" />
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{handsVisible}H</span>
            </div>
          )}
          {/* Gesture flash toast — useful for calibration even in compact mode. */}
          <AnimatePresence>
            {enabled && lastGesture && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-emerald-500/50 bg-zinc-950/90 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-emerald-300 backdrop-blur"
              >
                {lastGesture}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    // ── Render: full mode (War Room overlay) ───────────────────────────────
    return (
      <div className={className} data-gesture-ui>
        {/* Hidden video element — MediaPipe reads frames from here.
            Camera still streams even when the preview is hidden. */}
        <video
          ref={videoRef}
          className="pointer-events-none absolute h-px w-px opacity-0"
          autoPlay
          playsInline
          muted
        />

        {/* Camera preview + skeleton overlay (bottom-right, hidden by default). */}
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

        {/* Tiny CAM toggle button (top-right corner) — flips showPreview.
            Camera keeps streaming regardless; this only toggles the
            visible preview window. */}
        {enabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPreview((s) => !s)}
                className="fixed right-4 top-4 z-30 size-6 border-emerald-500/40 bg-zinc-950/80 text-emerald-300 hover:bg-emerald-500/20"
                aria-label={showPreview ? "Hide camera preview" : "Show camera preview"}
              >
                {showPreview ? <CameraOff className="size-3" /> : <CameraIcon className="size-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showPreview ? "Hide camera preview" : "Show camera preview"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Floating cursor (follows index fingertip) */}
        {renderCursor()}

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
              {advanced && (
                <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                  ADV
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  enabled ? "animate-pulse bg-emerald-500" : error ? "bg-red-500" : "bg-zinc-600"
                }`}
              />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                {enabled
                  ? `${handsVisible} HAND${handsVisible === 1 ? "" : "S"}`
                  : error
                    ? "OFFLINE"
                    : "STANDBY"}
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
                <span>
                  Tracking {handsVisible} hand{handsVisible === 1 ? "" : "s"}.
                  {advanced
                    ? " Pinch or hover-dwell to click, fist to close, palm to scroll, L-shape for select mode."
                    : " Move your hands to control the War Room."}
                </span>
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
              {booting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : enabled ? (
                <CameraOff className="size-3" />
              ) : (
                <CameraIcon className="size-3" />
              )}
              {booting ? "Starting…" : enabled ? "Disable" : "Enable"}
            </button>
            {enabled && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-black/40 px-3 py-1.5 font-mono text-[10px] text-zinc-500">
                <MoveHorizontal className="size-3" /> SWIPE
                <span className="text-zinc-700">·</span>
                <MousePointer2 className="size-3" /> PINCH
                <span className="text-zinc-700">·</span>
                <Grab className="size-3" /> FIST
                <span className="text-zinc-700">·</span>
                <Hand className="size-3" /> PALM
                <span className="text-zinc-700">·</span>
                <Pointer className="size-3" /> L-SELECT
                <span className="text-zinc-700">·</span>
                <ZoomIn className="size-3" /> 2H ZOOM
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
