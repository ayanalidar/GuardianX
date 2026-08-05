import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Canary values injected into the vuln-target
const CANARY_DATA = [
  { canaryType: "email", canaryValue: "canary_user_001@guardianx-trap.in", label: "Canary User 001 Email", injectedEndpoint: "/api/user/901" },
  { canaryType: "email", canaryValue: "canary_user_002@guardianx-trap.in", label: "Canary User 002 Email", injectedEndpoint: "/api/user/902" },
  { canaryType: "email", canaryValue: "canary_user_003@guardianx-trap.in", label: "Canary User 003 Email", injectedEndpoint: "/api/user/903" },
  { canaryType: "api_key", canaryValue: "gx_canary_sk_test_4f8a9b2c1d7e3f6a", label: "Canary API Key (in .env)", injectedEndpoint: "/.env" },
  { canaryType: "user", canaryValue: "canary_user_001", label: "Canary Username", injectedEndpoint: "/api/user/901" },
];

// GET /api/canaries, list all canary records + their detection status
export async function GET() {
  // Sync canary records with the known canary data
  for (const c of CANARY_DATA) {
    const existing = await db.canary.findFirst({ where: { canaryValue: c.canaryValue } });
    if (!existing) {
      await db.canary.create({ data: c });
    }
  }

  const canaries = await db.canary.findMany({
    orderBy: { createdAt: "desc" },
  });

  const detected = canaries.filter((c) => c.detected);
  const active = canaries.filter((c) => c.isActive && !c.detected);

  return NextResponse.json({
    total_canaries: canaries.length,
    active_canaries: active.length,
    detected_canaries: detected.length,
    canaries: canaries.map((c) => ({
      id: c.id,
      label: c.label,
      canary_type: c.canaryType,
      canary_value: c.canaryValue,
      injected_endpoint: c.injectedEndpoint,
      is_active: c.isActive,
      detected: c.detected,
      detected_at: (c.detectedAt as Date | null)?.toISOString() ?? null,
      detected_on: c.detectedOn,
      created_at: (c.createdAt as Date).toISOString(),
    })),
  });
}

// POST /api/canaries, manually add a new canary
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label : "Custom Canary";
  const canaryType = typeof body.canaryType === "string" ? body.canaryType : "custom";
  const canaryValue = typeof body.canaryValue === "string" ? body.canaryValue : "";
  const injectedEndpoint = typeof body.injectedEndpoint === "string" ? body.injectedEndpoint : "/";

  if (!canaryValue) return NextResponse.json({ error: "canaryValue required" }, { status: 400 });

  const c = await db.canary.create({
    data: { label, canaryType, canaryValue, injectedEndpoint },
  });

  return NextResponse.json({ id: c.id, message: "Canary added. Place this value in your API responses to detect scraping." }, { status: 201 });
}
