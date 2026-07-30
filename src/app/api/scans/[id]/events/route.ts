import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/scans/[id]/events — replay all persisted pipeline events for a scan.
// Used by clients that connect after the scan has started/finished.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
