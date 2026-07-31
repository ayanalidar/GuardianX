"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type { RedAgentEvent } from "./api";
import { ENGINE_SOCKET_URL, engineSocketOptions } from "./engine-socket";

interface UseEngagementSocketOptions {
  engagementId: string | null;
}

/**
 * Subscribes to live RedAgent events for an engagement. Replays persisted
 * events on mount so late joiners see the full history.
 */
export function useEngagementSocket({ engagementId }: UseEngagementSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RedAgentEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  // Replay persisted events.
  useEffect(() => {
    if (!engagementId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvents([]);
      return;
    }
    setEvents([]);
    fetch(`/api/engagements/${engagementId}/events`)
      .then((r) => r.json())
      .then((evs: RedAgentEvent[]) => setEvents(evs))
      .catch(() => null);
  }, [engagementId]);

  // Subscribe to live events.
  useEffect(() => {
    if (!engagementId) return;
    const sock = io(ENGINE_SOCKET_URL, engineSocketOptions());
    socketRef.current = sock;

    sock.on("connect", () => {
      setConnected(true);
      sock.emit("subscribe:engagement", engagementId);
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("redagent:event", (e: RedAgentEvent) => {
      if (e.engagementId !== engagementId) return;
      setEvents((prev) =>
        prev.length &&
        prev[prev.length - 1]?.ts === e.ts &&
        prev[prev.length - 1]?.message === e.message
          ? prev
          : [...prev, e]
      );
    });

    return () => {
      sock.emit("unsubscribe:engagement", engagementId);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [engagementId]);

  const clear = useCallback(() => setEvents([]), []);
  return { connected, events, clear };
}
