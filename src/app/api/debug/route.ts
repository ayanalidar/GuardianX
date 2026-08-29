// Honeypot route — fake debug endpoint
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await logHit(req, "/api/debug", "high");
  return NextResponse.json({
    debug: true,
    environment: "production",
    version: "1.0.0-honeypot",
    stackTrace: "Error: This is a GuardianX honeypot. Your access has been logged.",
    internalPaths: ["/api/admin/_internal", "/api/.env", "/api/backup"],
  });
}

async function logHit(req: Request, endpoint: string, severity: string) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await db.honeypotHit.create({
      data: {
        endpoint,
        ipAddress: String(ip).slice(0, 100),
        userAgent: String(ua).slice(0, 500),
        method: "GET",
        payload: "",
        severity,
        targetId: null,
      },
    });
    await db.auditLog.create({
      data: {
        actor: String(ip).slice(0, 100),
        action: "honeypot_hit",
        entity: endpoint,
        entityId: null,
        details: `Debug honeypot hit from ${String(ip).slice(0, 50)}`,
        timestamp: new Date(),
      },
    }).catch(() => {});
  } catch {}
}
