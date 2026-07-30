import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard summary counts.
export async function GET() {
  const [pending, approved, rejected, critical, codebases, scans] = await Promise.all([
    db.patch.count({ where: { status: "pending" } }),
    db.patch.count({ where: { status: "approved" } }),
    db.patch.count({ where: { status: "rejected" } }),
    db.patch.count({ where: { status: "pending", severity: "critical" } }),
    db.codebase.count(),
    db.scan.count(),
  ]);

  return NextResponse.json({
    pending,
    approved,
    rejected,
    critical_pending: critical,
    total: pending + approved + rejected,
    codebases,
    scans,
  });
}
