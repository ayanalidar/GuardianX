// GuardianX broadcaster, NO-OP on Vercel.
//
// Previously this connected to the sentinel-engine socket.io relay and
// forwarded pipeline events. After the Railway refactor, Vercel routes
// are thin proxies, they don't run pipelines locally anymore, so they
// don't need to broadcast events. The Railway engine handles all
// broadcasting directly to browsers via its own socket.io server.
//
// This file is kept as a no-op stub so any residual imports don't crash.
// It will be deleted in a future cleanup once all engine code is removed
// from the Vercel project.

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

export async function broadcast(_event: PipelineEventPayload): Promise<void> {
  // No-op, Railway engine broadcasts directly.
}

export async function broadcastRedAgent(_event: RedAgentEventPayload): Promise<void> {
  // No-op, Railway engine broadcasts directly.
}
