import { NextResponse } from "next/server";
import { fetchUrl } from "@/lib/sentinel/engine/http-attacker";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/ws-test, WebSocket security testing
// Body: { targetUrl }, ws:// or http:// URL
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const base = body.targetUrl || "http://localhost:3004";
  const wsUrl = base.replace("http://", "ws://").replace("https://", "wss://");

  // Test 1: Check if WS upgrade is accepted without auth
  let unauthenticatedAccess = false;
  try {
    const res = await fetchUrl(base, { headers: { Upgrade: "websocket", Connection: "Upgrade" }, timeoutMs: 5000 });
    if (res.status === 101 || res.headers["upgrade"] === "websocket") unauthenticatedAccess = true;
  } catch { /* no WS endpoint */ }

  // Test 2: Check for WS on common paths
  const wsPaths = ["/ws", "/socket", "/websocket", "/live", "/realtime", "/api/ws"];
  const discoveredEndpoints: string[] = [];
  for (const path of wsPaths) {
    try {
      const res = await fetchUrl(`${base}${path}`, { headers: { Upgrade: "websocket", Connection: "Upgrade" }, timeoutMs: 3000 });
      if (res.status === 101 || res.status === 426) discoveredEndpoints.push(path);
    } catch { /* skip */ }
  }

  // Test 3: Check for Cross-Site WebSocket Hijacking (CSWSH)
  let cswhsPossible = false;
  try {
    const res = await fetchUrl(base, {
      headers: { Upgrade: "websocket", Connection: "Upgrade", Origin: "https://evil.example.com" },
      timeoutMs: 5000,
    });
    if (res.status === 101) cswhsPossible = true; // Server accepts WS from any origin
  } catch { /* ignore */ }

  const results = [
    { test: "Unauthenticated WS Access", vulnerable: unauthenticatedAccess, severity: "high", description: "WebSocket endpoint accepts connections without authentication." },
    { test: "CSWSH (Cross-Site WebSocket Hijacking)", vulnerable: cswhsPossible, severity: "high", description: "Server accepts WebSocket connections from any Origin, enables cross-site attacks." },
    { test: "WS Endpoints Discovered", vulnerable: discoveredEndpoints.length > 0, severity: "medium", description: `Found WebSocket endpoints: ${discoveredEndpoints.join(", ") || "none"}` },
  ];

  return NextResponse.json({
    target: base,
    ws_url: wsUrl,
    tests_run: 3,
    vulnerabilities_found: results.filter(r => r.vulnerable).length,
    discovered_endpoints: discoveredEndpoints,
    results,
  });
}
