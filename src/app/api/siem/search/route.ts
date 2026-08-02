import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { unifiedSearch, type SiemSource, type SiemSeverity } from "@/lib/siem/search";

export const dynamic = "force-dynamic";

// GET /api/siem/search - unified log search across all 7 SIEM sources.
//
// Query params:
//   q          - free-text query (matches title + description)
//   sources    - comma-separated source list
//                 (audit,api_access,honeypot,canary,incident,finding,patch)
//   severities - comma-separated severity list
//                 (critical,high,medium,low,info)
//   from       - ISO date string (start of time window)
//   to         - ISO date string (end of time window)
//   ip         - filter by IP address
//   range      - shorthand time range: 24h | 7d | 30d (overrides from/to)
//   limit      - max results (default 200, max 1000)
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const range = url.searchParams.get("range") || undefined;
    const fromParam = url.searchParams.get("from") || undefined;
    const toParam = url.searchParams.get("to") || undefined;
    const sourcesParam = url.searchParams.get("sources");
    const severitiesParam = url.searchParams.get("severities");
    const ip = url.searchParams.get("ip") || undefined;
    const limitParam = url.searchParams.get("limit");

    // Resolve the time window. If `range` is set it overrides from/to.
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (range) {
      const m = /^(\d+)([hdw])$/.exec(range.toLowerCase().trim());
      if (m) {
        const n = parseInt(m[1], 10);
        const end = new Date();
        const start = new Date(end.getTime());
        if (m[2] === "h") start.setHours(start.getHours() - n);
        else if (m[2] === "d") start.setDate(start.getDate() - n);
        else if (m[2] === "w") start.setDate(start.getDate() - n * 7);
        startTime = start.toISOString();
        endTime = end.toISOString();
      }
    } else {
      startTime = fromParam || undefined;
      endTime = toParam || undefined;
    }

    const sources = sourcesParam
      ? (sourcesParam.split(",").map((s) => s.trim()).filter(Boolean) as SiemSource[])
      : undefined;

    const severities = severitiesParam
      ? (severitiesParam.split(",").map((s) => s.trim()).filter(Boolean) as SiemSeverity[])
      : undefined;

    const limit = limitParam ? parseInt(limitParam, 10) : 200;

    const entries = await unifiedSearch({
      query: q,
      sources,
      severities,
      startTime,
      endTime,
      ipAddress: ip,
      limit,
    });

    return NextResponse.json({
      total: entries.length,
      query: q || null,
      filters: {
        sources: sources || "all",
        severities: severities || "all",
        startTime: startTime || null,
        endTime: endTime || null,
        ipAddress: ip || null,
      },
      entries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SIEM search failed" },
      { status: 500 }
    );
  }
}
