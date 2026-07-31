import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/data-flow/honeypot — record a honeypot endpoint hit
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "unknown";
  const ipAddress = typeof body.ipAddress === "string" ? body.ipAddress : "unknown";
  const userAgent = typeof body.userAgent === "string" ? body.userAgent : "unknown";
  const method = typeof body.method === "string" ? body.method : "GET";

  await db.honeypotHit.create({
    data: { endpoint, ipAddress, userAgent, method },
  });

  return NextResponse.json({ ok: true, message: `Honeypot trap triggered at ${endpoint}` });
}
