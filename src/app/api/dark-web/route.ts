import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// GET /api/dark-web, search for leaked credentials and data breaches
// matching the user's codebase names + common breach databases.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const z = await sdk();
    const codebases = await db.codebase.findMany({ select: { name: true } });
    const searchTerms = codebases.map((c) => c.name).join(" ") || "guardianx";

    // Search for recent credential leaks + breaches
    const [breachResults, leakResults] = await Promise.all([
      z.functions.invoke("web_search", {
        query: `data breach leaked credentials passwords ${searchTerms} 2024 2025`,
        num: 8,
        recency_days: 90,
      }),
      z.functions.invoke("web_search", {
        query: `dark web leaked database dump site:haveibeenpwned.com OR site:dehashed.com OR "credential leak"`,
        num: 8,
        recency_days: 90,
      }),
    ]);

    const allResults = [...(breachResults as unknown[]), ...(leakResults as unknown[])] as Array<{
      url: string; name: string; snippet: string; host_name: string; date: string;
    }>;

    // Parse + classify
    const exposures = allResults
      .filter((r) => r && r.name)
      .map((r) => {
        const text = `${r.name} ${r.snippet}`.toLowerCase();
        const types: string[] = [];
        if (text.includes("email")) types.push("Email addresses");
        if (text.includes("password")) types.push("Passwords");
        if (text.includes("hash")) types.push("Password hashes");
        if (text.includes("credit") || text.includes("card")) types.push("Payment data");
        if (text.includes("phone")) types.push("Phone numbers");
        if (text.includes("token") || text.includes("api")) types.push("API tokens");
        if (text.includes("ssn") || text.includes("social")) types.push("SSNs");

        const isOfficial = r.host_name.includes("haveibeenpwned") || r.host_name.includes("cisa") || r.host_name.includes("krebsonsecurity");

        return {
          title: r.name,
          url: r.url,
          source: r.host_name,
          date: r.date,
          snippet: r.snippet.slice(0, 200),
          data_types: types.length > 0 ? types : ["Unknown"],
          severity: types.includes("Passwords") || types.includes("Payment data") ? "critical" : types.length > 2 ? "high" : "medium",
          verified_source: isOfficial,
        };
      })
      .slice(0, 10);

    const criticalCount = exposures.filter((e) => e.severity === "critical").length;

    return NextResponse.json({
      monitoring_active: true,
      exposure_count: exposures.length,
      critical_exposures: criticalCount,
      last_scan: new Date().toISOString(),
      search_terms: searchTerms,
      exposures,
    });
  } catch (err) {
    return NextResponse.json({
      monitoring_active: false,
      exposure_count: 0,
      critical_exposures: 0,
      last_scan: new Date().toISOString(),
      error: err instanceof Error ? err.message : "scan failed",
      exposures: [],
    });
  }
}
