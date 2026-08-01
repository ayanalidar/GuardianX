import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/data-flow/log, record an API access (called by the vuln-target)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ipAddress = typeof body.ipAddress === "string" ? body.ipAddress : "unknown";
  const method = typeof body.method === "string" ? body.method : "GET";
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "/";
  const statusCode = typeof body.statusCode === "number" ? body.statusCode : 200;
  const userAgent = typeof body.userAgent === "string" ? body.userAgent : "unknown";
  const responseSize = typeof body.responseSize === "number" ? body.responseSize : 0;

  await db.apiAccessLog.create({
    data: { ipAddress, method, endpoint, statusCode, userAgent, responseSize },
  });

  return NextResponse.json({ ok: true });
}
