import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/breach-notification, auto-draft a DPDPA §8(6) breach notification
// for any confirmed data exposure findings.
export async function GET() {
  try {
    const exposureFindings = await db.finding.findMany({
      where: {
        OR: [
          { category: { contains: "Exposure" } },
          { category: { contains: "Disclosure" } },
          { title: { contains: ".env" } },
          { title: { contains: "Secret" } },
        ],
      },
      include: { engagement: { include: { target: { select: { name: true, baseUrl: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    if (!exposureFindings || exposureFindings.length === 0) {
      return NextResponse.json({
        breach_detected: false,
        notification_required: false,
        message: "No personal data breaches detected. No DPDPA notification required.",
      });
    }

    return NextResponse.json({
      breach_detected: true,
      notification_required: true,
      finding_count: exposureFindings.length,
      findings: exposureFindings.map((f: Record<string, unknown>) => ({
        title: f.title,
        severity: f.severity,
        category: f.category,
        endpoint: f.endpoint,
      })),
      message: "Breach detected. DPDPA notification may be required.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
