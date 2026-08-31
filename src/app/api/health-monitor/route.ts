import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

// GET /api/health-monitor — returns server-side health data.
// Calls each API endpoint + checks DB connectivity.
// Admin-only.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const base = new URL(req.url).origin;
  const checks: Array<{ endpoint: string; status: number; duration: number; ok: boolean }> = [];

  // Test key endpoints
  const endpoints = [
    "/api/health",
    "/api/stats",
    "/api/clients",
    "/api/findings?limit=1",
    "/api/patches/pending",
    "/api/posture-score",
    "/api/threat-intel",
    "/api/public-scan/recent?limit=1",
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await fetch(`${base}${ep}`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(10_000),
      });
      checks.push({
        endpoint: ep,
        status: res.status,
        duration: Date.now() - start,
        ok: res.ok,
      });
    } catch (err) {
      checks.push({
        endpoint: ep,
        status: 0,
        duration: Date.now() - start,
        ok: false,
      });
    }
  }

  const passCount = checks.filter((c) => c.ok).length;
  const overallOk = passCount === checks.length;

  return NextResponse.json({
    ok: overallOk,
    passCount,
    failCount: checks.length - passCount,
    checks,
    timestamp: new Date().toISOString(),
  });
}
