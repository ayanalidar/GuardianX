import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/orgs — list organizations + members
export async function GET() {
  const orgs = await db.organization.findMany({ include: { members: true } });
  return NextResponse.json(orgs.map(o => ({
    id: o.id, name: o.name, slug: o.slug,
    members: o.members.map(m => ({ id: m.id, email: m.email, role: m.role, joinedAt: m.joinedAt?.toISOString() })),
    memberCount: o.members.length,
  })));
}

// POST /api/orgs — create organization
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, slug } = body;
  if (!name || !slug) return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  const org = await db.organization.create({ data: { name, slug } });
  return NextResponse.json({ id: org.id, name: org.name, slug: org.slug }, { status: 201 });
}

// PATCH /api/orgs — invite member
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { orgId, email, role } = body;
  if (!orgId || !email) return NextResponse.json({ error: "orgId and email required" }, { status: 400 });
  const member = await db.teamMember.create({ data: { orgId, email, role: role || "viewer" } });
  return NextResponse.json({ id: member.id, message: "Member invited" }, { status: 201 });
}
