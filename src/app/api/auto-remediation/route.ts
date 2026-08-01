import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/auto-remediation — AI auto-remediation pipeline
// Finds all pending critical/high patches that passed sandbox + adversarial,
// auto-approves them, and deploys to staging.
// Body: { clientId?: string, severity?: "critical" | "high" }
export async function POST(req: Request) {
  const { clientId, severity = "critical" } = await req.json().catch(() => ({}));

  try {
    // Find all codebases (optionally filtered by client)
    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true, clientId: true } });

    const remediated: { patchId: string; title: string; severity: string; codebase: string; status: string }[] = [];
    const skipped: { patchId: string; title: string; reason: string }[] = [];

    for (const cb of codebases) {
      // Find pending patches of the target severity that passed sandbox
      const patches = await db.patch.findMany({
        where: {
          codebaseId: cb.id,
          status: "pending",
          severity,
          sandboxPassed: true,
        },
        select: { id: true, patchId: true, title: true, severity: true },
      });

      for (const p of patches) {
        // Check if adversarial was won (defender victory) OR no adversarial needed
        const fullPatch = await db.patch.findFirst({
          where: { id: p.id },
          select: { adversarialWon: true, adversarialRounds: true },
        });

        if (fullPatch && fullPatch.adversarialRounds > 0 && !fullPatch.adversarialWon) {
          skipped.push({ patchId: p.patchId, title: p.title, reason: "Adversarial test not won — needs human review" });
          continue;
        }

        // Auto-approve
        await db.patch.update({
          where: { id: p.id },
          data: { status: "approved", approvedAt: new Date() },
        });

        // Update codebase with patched code
        const patchDetail = await db.patch.findFirst({
          where: { id: p.id },
          select: { patchedCode: true },
        });
        if (patchDetail?.patchedCode) {
          await db.codebase.update({
            where: { id: cb.id },
            data: { sourceCode: patchDetail.patchedCode },
          });
        }

        // Create attestation
        const { createHash } = await import("node:crypto");
        const latestAtt = await db.attestation.findFirst({ orderBy: { createdAt: "desc" } });
        const prevHash = latestAtt?.hash ?? "0";
        const patchedCodeHash = createHash("sha256").update(patchDetail?.patchedCode || "").digest("hex");
        const approvedAt = new Date().toISOString();
        const hash = createHash("sha256").update(prevHash + p.id + patchedCodeHash + approvedAt).digest("hex");
        const { randomUUID } = await import("node:crypto");
        await db.attestation.create({
          data: {
            id: randomUUID(),
            patchId: p.id,
            prevHash,
            hash,
            data: JSON.stringify({ patchId: p.patchId, codebase: cb.name, title: p.title, severity: p.severity, approvedAt, patchedCodeHash, autoRemediated: true }),
          },
        });

        remediated.push({
          patchId: p.patchId,
          title: p.title,
          severity: p.severity,
          codebase: cb.name,
          status: "deployed_to_staging",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      remediated,
      skipped,
      summary: {
        total_processed: remediated.length + skipped.length,
        auto_approved: remediated.length,
        needs_review: skipped.length,
      },
      message: `Auto-remediation complete: ${remediated.length} patches deployed, ${skipped.length} need human review.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
