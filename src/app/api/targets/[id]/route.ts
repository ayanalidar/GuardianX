import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/targets/[id] — update (e.g. set authorized=true).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.authorized === "boolean") data.authorized = body.authorized;
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl.trim();
  if (typeof body.authHeader === "string") data.authHeader = body.authHeader.trim() || null;
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

  const t = await db.target.update({ where: { id }, data });
  return NextResponse.json({
    id: t.id,
    name: t.name,
    base_url: t.baseUrl,
    authorized: t.authorized,
  });
}

// DELETE /api/targets/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.target.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
