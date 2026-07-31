import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/users — list all users (admin only)
export async function GET() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    created_at: u.createdAt.toISOString(),
  })));
}

// POST /api/users — invite a user (admin only)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, name, role, password } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
  }

  const validRoles = ["admin", "analyst", "viewer"];
  const userRole = validRoles.includes(role) ? role : "viewer";

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const { createHash, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hashedPassword = createHash("sha256").update(salt + password).digest("hex");

  const user = await db.user.create({
    data: { email, name, password: `${salt}:${hashedPassword}`, role: userRole },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    message: "User created successfully",
  }, { status: 201 });
}

// PATCH /api/users?id=xxx — update user role
export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const body = await req.json().catch(() => ({}));
  const { role } = body;

  if (!id || !role) {
    return NextResponse.json({ error: "id and role are required" }, { status: 400 });
  }

  const validRoles = ["admin", "analyst", "viewer"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const user = await db.user.update({ where: { id }, data: { role } });
  return NextResponse.json({ id: user.id, role: user.role, message: "Role updated" });
}

// DELETE /api/users?id=xxx
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.user.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
