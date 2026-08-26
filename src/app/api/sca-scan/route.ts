import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// Extract dependency names from source code (require/import patterns)
function extractDependencies(source: string): string[] {
  const deps = new Set<string>();
  // require('pkg') / require("pkg")
  const requireRe = /require\s*\(\s*['"]([^'"./][^'"]*?)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = requireRe.exec(source)) !== null) {
    const pkg = m[1].split("/")[0]; // handle scoped @org/pkg
    if (!pkg.startsWith(".") && !pkg.startsWith("/") && pkg.length > 1) deps.add(pkg);
  }
  // import ... from 'pkg'
  const importRe = /import\s+[^'"]*\s+from\s+['"]([^'"./][^'"]*?)['"]/g;
  while ((m = importRe.exec(source)) !== null) {
    const pkg = m[1].split("/")[0];
    if (!pkg.startsWith(".") && !pkg.startsWith("/") && pkg.length > 1) deps.add(pkg);
  }
  // import 'pkg' (side-effect)
  const sideEffectRe = /import\s+['"]([^'"./][^'"]*?)['"]/g;
  while ((m = sideEffectRe.exec(source)) !== null) {
    const pkg = m[1].split("/")[0];
    if (!pkg.startsWith(".") && !pkg.startsWith("/") && pkg.length > 1) deps.add(pkg);
  }
  return [...deps];
}

// GET /api/sca-scan?codebaseId=xxx, scan dependencies for known CVEs
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(req.url);
  const codebaseId = url.searchParams.get("codebaseId");

  if (!codebaseId) {
    // Scan all codebases
    const codebases = await db.codebase.findMany({ select: { id: true, name: true, sourceCode: true } });
    const allResults: Array<{ codebase_id: string; codebase_name: string; dependencies: string[] }> = [];
    for (const cb of codebases) {
      const deps = extractDependencies((cb.sourceCode as string) || "");
      if (deps.length > 0) {
        allResults.push({ codebase_id: cb.id as string, codebase_name: cb.name as string, dependencies: deps });
      }
    }
    return NextResponse.json({ codebases: allResults, total_deps: allResults.reduce((s, c) => s + c.dependencies.length, 0) });
  }

  const cb = await db.codebase.findUnique({ where: { id: codebaseId } });
  if (!cb) return NextResponse.json({ error: "codebase not found" }, { status: 404 });

  const dependencies = extractDependencies((cb.sourceCode as string) || "");
  if (dependencies.length === 0) {
    return NextResponse.json({ codebase: cb.name as string, dependencies: [], vulnerabilities: [], message: "No external dependencies detected in source code." });
  }

  // Search for CVEs in each dependency (batch: search for top 5 deps at once)
  const z = await sdk();
  const topDeps = dependencies.slice(0, 8);
  const vulnResults: Array<{ dependency: string; cve: string | null; severity: string; title: string; url: string; fixed_in: string | null }> = [];

  for (const dep of topDeps) {
    try {
      const results = await z.functions.invoke("web_search", {
        query: `${dep} npm vulnerability CVE 2024 2025 exploit`,
        num: 3,
        recency_days: 365,
      }) as Array<{ name: string; snippet: string; url: string; date: string }>;

      for (const r of (results || []).slice(0, 2)) {
        const cveMatch = (r.name + r.snippet).match(/CVE-\d{4}-\d+/i);
        const sevMatch = (r.name + r.snippet).toLowerCase();
        const severity = sevMatch.includes("critical") ? "critical" : sevMatch.includes("high") ? "high" : sevMatch.includes("medium") ? "medium" : "low";
        const fixedMatch = r.snippet.match(/fix(?:ed)?\s*(?:in|version)?\s*[:\s]*(\d+\.\d+[\d.]*)/i);
        vulnResults.push({
          dependency: dep,
          cve: cveMatch ? cveMatch[0].toUpperCase() : null,
          severity,
          title: r.name,
          url: r.url,
          fixed_in: fixedMatch ? fixedMatch[1] : null,
        });
      }
    } catch { /* skip */ }
  }

  const critical = vulnResults.filter(v => v.severity === "critical").length;
  const high = vulnResults.filter(v => v.severity === "high").length;

  return NextResponse.json({
    codebase: cb.name as string,
    codebase_id: cb.id as string,
    total_dependencies: dependencies.length,
    scanned_dependencies: topDeps.length,
    vulnerabilities_found: vulnResults.length,
    critical,
    high,
    sca_score: Math.max(0, 100 - critical * 25 - high * 10),
    dependencies: dependencies.map(d => ({ name: d, vulnerable: vulnResults.some(v => v.dependency === d) })),
    vulnerabilities: vulnResults,
  });
}
