import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/patches/stats
// Returns aggregate counts for the dashboard summary cards.
export async function GET() {
  try {
    const [pending, approved, rejected, critical] = await Promise.all([
      db.patch.count({ where: { status: "pending" } }),
      db.patch.count({ where: { status: "approved" } }),
      db.patch.count({ where: { status: "rejected" } }),
      db.patch.count({ where: { status: "pending", severity: "critical" } }),
    ]);

    return NextResponse.json({
      pending,
      approved,
      rejected,
      critical_pending: critical,
      total: pending + approved + rejected,
    });
  } catch (error) {
    console.error("[GET /api/patches/stats] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
