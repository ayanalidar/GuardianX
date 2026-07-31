import { NextResponse } from "next/server";
import { engineCall } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/engagements/[id]/report — generate + stream a professional VAPT PDF report.
// Proxies to the Railway engine, which spawns python3 + ReportLab.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await engineCall("/api/generate-pdf", { engagementId: id });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error || "PDF generation failed" },
      { status: result.status || 500 }
    );
  }

  const pdfBuffer = result.data as ArrayBuffer;
  const disposition = result.headers.get("content-disposition") ||
    `attachment; filename="guardianx-vapt-${id}.pdf"`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
