import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/targets, list all targets.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const targets = await db.target.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { engagements: true } } },
  });
  return NextResponse.json(
    targets.map((t) => ({
      id: t.id,
      name: t.name,
      base_url: t.baseUrl,
      auth_header_set: !!t.authHeader,
      notes: t.notes,
      authorized: t.authorized,
      created_at: t.createdAt.toISOString(),
      engagement_count: t._count.engagements,
    }))
  );
}

// POST /api/targets, add a target. MUST set authorized=true explicitly.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const authHeader =
    typeof body.authHeader === "string" && body.authHeader.trim()
      ? body.authHeader.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const authorized = Boolean(body.authorized);
  const clientId = typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : null;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!baseUrl)
    return NextResponse.json({ error: "baseUrl required" }, { status: 400 });

  // basic URL validation
  try {
    new URL(baseUrl);
  } catch {
    return NextResponse.json({ error: "baseUrl must be a valid URL" }, { status: 400 });
  }

  const t = await db.target.create({
    data: { name, baseUrl, authHeader, notes, authorized, clientId },
  });

  return NextResponse.json(
    {
      id: t.id,
      name: t.name,
      base_url: t.baseUrl,
      authorized: t.authorized,
      created_at: t.createdAt.toISOString(),
      message: authorized
        ? "Target added and authorized for testing."
        : "Target added but NOT authorized. Set authorized=true before running an engagement.",
    },
    { status: 201 }
  );
}
