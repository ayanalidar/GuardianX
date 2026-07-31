// GuardianX Engine — pure socket.io relay (port 3003).
//
// Receives pipeline events from the Next.js producer (server-side socket.io
// client) and broadcasts them to subscribed browser clients.
//
// Protocol:
//   Client -> Server:
//     "subscribe:scan"   { scanId }   join a scan's event room
//     "unsubscribe:scan" { scanId }
//     "subscribe:global"               join the global room
//   Producer -> Server:
//     "pipeline:event"   PipelineEventPayload        (relayed to global + scan room)
//   Server -> Client:
//     "pipeline:event"   PipelineEventPayload

import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = parseInt(process.env.PORT || "3003", 10);

const httpServer = createServer((_req, res) => {
  // Any non-socket.io request: respond simply (socket.io handles its own paths).
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      service: "sentinel-engine",
      role: "socket.io relay",
      port: PORT,
      note: "Use socket.io to connect.",
    })
  );
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  // Browser client subscriptions
  socket.on("subscribe:scan", (scanId: string) => {
    socket.join(`scan:${scanId}`);
  });
  socket.on("unsubscribe:scan", (scanId: string) => {
    socket.leave(`scan:${scanId}`);
  });
  socket.on("subscribe:engagement", (engagementId: string) => {
    socket.join(`engagement:${engagementId}`);
  });
  socket.on("unsubscribe:engagement", (engagementId: string) => {
    socket.leave(`engagement:${engagementId}`);
  });
  socket.on("subscribe:global", () => {
    socket.join("global");
  });

  // Producer (Next.js pipeline) emits events -> relay to subscribers.
  socket.on("pipeline:event", (event: { scanId?: string }) => {
    if (!event || !event.scanId) return;
    io.to(`scan:${event.scanId}`).emit("pipeline:event", event);
    io.to("global").emit("pipeline:event", event);
  });

  // RedAgent engagement events
  socket.on("redagent:event", (event: { engagementId?: string }) => {
    if (!event || !event.engagementId) return;
    io.to(`engagement:${event.engagementId}`).emit("redagent:event", event);
  });

  socket.on("disconnect", () => {
    // socket.io handles room cleanup automatically
  });
});

httpServer.listen(PORT, () => {
  console.log(`[sentinel-engine] socket.io relay listening on :${PORT}`);
  console.log(`[sentinel-engine] connect with io("/?XTransformPort=${PORT}")`);
});

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
