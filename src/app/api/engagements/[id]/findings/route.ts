import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/engagements/[id]/findings, all findings for an engagement.
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const findings = await db.finding.findMany({
    where: { engagementId: id },
    orderBy: { severity: "asc" as const, createdAt: "desc" as const },
  });
  return NextResponse.json(
    findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category,
      owasp: f.owasp,
      endpoint: f.endpoint,
      method: f.method,
      description: f.description,
      proof_request: f.proofRequest,
      proof_response: f.proofResponse,
      payload: f.payload,
      confidence: f.confidence,
      remediation: f.remediation,
      created_at: (f.createdAt as Date).toISOString(),
    }))
  );
}
