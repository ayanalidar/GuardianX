import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/data-flow/monitor, real-time API data flow monitor.
// Shows per-endpoint, per-IP access patterns, scraping detection.
export async function GET() {
  // Last 500 requests
  const logs = await db.apiAccessLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 500,
  });

  // Honeypot hits
  const honeypots = await db.honeypotHit.findMany({
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  // Aggregate by IP
  const byIp = new Map<string, { count: number; endpoints: Set<string>; lastAccess: Date }>();
  for (const log of logs) {
    const existing = byIp.get(log.ipAddress) ?? { count: 0, endpoints: new Set<string>(), lastAccess: log.timestamp };
    existing.count++;
    existing.endpoints.add(log.endpoint);
    if (log.timestamp > existing.lastAccess) existing.lastAccess = log.timestamp;
    byIp.set(log.ipAddress, existing);
  }

  // Detect suspicious IPs (scraping behavior: high request count + many unique endpoints)
  const suspiciousIps = [...byIp.entries()]
    .map(([ip, data]) => ({
      ip,
      requestCount: data.count,
      uniqueEndpoints: data.endpoints.size,
      lastAccess: data.lastAccess.toISOString(),
      scrapingScore: Math.min(100, data.count + data.endpoints.size * 5),
      isBot: /bot|crawler|spider|curl|python|wget|scrapy/i.test(logs.find((l) => l.ipAddress === ip)?.userAgent ?? ""),
    }))
    .filter((d) => d.scrapingScore > 20 || d.isBot)
    .sort((a, b) => b.scrapingScore - a.scrapingScore);

  // Aggregate by endpoint
  const byEndpoint = new Map<string, number>();
  for (const log of logs) {
    byEndpoint.set(log.endpoint, (byEndpoint.get(log.endpoint) ?? 0) + 1);
  }
  const topEndpoints = [...byEndpoint.entries()]
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Total data transferred
  const totalDataTransferred = logs.reduce((s, l) => s + l.responseSize, 0);

  // Time window
  const oldest = logs[logs.length - 1]?.timestamp ?? new Date();
  const newest = logs[0]?.timestamp ?? new Date();
  const windowMinutes = Math.max(1, Math.round((newest.getTime() - oldest.getTime()) / 60000));

  return NextResponse.json({
    total_requests: logs.length,
    total_data_transferred: totalDataTransferred,
    unique_ips: byIp.size,
    unique_endpoints: byEndpoint.size,
    honeypot_hits: honeypots.length,
    suspicious_ips: suspiciousIps.length,
    monitoring_window_minutes: windowMinutes,
    requests_per_minute: Math.round(logs.length / windowMinutes),
    top_endpoints: topEndpoints,
    suspicious_ips_list: suspiciousIps,
    honeypot_hits_list: honeypots.map((h) => ({
      endpoint: h.endpoint,
      ipAddress: h.ipAddress,
      userAgent: h.userAgent,
      method: h.method,
      timestamp: h.timestamp.toISOString(),
    })),
    recent_requests: logs.slice(0, 20).map((l) => ({
      ipAddress: l.ipAddress,
      method: l.method,
      endpoint: l.endpoint,
      statusCode: l.statusCode,
      responseSize: l.responseSize,
      timestamp: l.timestamp.toISOString(),
    })),
  });
}
