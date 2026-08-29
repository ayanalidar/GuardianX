"use client";

/**
 * SignalBus
 * ----------
 * Client-side signal bus that maps sentinel-engine socket.io events to
 * high-level visualizer states. Anything rendering the AI visualizer
 * (CircuitBoard, NeuralLink, ImmersiveView) consumes the current
 * `VisualizerState` from React context so they all share one source of
 * truth — no per-component socket listeners.
 *
 * Visualizer states:
 *   idle      → calm board, slow pulses (no scan running)
 *   scanning  → pulses flowing outward (a scan just started)
 *   analyzing → board amps up (engine is doing AI/exploit work)
 *   finding   → red flash (a critical finding just landed)
 *   patching  → green flow (a patch was generated/approved)
 *
 * The bus keeps a ring-buffer of recent events so the visualizer can
 * show a live findings feed, and exposes a `push` method so local
 * actions (e.g. "user approved a patch in the UI") can also drive the
 * visualization without waiting for the engine to echo them back.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { ENGINE_SOCKET_URL, engineSocketOptions } from "@/lib/sentinel/engine-socket";

export type VisualizerState =
  | "idle"
  | "scanning"
  | "analyzing"
  | "finding"
  | "patching";

export interface VisualizerEvent {
  id: string;
  type: "scan_started" | "finding_found" | "patch_generated" | "scan_complete" | "patch_approved" | "stage";
  state: VisualizerState;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  ts: number;
  meta?: Record<string, unknown> | null;
}

interface SignalBusValue {
  state: VisualizerState;
  connected: boolean;
  events: VisualizerEvent[];
  /** Programmatically emit a visualizer event (e.g. from a UI button). */
  push: (e: Omit<VisualizerEvent, "id" | "ts">) => void;
  /** Force the visualizer into a specific state (overrides auto-derived). */
  setState: (s: VisualizerState) => void;
}

const SignalBusContext = createContext<SignalBusValue | null>(null);

const MAX_EVENTS = 40;
const STATE_TIMEOUT_MS: Record<VisualizerState, number> = {
  idle: 0, // never auto-expires
  scanning: 30_000,
  analyzing: 20_000,
  finding: 4_000,
  patching: 6_000,
};

/**
 * Map a raw socket.io pipeline event (or a synthesized event) to a
 * visualizer state. This is the single place that decides what the
 * board renders as.
 */
function deriveState(
  type: VisualizerEvent["type"],
  message: string,
  level: VisualizerEvent["severity"],
): VisualizerState {
  switch (type) {
    case "scan_started":
    case "scan_complete":
      return type === "scan_started" ? "scanning" : "idle";
    case "finding_found":
      return "finding";
    case "patch_generated":
    case "patch_approved":
      return "patching";
    case "stage":
      // Engine stage events: "analyzing" when the message mentions AI/exploit work.
      if (/analyz|exploit|reason|adversar/i.test(message)) return "analyzing";
      if (/scan|crawl|recon/i.test(message)) return "scanning";
      if (/patch|fix|heal/i.test(message)) return "patching";
      if (level === "error") return "finding";
      return "scanning";
    default:
      return "idle";
  }
}

export function SignalBusProvider({ children }: { children: ReactNode }) {
  const [state, setStateInternal] = useState<VisualizerState>("idle");
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<VisualizerEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStateWithExpiry = (next: VisualizerState) => {
    setStateInternal(next);
    if (stateTimerRef.current) {
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = null;
    }
    const ttl = STATE_TIMEOUT_MS[next];
    if (ttl > 0) {
      stateTimerRef.current = setTimeout(() => {
        setStateInternal("idle");
        stateTimerRef.current = null;
      }, ttl);
    }
  };

  const push = (e: Omit<VisualizerEvent, "id" | "ts">) => {
    const full: VisualizerEvent = {
      ...e,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
    };
    setEvents((prev) => [full, ...prev].slice(0, MAX_EVENTS));
    setStateWithExpiry(full.state);
  };

  // Connect to the engine's socket.io relay and subscribe to pipeline
  // events. We do NOT scope by scanId — the visualizer is a "global
  // heartbeat" that reacts to anything happening across the platform.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sock = io(ENGINE_SOCKET_URL, engineSocketOptions() as unknown as Parameters<typeof io>[1]);
    socketRef.current = sock;

    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));

    sock.on("pipeline:event", (raw: { stage?: string; message?: string; level?: string; meta?: Record<string, unknown> | null }) => {
      const stage = raw.stage || "";
      const message = raw.message || "";
      const level = (raw.level || "info") as VisualizerEvent["severity"];
      // Infer the event type from the engine's stage/message naming.
      let type: VisualizerEvent["type"] = "stage";
      if (/scan.*start|queued/i.test(message) || stage === "scan_start") type = "scan_started";
      else if (/scan.*complete|completed/i.test(message) || stage === "scan_complete") type = "scan_complete";
      else if (/finding|vuln|exploit.*found|detected/i.test(message) || stage === "finding") type = "finding_found";
      else if (/patch.*generat|patch.*approv|healed/i.test(message) || stage === "patch") type = "patch_generated";

      const derivedState = deriveState(type, message, level);
      push({
        type,
        state: derivedState,
        message,
        severity: level,
        meta: raw.meta ?? null,
      });
    });

    return () => {
      sock.disconnect();
      socketRef.current = null;
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    };
  }, []);

  const value = useMemo<SignalBusValue>(
    () => ({
      state,
      connected,
      events,
      push,
      setState: setStateWithExpiry,
    }),
    // `events` and `state` are the reactive bits; push/setState are stable.
    [state, connected, events],
  );

  return <SignalBusContext.Provider value={value}>{children}</SignalBusContext.Provider>;
}

export function useSignalBus(): SignalBusValue {
  const ctx = useContext(SignalBusContext);
  if (!ctx) {
    // Return a no-op shim when used outside a provider so leaf components
    // (e.g. the homepage particle bg, which doesn't need a live socket)
    // don't crash.
    return {
      state: "idle",
      connected: false,
      events: [],
      push: () => {},
      setState: () => {},
    };
  }
  return ctx;
}
