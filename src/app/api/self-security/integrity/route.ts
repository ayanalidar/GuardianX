// GET /api/self-security/integrity — admin-only, returns runtime integrity status
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verifyIntegrity, getBaselineInfo } from "@/lib/self-attest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const status = await verifyIntegrity();
  const baseline = getBaselineInfo();

  // Fetch recent incidents
  const incidents = await db.integrityIncident.findMany({
    orderBy: { detectedAt: "desc" },
    take: 10,
  }).catch(() => []);

  return NextResponse.json({
    ...status,
    baseline,
    incidents,
  });
}
