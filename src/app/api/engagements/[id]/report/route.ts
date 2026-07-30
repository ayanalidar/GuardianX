import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/engagements/[id]/report — generate + stream a professional VAPT PDF report.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const engagement = await db.engagement.findUnique({
    where: { id },
    include: { target: true, findings: true },
  });
  if (!engagement)
    return NextResponse.json({ error: "engagement not found" }, { status: 404 });

  const data = {
    engagement: {
      id: engagement.id,
      status: engagement.status,
      stageLabel: engagement.stageLabel,
      started_at: engagement.startedAt.toISOString(),
      completed_at: engagement.completedAt?.toISOString() ?? null,
    },
    target: {
      name: engagement.target.name,
      base_url: engagement.target.baseUrl,
      authorized: engagement.target.authorized,
      auth_header_set: !!engagement.target.authHeader,
    },
    findings: engagement.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category,
      owasp: f.owasp,
      endpoint: f.endpoint,
      method: f.method,
      description: f.description,
      proofRequest: f.proofRequest,
      proofResponse: f.proofResponse,
      payload: f.payload,
      confidence: f.confidence,
      remediation: f.remediation,
    })),
  };

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "guardianx-report-"));
    const jsonPath = join(dir, "engagement.json");
    const pdfPath = join(dir, "vapt-report.pdf");
    await writeFile(jsonPath, JSON.stringify(data), "utf8");

    // Run the Python ReportLab generator
    const scriptPath = join(process.cwd(), "scripts", "generate-vapt-report.py");
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn("python3", [scriptPath, jsonPath, pdfPath], {
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code !== 0) console.error("[report] python stderr:", stderr);
        resolve(code ?? -1);
      });
      child.on("error", () => resolve(-1));
    });

    if (exitCode !== 0) {
      return NextResponse.json(
        { error: `report generation failed (exit ${exitCode})` },
        { status: 500 }
      );
    }

    const pdf = await readFile(pdfPath);
    const filename = `GuardianX-VAPT-Report-${engagement.target.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}
