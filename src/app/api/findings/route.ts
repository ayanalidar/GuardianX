import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
 */
export async function GET(req: Request) {
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
      }))
    );
  } catch (err) {
    // DB not reachable — return 503 so client can fall back to mock data.
    return NextResponse.json(
      { error: "findings_unavailable", detail: String(err) },
      { status: 503 }
    );
  }
}
