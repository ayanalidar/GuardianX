import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { quickHealthCheck, runFullHealthCheck, setApiBaseUrlFromRequest } from "@/lib/ai-ops/health-checker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/ai-ops/health
//   ?full=true  -> run the full scan (every API route + every DB table + engine)
//   default     -> quick check (1 DB probe + 1 API route + engine)
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  setApiBaseUrlFromRequest(req);

  try {
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "true";
    const report = full ? await runFullHealthCheck() : await quickHealthCheck();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Health check failed",
      },
      { status: 500 }
    );
  }
}
