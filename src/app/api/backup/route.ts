// Honeypot route — fake backup download
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await logHit(req, "/api/backup", "critical");
  // Return fake DB dump (not real data)
  return new NextResponse(
    "-- GuardianX Database Backup (HONEYPOT)\n" +
    "-- Your access has been logged.\n\n" +
    "CREATE TABLE fake_users (\n" +
    "  id VARCHAR(36) PRIMARY KEY,\n" +
    "  email VARCHAR(255),\n" +
    "  password_hash VARCHAR(255)\n" +
    ");\n\n" +
    "INSERT INTO fake_users VALUES ('fake-001', 'admin@honeypot.com', 'fake-hash');\n",
    { headers: { "Content-Type": "application/sql", "Content-Disposition": "attachment; filename=backup.sql" } }
  );
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
        details: `Backup honeypot hit from ${String(ip).slice(0, 50)}`,
        timestamp: new Date(),
      },
    }).catch(() => {});
  } catch {}
}
