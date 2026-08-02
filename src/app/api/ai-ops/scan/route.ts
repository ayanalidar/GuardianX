import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setDiagApiBaseUrl, runFullScan } from "@/lib/ai-ops/diagnostic-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai-ops/scan
// Runs a full health scan + AI diagnosis of every failing probe.
// No request body needed. Returns { health, diagnoses, summary }.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  setDiagApiBaseUrl(new URL(req.url).origin);

  try {
    const result = await runFullScan();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Scan failed",
      },
      { status: 500 }
    );
  }
}
