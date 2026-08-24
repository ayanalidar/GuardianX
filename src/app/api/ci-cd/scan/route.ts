import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/ci-cd/scan, triggered by CI/CD webhook (GitHub Actions, GitLab CI).
// Body: { codebaseId, commitSha, branch, prId }
// Returns: { scanId, status, blockMerge }, blockMerge=true if critical vulns found.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { codebaseId, commitSha, branch, prId } = body;

  if (!codebaseId) return NextResponse.json({ error: "codebaseId required" }, { status: 400 });

  const cb = await db.codebase.findUnique({ where: { id: codebaseId } });
  if (!cb) return NextResponse.json({ error: "codebase not found" }, { status: 404 });

  // Check for concurrent scans
  const running = await db.scan.findFirst({
    where: { codebaseId, status: { in: ["queued", "analyzing", "patching", "sandboxing"] } },
  });
  if (running) return NextResponse.json({ error: "Scan already running", scanId: running.id }, { status: 409 });

  const scan = await db.scan.create({ data: { codebaseId, status: "queued", stageLabel: "CI/CD triggered scan" } });

  // Fire-and-forget to the Railway engine
  engineFireAndForget("/api/run-sast", { codebaseId, scanId: scan.id });

  // Log to audit trail
  await db.auditLog.create({
    data: { action: "ci_cd_scan_started", entity: scan.id, details: JSON.stringify({ codebaseId, commitSha, branch, prId }) },
  });

  return NextResponse.json({
    scanId: scan.id,
    status: "queued",
    message: "CI/CD scan started. Check status via GET /api/scans.",
    commitSha: commitSha || null,
    branch: branch || null,
    prId: prId || null,
  }, { status: 202 });
}

// GET /api/ci-cd/scan?scanId=xxx, check if a CI/CD scan blocks merge.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId");
  if (!scanId) return NextResponse.json({ error: "scanId required" }, { status: 400 });

  const scan = await db.scan.findUnique({ where: { id: scanId }, include: { patches: { select: { severity: true, status: true } } } });
  if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patches = (scan.patches as Array<{ severity: string; status: string }>) || [];
  const criticalPending = patches.filter(p => p.severity === "critical" && p.status === "pending").length;
  const blockMerge = scan.status === "completed" && criticalPending > 0;

  return NextResponse.json({
    scanId: scan.id,
    status: scan.status,
    blockMerge,
    reason: blockMerge ? `${criticalPending} critical vulnerability(ies) found, merge blocked` : "Safe to merge",
    criticalPending,
    totalPatches: patches.length,
  });
}
