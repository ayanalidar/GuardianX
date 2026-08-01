import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/report-branding?clientId=xxx — get branding config
// POST /api/report-branding — save branding config
// Body: { clientId, logoUrl, accentColor, companyName, reportTitle }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  try {
    const client = await db.client.findUnique({
      where: clientId ? { id: clientId } : { id: "none" },
      select: { id: true, name: true },
    });

    // For now, branding is stored in the Integration table
    const integrations = await db.integration.findMany({
      where: { type: "report-branding" },
      select: { id: true, config: true, createdAt: true },
    });

    return NextResponse.json({
      branding: integrations.map((i: Record<string, unknown>) => ({
        id: i.id,
        config: i.config ? JSON.parse(i.config as string) : {},
        created_at: (i.createdAt as Date).toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ branding: [] });
  }
}

export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { clientId, logoUrl, accentColor, companyName, reportTitle, footerText } = body;

  try {
    const { randomUUID } = await import("node:crypto");
    const config = JSON.stringify({
      clientId: clientId || null,
      logoUrl: logoUrl || "",
      accentColor: accentColor || "#10b981",
      companyName: companyName || "GuardianX",
      reportTitle: reportTitle || "VAPT Report",
      footerText: footerText || "Confidential — GuardianX Autonomous Security Operations Platform",
    });

    const integration = await db.integration.create({
      data: {
        id: randomUUID(),
        type: "report-branding",
        config,
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      id: integration.id,
      message: "Report branding saved. Future VAPT PDFs will use this branding.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
