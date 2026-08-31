import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

// In-memory RUM store (resets on serverless cold-start, which is fine for
// real-time monitoring — older data is not needed once it's been viewed).
interface RUMEvent {
  type: "api" | "error" | "slow-render";
  endpoint?: string;
  duration?: number;
  success?: boolean;
  status?: number;
  error?: string;
  component?: string;
  timestamp: number;
}

interface RUMSession {
  sessionId: string;
  startedAt: number;
  url: string;
  userAgent: string;
  healthScore: number;
  events: RUMEvent[];
}

const sessions: RUMSession[] = [];
const MAX_SESSIONS = 100;

// POST /api/rum/report — receives batched RUM events from the client.
// Public (no auth) so unauthenticated visitors can report too.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, startedAt, events, healthScore, url, userAgent } = body as {
      sessionId: string;
      startedAt: number;
      events: RUMEvent[];
      healthScore: number;
      url: string;
      userAgent: string;
    };

    if (!sessionId || !events) {
      return NextResponse.json({ error: "sessionId and events required" }, { status: 400 });
    }

    sessions.push({ sessionId, startedAt, url, userAgent, healthScore, events });

    // Trim to last 100 sessions
    if (sessions.length > MAX_SESSIONS) {
      sessions.splice(0, sessions.length - MAX_SESSIONS);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

// GET /api/rum/report — returns aggregated RUM stats (for health dashboard).
// Admin-only.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  // Aggregate stats
  const allEvents = sessions.flatMap((s) => s.events);
  const apiEvents = allEvents.filter((e) => e.type === "api");
  const errorEvents = allEvents.filter((e) => e.type === "error");
  const slowRenderEvents = allEvents.filter((e) => e.type === "slow-render");

  // Per-endpoint stats
  const endpointMap = new Map<string, { calls: number; failures: number; totalDuration: number; lastStatus: number }>();
  for (const e of apiEvents) {
    if (!e.endpoint) continue;
    const existing = endpointMap.get(e.endpoint) || { calls: 0, failures: 0, totalDuration: 0, lastStatus: 0 };
    existing.calls++;
    if (!e.success) existing.failures++;
    existing.totalDuration += e.duration || 0;
    existing.lastStatus = e.status || 0;
    endpointMap.set(e.endpoint, existing);
  }

  const endpointStats = Array.from(endpointMap.entries()).map(([endpoint, s]) => ({
    endpoint,
    calls: s.calls,
    failures: s.failures,
    failureRate: s.calls > 0 ? s.failures / s.calls : 0,
    avgDuration: s.calls > 0 ? Math.round(s.totalDuration / s.calls) : 0,
    lastStatus: s.lastStatus,
  }));

  // Overall health score (average of session scores)
  const avgHealthScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.healthScore, 0) / sessions.length)
    : 100;

  return NextResponse.json({
    activeSessions: sessions.length,
    totalApiCalls: apiEvents.length,
    totalApiFailures: apiEvents.filter((e) => !e.success).length,
    totalErrors: errorEvents.length,
    totalSlowRenders: slowRenderEvents.length,
    avgHealthScore,
    endpoints: endpointStats.sort((a, b) => b.calls - a.calls),
    recentErrors: errorEvents.slice(-20),
    recentSessions: sessions.slice(-10).map((s) => ({
      sessionId: s.sessionId,
      url: s.url,
      healthScore: s.healthScore,
      eventCount: s.events.length,
    })),
  });
}
