// GuardianX Engine socket.io connector, browser-side.
// Connects directly to the Railway sentinel-engine (or localhost:3003 for dev).
//
// In production: set NEXT_PUBLIC_ENGINE_URL=https://your-engine.up.railway.app
// In local dev: defaults to http://localhost:3003 (same-origin via caddy in sandbox)

export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "";
export const ENGINE_SOCKET_URL = ENGINE_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

/**
 * Build socket.io client options that work for:
 * - Production (Vercel → Railway): NEXT_PUBLIC_ENGINE_URL is set, connect directly
 * - Local dev/sandbox: no ENGINE_URL, use same-origin + caddy XTransformPort
 */
export function engineSocketOptions() {
  if (ENGINE_URL) {
    // Production: connect directly to Railway
    return {
      path: "/socket.io/",
      transports: ["websocket", "polling"] as const,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    };
  }
  // Local dev/sandbox: same-origin via caddy, route to port 3003
  return {
    path: "/socket.io/",
    transports: ["websocket", "polling"] as const,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 10000,
    query: { XTransformPort: "3003" },
  };
}
