import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/data-flow/honeypot, record a honeypot endpoint hit
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
