import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/auth/session — check if user is logged in (via token in header)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  // In a real app, we'd verify a JWT or lookup a session table.
  // For this demo, the token is opaque — the client stores the user object.
  // We return the user from the x-user-id header if present.
  const userId = req.headers.get("x-user-id");
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true } });
    if (user) {
      return NextResponse.json({ authenticated: true, user });
    }
  }

  return NextResponse.json({ authenticated: false });
}
