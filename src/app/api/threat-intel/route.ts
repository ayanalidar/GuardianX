import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// GET /api/threat-intel, fetch latest CVEs via web search + cross-reference codebases.
export async function GET() {
  try {
    const z = await sdk();
    const results = await z.functions.invoke("web_search", {
      query: "latest critical CVE vulnerability disclosure 2024 2025",
      num: 10,
      recency_days: 30,
    });

    const codebases = await db.codebase.findMany({
      select: { name: true, description: true },
    });

    // Cross-reference: check if any CVE result mentions keywords from codebase names/descriptions
    const threats = (results as Array<{ url: string; name: string; snippet: string; host_name: string; date: string }>)
      .filter((r) => r && r.name)
      .map((r) => {
        const text = `${r.name} ${r.snippet}`.toLowerCase();
        const relatedCodebases = codebases.filter((cb) => {
          const cbText = `${cb.name} ${cb.description ?? ""}`.toLowerCase();
          // Check if any significant word from the codebase appears in the CVE
          const keywords = cbText.split(/[\s./_-]+/).filter((w) => w.length > 3);
          return keywords.some((k) => text.includes(k));
        }).map((cb) => cb.name);

        // Extract CVE ID if present
        const cveMatch = r.name.match(/CVE-\d{4}-\d+/i) || r.snippet.match(/CVE-\d{4}-\d+/i);

        return {
          title: r.name,
          url: r.url,
          source: r.host_name,
          date: r.date,
          snippet: r.snippet.slice(0, 200),
          cve: cveMatch ? cveMatch[0].toUpperCase() : null,
          related_codebases: relatedCodebases,
          relevance: relatedCodebases.length > 0 ? "high" : "info",
        };
      });

    return NextResponse.json({
      threat_count: threats.length,
      high_relevance: threats.filter((t) => t.relevance === "high").length,
      fetched_at: new Date().toISOString(),
      threats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "threat intel unavailable", threats: [], threat_count: 0 },
      { status: 200 } // return 200 with empty list so UI doesn't break
    );
  }
}
