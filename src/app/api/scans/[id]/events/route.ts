import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/scans/[id]/events, replay all persisted pipeline events for a scan.
// Used by clients that connect after the scan has started/finished.
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const events = await db.pipelineEvent.findMany({
    where: { scanId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    events.map((e) => ({
      scanId: id,
      stage: e.stage,
      message: e.message,
      level: e.level as "info" | "success" | "warning" | "error",
      meta: e.meta ? safeParse(e.meta) : null,
      ts: e.createdAt.toISOString(),
    }))
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
