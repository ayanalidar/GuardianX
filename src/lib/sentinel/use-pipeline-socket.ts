"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type { PipelineEvent } from "./api";
import { ENGINE_SOCKET_URL, engineSocketOptions } from "./engine-socket";

interface UsePipelineSocketOptions {
  scanId: string | null;
  onEvent?: (e: PipelineEvent) => void;
}

/**
 * Connects to the sentinel-engine socket.io relay and subscribes to events
 * for a specific scan. Also replays persisted events on mount so late joiners
 * see the full history.
 */
export function usePipelineSocket({ scanId, onEvent }: UsePipelineSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Replay persisted events when a scan is selected.
  useEffect(() => {
    if (!scanId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvents([]);
      return;
    }
    setEvents([]);
    fetch(`/api/scans/${scanId}/events`)
      .then((r) => r.json())
      .then((evs: PipelineEvent[]) => setEvents(evs))
      .catch(() => null);
  }, [scanId]);

  // Subscribe to live events.
  useEffect(() => {
    if (!scanId) return;
    const sock = io(ENGINE_SOCKET_URL, engineSocketOptions());
    socketRef.current = sock;

    sock.on("connect", () => {
      setConnected(true);
      sock.emit("subscribe:scan", scanId);
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("pipeline:event", (e: PipelineEvent) => {
      if (e.scanId !== scanId) return;
      setEvents((prev) =>
        prev.length && prev[prev.length - 1]?.ts === e.ts &&
        prev[prev.length - 1]?.message === e.message
          ? prev
          : [...prev, e]
      );
      onEventRef.current?.(e);
    });

    return () => {
      sock.emit("unsubscribe:scan", scanId);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [scanId]);

  const clear = useCallback(() => setEvents([]), []);

  return { connected, events, clear };
}
