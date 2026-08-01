import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/auto-approve — auto-approves patches that passed sandbox + adversarial
// Body: { maxSeverity?: "low" | "medium" }  (never auto-approve high/critical)
export async function POST(req: Request) {
  const { maxSeverity = "medium" } = await req.json().catch(() => ({}));

  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const maxRank = severityOrder[maxSeverity as keyof typeof severityOrder] ?? 1;

  try {
    const approved: { patchId: string; title: string; severity: string }[] = [];

    // Find all pending patches that passed sandbox, with severity <= maxSeverity
    const patches = await db.patch.findMany({
      where: { status: "pending", sandboxPassed: true },
      select: { id: true, patchId: true, title: true, severity: true, adversarialWon: true, adversarialRounds: true, patchedCode: true, codebaseId: true },
    });

    for (const p of patches) {
      const sev = p.severity as string;
      const patchRank = severityOrder[sev as keyof typeof severityOrder] ?? 3;
      if (patchRank > maxRank) continue; // skip high/critical

      // Must have won adversarial (if rounds > 0)
      if (p.adversarialRounds > 0 && !p.adversarialWon) continue;

      // Auto-approve
      await db.patch.update({
        where: { id: p.id },
        data: { status: "approved", approvedAt: new Date() },
      });

      // Deploy to codebase
      if (p.patchedCode) {
        await db.codebase.update({
          where: { id: p.codebaseId as string },
          data: { sourceCode: p.patchedCode as string },
        });
      }

      approved.push({ patchId: p.patchId as string, title: p.title as string, severity: sev });
    }

    return NextResponse.json({
      ok: true,
      approved,
      count: approved.length,
      message: `Auto-approved ${approved.length} patches (severity ≤ ${maxSeverity}).`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
