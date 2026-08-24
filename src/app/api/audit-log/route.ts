import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/audit-log, list audit log entries (system-wide activity trail)
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
      details: l.details ? JSON.parse(l.details as string) : null,
      timestamp: (l.createdAt as Date).toISOString(),
    })),
  });
}
