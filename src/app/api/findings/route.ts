import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { measureApiTime } from "@/lib/performance";

export const dynamic = "force-dynamic";

/**
 * GET /api/findings?limit=20
 * -------------------------
 * Returns the most recent findings across ALL engagements (newest first).
 * Used by the public homepage live vulnerability feed ticker.
 *
 * The endpoint is defensive: if the DB is unreachable (e.g. missing
 * DATABASE_URL in dev), it returns a 503 so the client can fall back to
 * mock data without throwing.
 *
 * Performance (perf-optimize task):
 *   - Wrapped with `measureApiTime` so slow responses (>500ms) are logged.
 *   - 60s public Cache-Control so the public homepage ticker doesn't
 *     hammer the DB on every visitor's first paint.
 */
export const GET = measureApiTime(
  "/api/findings",
  async function GET(req: Request) {
    const url = new URL(req.url);
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;

    try {
      const findings = (await db.finding.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { engagement: { select: { targetId: true } } },
      })) as Array<{
        id: string;
        title: string;
        severity: string;
        category: string;
        owasp: string | null;
        endpoint: string;
        method: string;
        description: string;
        payload: string | null;
        confidence: number;
        remediation: string | null;
        engagementId: string;
        createdAt: { toISOString(): string } | string;
        engagement?: { targetId: string | null } | null;
      }>;

      return NextResponse.json(
        findings.map((f) => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          category: f.category,
          owasp: f.owasp,
          endpoint: f.endpoint,
          method: f.method,
          description: f.description,
          payload: f.payload,
          confidence: f.confidence,
          remediation: f.remediation,
          engagement_id: f.engagementId,
          target_id: f.engagement?.targetId ?? null,
          created_at:
            typeof f.createdAt === "string"
              ? f.createdAt
              : f.createdAt.toISOString(),
        })),
        {
          headers: {
            // Public cache — the homepage ticker fetches this on every visitor's
            // first paint. A 60s edge cache keeps DB load flat regardless of
            // traffic spikes.
            "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=30",
          },
        }
      );
    } catch (err) {
      // DB not reachable — return 503 so client can fall back to mock data.
      return NextResponse.json(
        { error: "findings_unavailable", detail: String(err) },
        { status: 503 }
      );
    }
  },
);
