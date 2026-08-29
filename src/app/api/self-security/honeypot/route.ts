// GET /api/self-security/honeypot — admin-only, returns honeypot hits + stats
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const [hits, totalHits, uniqueIps] = await Promise.all([
    db.honeypotHit.findMany({
      orderBy: { detectedAt: "desc" },
      take: 50,
    }).catch(() => []),
    db.honeypotHit.count().catch(() => 0),
    db.honeypotHit.findMany({
      select: { ipAddress: true },
      distinct: ["ipAddress"],
    }).catch(() => []),
  ]);

  // Top endpoints
  const endpointCounts: Record<string, number> = {};
  for (const h of hits) {
    endpointCounts[h.endpoint] = (endpointCounts[h.endpoint] || 0) + 1;
  }
  const topEndpoints = Object.entries(endpointCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([endpoint, count]) => ({ endpoint, count }));

  return NextResponse.json({
    hits,
    stats: {
      totalHits,
      uniqueIps: uniqueIps.length,
      topEndpoints,
    },
  });
}
