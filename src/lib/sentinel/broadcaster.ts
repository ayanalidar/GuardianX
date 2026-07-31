// Server-side broadcaster: pushes pipeline events to the sentinel-engine
// socket.io relay (port 3003) which forwards them to subscribed browsers.
//
// This is a server-to-server internal connection (Next.js API route -> engine).
// We connect once at module load and reuse the connection.

import { io, type Socket } from "socket.io-client";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:3003";

export interface PipelineEventPayload {
  scanId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown>;
  ts: string;
}

export interface RedAgentEventPayload {
  engagementId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown> | null;
  ts: string;
}

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

async function getSocket(): Promise<Socket> {
  if (socket && socket.connected) return socket;
  if (connecting) return connecting;

  connecting = new Promise<Socket>((resolve, reject) => {
    const s = io(ENGINE_URL, {
      path: "/",
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });
    s.on("connect", () => {
      console.log("[broadcaster] connected to engine:", s.id);
      socket = s;
      resolve(s);
    });
    s.on("connect_error", (err) => {
      console.warn("[broadcaster] connect error:", err.message);
      // don't reject — keep trying to reconnect; resolve with the socket so
      // emits queue/buffer internally and flush when reconnected.
      socket = s;
      resolve(s);
    });
    s.on("disconnect", () => {
      console.warn("[broadcaster] disconnected from engine");
    });
  });
  return connecting;
}

// Kick off the connection eagerly so it's warm by the time a scan starts.
void getSocket();

export async function broadcast(event: PipelineEventPayload): Promise<void> {
  try {
    const s = await getSocket();
    s.emit("pipeline:event", event);
  } catch (err) {
    console.warn("[broadcaster] emit failed:", err);
  }
}

export async function broadcastRedAgent(event: RedAgentEventPayload): Promise<void> {
  try {
    const s = await getSocket();
    s.emit("redagent:event", event);
  } catch (err) {
    console.warn("[broadcaster] redagent emit failed:", err);
  }
}
