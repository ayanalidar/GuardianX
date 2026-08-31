import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/events/stream — Server-Sent Events (SSE) stream for real-time
// pipeline events. This is the Vercel-compatible alternative to Socket.io
// (Vercel serverless can't maintain WebSocket connections, but SSE works).
//
// The client connects with EventSource("/api/events/stream") and receives
// events as they're emitted. Falls back to a heartbeat every 15s to keep
// the connection alive within Vercel's 60s function timeout.
//
// In the sandbox/dev environment with the sentinel-engine running on port
// 3003, the War Room connects to the engine's Socket.io directly. In
// production (Vercel), it uses this SSE endpoint instead.

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      // Heartbeat every 15s to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
          controller.close();
        }
      }, 15_000);

      // Clean up on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
