import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/audit-log, list audit log entries (system-wide activity trail)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const action = url.searchParams.get("action");

  const where = action ? { action } : {};
  const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json({
    total: logs.length,
    entries: logs.map(l => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      actor: l.actor,
      details: l.details ? JSON.parse(l.details) : null,
      timestamp: l.createdAt.toISOString(),
    })),
  });
}
