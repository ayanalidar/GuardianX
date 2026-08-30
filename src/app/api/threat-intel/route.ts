import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── NVD CVE Feed ──────────────────────────────────────────────────────────
// Fetches recent critical CVEs from the NIST NVD JSON API (free, no key
// required, rate-limited to 5 req/30s without a key). This is a REAL data
// source — not mock. Falls back to an empty array on network failure.
async function fetchNvdCves(): Promise<Array<{
  id: string;
  description: string;
  cvss: number | null;
  published: string;
  url: string;
  referenceText: string | null;
}>> {
  try {
    // NVD API: recently-published CVEs with CVSS severity HIGH/CRITICAL.
    // pubStartDate = last 7 days, resultsPerPage = 20.
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "");
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt(weekAgo)}&pubEndDate=${fmt(now)}&cvssV3Severity=HIGH&resultsPerPage=20`;
    const res = await fetch(url, {
      headers: { "User-Agent": "GuardianX-ThreatIntel/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const vulns = (data.vulnerabilities || []) as Array<{
      cve: {
        id: string;
        descriptions: Array<{ lang: string; value: string }>;
        published: string;
        metrics?: {
          cvssMetricV31?: Array<{ cvssData: { baseScore: number } }>;
        };
        references?: Array<{ url: string; source?: string }>;
      };
    }>;
    return vulns.map((v) => {
      const desc = v.cve.descriptions?.find((d) => d.lang === "en")?.value || "";
      const cvss = v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ?? null;
      const ref = v.cve.references?.[0];
      return {
        id: v.cve.id,
        description: desc.slice(0, 300),
        cvss,
        published: v.cve.published,
        url: ref?.url || `https://nvd.nist.gov/vuln/detail/${v.cve.id}`,
        referenceText: ref?.source || null,
      };
    });
  } catch (err) {
    console.warn("[threat-intel] NVD fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// GET /api/threat-intel, fetch latest CVEs from NVD + cross-reference codebases.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const cves = await fetchNvdCves();

    const codebases = await db.codebase.findMany({
      select: { name: true, description: true },
    });

    // Cross-reference: check if any CVE description mentions keywords from codebase names/descriptions
    const threats = cves.map((cve) => {
      const text = `${cve.id} ${cve.description}`.toLowerCase();
      const relatedCodebases = codebases.filter((cb) => {
        const cbText = `${cb.name} ${cb.description ?? ""}`.toLowerCase();
        const keywords = cbText.split(/[\s./_-]+/).filter((w) => w.length > 3);
        return keywords.some((k) => text.includes(k));
      }).map((cb) => cb.name);

      const severity = cve.cvss !== null
        ? (cve.cvss >= 9.0 ? "critical" : cve.cvss >= 7.0 ? "high" : "medium")
        : "medium";

      return {
        title: cve.id,
        url: cve.url,
        source: "NIST NVD",
        date: cve.published,
        snippet: cve.description,
        cve: cve.id,
        cvss: cve.cvss,
        severity,
        related_codebases: relatedCodebases,
        relevance: relatedCodebases.length > 0 ? "high" : "info",
      };
    });

    return NextResponse.json({
      threat_count: threats.length,
      high_relevance: threats.filter((t) => t.relevance === "high").length,
      fetched_at: new Date().toISOString(),
      source: "NIST NVD",
      threats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "threat intel unavailable", threats: [], threat_count: 0 },
      { status: 200 }
    );
  }
}
