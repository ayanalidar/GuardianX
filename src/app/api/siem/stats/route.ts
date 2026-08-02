import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSiemStats } from "@/lib/siem/search";

export const dynamic = "force-dynamic";

// GET /api/siem/stats - dashboard stats for the SIEM module.
// Query: ?range=24h|7d|30d (default 24h)
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "24h";
    const stats = await getSiemStats(range);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load SIEM stats" },
      { status: 500 }
    );
  }
}
