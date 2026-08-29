// GET /api/public-scan/[id]
//
// Public endpoint (NO auth — visitors can view their full report by URL
// after a scan completes).
//
// Returns the full WebsiteScan row INCLUDING the parsed findings JSON.
// Privacy: `email` and `ipAddress` are excluded from the response — only
// the findings are surfaced. (The visitor already knows their own email;
// the report is shareable by URL without leaking PII to anyone who
// happens to see the link.)
//
// The summary is re-derived from the findings via the templated fallback
// because the WebsiteScan schema has no `summary` column. The /scan route
// returned the LLM-generated summary directly to the scan caller at scan
// time; this GET endpoint re-renders the report from persisted state.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Finding shape (matches scan/route.ts; declared locally to avoid
// creating a shared file outside the allowed scope) ─────────────────────────
type Severity = "critical" | "high" | "medium" | "low" | "info";

interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  endpoint: string;
  method: string;
  description: string;
  remediation: string;
  evidence?: string;
}

// Templated summary — keep in sync with scan/route.ts + send-report/route.ts.
function templatedSummary(findings: ScanFinding[]): string {
  if (findings.length === 0) {
    return "GuardianX found no obvious security issues during this external scan. We recommend re-scanning periodically and after any infrastructure change.";
  }
  const topOrder: Severity[] = ["critical", "high", "medium", "low", "info"];
  const top = findings
    .slice()
    .sort((a, b) => topOrder.indexOf(a.severity) - topOrder.indexOf(b.severity))
    .slice(0, 1)[0];
  const categories = new Set(findings.map((f) => f.category)).size;
  return (
    `GuardianX identified ${findings.length} security issue${findings.length === 1 ? "" : "s"} ` +
    `across ${categories} categor${categories === 1 ? "y" : "ies"}. ` +
    `The most severe is "${top.title}" (${top.severity.toUpperCase()}) at ${top.endpoint}. ` +
    `We recommend prioritising remediation by severity and re-scanning after fixes are deployed.`
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Scan id is required." }, { status: 400 });
  }

  const scan = await db.websiteScan.findUnique({ where: { id } });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  // ── Parse findings JSON (defensive — schema defaults to "[]") ─────────────
  let findings: ScanFinding[] = [];
  try {
    const parsed = JSON.parse(scan.findings || "[]") as unknown;
    if (Array.isArray(parsed)) {
      findings = parsed as ScanFinding[];
    }
  } catch {
    findings = [];
  }

  // ── Duck-typed summary check (works whether or not a summary column exists) ─
  const persistedSummary = (scan as unknown as { summary?: string | null }).summary;
  const summary = persistedSummary || templatedSummary(findings);

  // ── Build the response, omitting PII fields ───────────────────────────────
  return NextResponse.json({
    id: scan.id,
    url: scan.url,
    status: scan.status,
    score: scan.score,
    findingsCount: scan.findingsCount,
    criticalCount: scan.criticalCount,
    highCount: scan.highCount,
    mediumCount: scan.mediumCount,
    lowCount: scan.lowCount,
    findings,
    summary,
    reportSent: scan.reportSent,
    duration: scan.duration,
    createdAt: scan.createdAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    // Intentionally omitted: email, ipAddress, userAgent, reportPath
  });
}
