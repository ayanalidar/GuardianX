import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/heatmap, security heatmap showing vuln density per codebase file.
export async function GET() {
  const patches = await db.patch.findMany({
    select: { codebaseId: true, affectedFile: true, severity: true, status: true },
  });

  const codebases = await db.codebase.findMany({ select: { id: true, name: true } });
  const cbMap = new Map(codebases.map(c => [c.id, c.name]));

  // Group by codebase → file → severity counts
  const heatmap: Record<string, Record<string, { critical: number; high: number; medium: number; low: number; total: number; resolved: number }>> = {};

  for (const p of patches) {
    const cbName = cbMap.get(p.codebaseId) ?? "unknown";
    if (!heatmap[cbName]) heatmap[cbName] = {};
    if (!heatmap[cbName][p.affectedFile]) heatmap[cbName][p.affectedFile] = { critical: 0, high: 0, medium: 0, low: 0, total: 0, resolved: 0 };
    const sev = p.severity as keyof typeof heatmap[string][string];
    if (sev in heatmap[cbName][p.affectedFile]) heatmap[cbName][p.affectedFile][sev]++;
    heatmap[cbName][p.affectedFile].total++;
    if (p.status !== "pending") heatmap[cbName][p.affectedFile].resolved++;
  }

  // Compute risk score per file (0-100)
  const result = Object.entries(heatmap).map(([codebase, files]) => ({
    codebase,
    files: Object.entries(files).map(([file, counts]) => {
      const riskScore = Math.min(100, counts.critical * 30 + counts.high * 15 + counts.medium * 8 + counts.low * 3);
      const heat = riskScore >= 70 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : riskScore > 0 ? "low" : "clean";
      return { file, ...counts, riskScore, heat };
    }).sort((a, b) => b.riskScore - a.riskScore),
  }));

  return NextResponse.json({ codebases: result, totalFiles: result.reduce((s, c) => s + c.files.length, 0) });
}
