// Honeypot route — fake admin panel
// ----------------------------------
// This endpoint pretends to be an admin panel. If an attacker hits it,
// their IP + user agent + payload are logged as a HoneypotHit.
// The response returns FAKE admin data (not real user data) so the
// attacker thinks they succeeded + doesn't try harder.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await logHoneypotHit(req, "/api/admin/_internal", "critical");

  return NextResponse.json({
    admin: true,
    users: [
      { id: "fake-001", email: "admin@fake-target.com", role: "admin" },
      { id: "fake-002", email: "user@fake-target.com", role: "user" },
    ],
    settings: {
      maintenanceMode: false,
      debugMode: true, // tempting for the attacker
      allowRegistration: true,
    },
    _warning: "THIS IS A GUARDIANX HONEYPOT. Your access has been logged.",
  });
}

export async function POST(req: Request) {
  const body = await req.text().catch(() => "");
  await logHoneypotHit(req, "/api/admin/_internal", "critical", body);

  return NextResponse.json({
    ok: true,
    message: "Settings updated. (This is a GuardianX honeypot — your access has been logged.)",
  });
}

async function logHoneypotHit(req: Request, endpoint: string, severity: string, payload = "") {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    await db.honeypotHit.create({
      data: {
        endpoint,
        ipAddress: String(ip).slice(0, 100),
        userAgent: String(ua).slice(0, 500),
        method: req.method,
        payload: String(payload).slice(0, 2000),
        severity,
        targetId: null,
      },
    });

    // Also create an audit log entry
    await db.auditLog.create({
      data: {
        actor: String(ip).slice(0, 100),
        action: "honeypot_hit",
        entity: endpoint,
        entityId: null,
        details: `Honeypot hit on ${endpoint} from ${String(ip).slice(0, 50)}`,
        timestamp: new Date(),
      },
    }).catch(() => {});
  } catch {
    // DB may not be available — honeypot still returns fake data
  }
}
