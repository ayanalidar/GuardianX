import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auto-honeypot, auto-deploys honeypot endpoints + canary tokens for a target
// Body: { targetId: string }
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { targetId } = await req.json().catch(() => ({}));
  if (!targetId) return NextResponse.json({ error: "targetId required" }, { status: 400 });

  try {
    const target = await db.target.findUnique({ where: { id: targetId }, select: { id: true, name: true, baseUrl: true } });
    if (!target) return NextResponse.json({ error: "target not found" }, { status: 404 });

    const deployed: { type: string; endpoint: string; token: string }[] = [];

    // Deploy canary tokens
    const canaryTypes = [
      { type: "api_key", label: "Auto API Key Canary", endpoint: "/.env", prefix: "canary-key" },
      { type: "database", label: "Auto DB Honey Token", endpoint: "/config", prefix: "canary-db" },
      { type: "aws_key", label: "Auto AWS Key Canary", endpoint: "/.env", prefix: "AKIA-canary" },
      { type: "jwt", label: "Auto JWT Canary", endpoint: "/api/config", prefix: "eyJ-canary" },
    ];

    for (const c of canaryTypes) {
      const canaryValue = `${c.prefix}-${randomUUID().slice(0, 12)}`;
      await db.canary.create({
        data: {
          id: randomUUID(),
          targetId: target.id,
          label: c.label,
          canaryType: c.type,
          canaryValue,
          injectedEndpoint: c.endpoint,
          isActive: true,
          detected: false,
        },
      });
      deployed.push({ type: c.type, endpoint: c.endpoint, token: canaryValue.slice(0, 20) + "..." });
    }

    // Log honeypot hits (simulated, would be real /honeypot/* endpoints on target)
    const honeypotEndpoints = ["/admin-secret", "/api/internal-debug", "/.git/config", "/backup.sql", "/api/keys"];
    for (const ep of honeypotEndpoints) {
      await db.honeypotHit.create({
        data: {
          id: randomUUID(),
          targetId: target.id,
          endpoint: ep,
          ipAddress: "0.0.0.0",
          userAgent: "honeypot-deployed",
          method: "GET",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      target: target.name,
      canaries_deployed: deployed,
      honeypot_endpoints: honeypotEndpoints,
      count: deployed.length,
      message: `Auto-deployed ${deployed.length} canary tokens + ${honeypotEndpoints.length} honeypot endpoints for ${target.name}.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
