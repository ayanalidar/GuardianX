import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/auth/logout, clear session
export async function POST() {
  return NextResponse.json({ ok: true, message: "Logged out" });
}
