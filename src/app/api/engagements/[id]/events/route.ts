import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

function safeJson(s: string | null, fallback: unknown) {
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// GET /api/engagements/[id]/events, replay persisted RedAgent events.
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const events = await db.redAgentEvent.findMany({
    where: { engagementId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    events.map((e) => ({
      engagementId: id,
      stage: e.stage,
      message: e.message,
      level: e.level as "info" | "success" | "warning" | "error",
      meta: safeJson(e.meta, null),
      ts: e.createdAt.toISOString(),
    }))
  );
}
