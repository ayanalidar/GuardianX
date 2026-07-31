import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/users
export async function GET() {
  try {
    const { data, error } = await supabase.from("User").select("id, email, name, role, createdAt").order("createdAt", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json((data || []).map((u: Record<string, unknown>) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.createdAt,
    })));
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/users
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, name, role, password } = body;
  if (!email || !name || !password) return NextResponse.json({ error: "email, name, password required" }, { status: 400 });

  const { createHash, randomBytes, randomUUID } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hashedPassword = createHash("sha256").update(salt + password).digest("hex");
  const validRoles = ["admin", "analyst", "viewer"];
  const userRole = validRoles.includes(role) ? role : "viewer";

  const { data, error } = await supabase.from("User").insert({
    id: randomUUID(), email, name, password: `${salt}:${hashedPassword}`, role: userRole,
  }).select("id, email, name, role").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, message: "User created" }, { status: 201 });
}

// PATCH /api/users?id=xxx
export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const body = await req.json().catch(() => ({}));
  if (!id || !body.role) return NextResponse.json({ error: "id and role required" }, { status: 400 });

  const { data, error } = await supabase.from("User").update({ role: body.role }).eq("id", id).select("id, role").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, message: "Role updated" });
}

// DELETE /api/users?id=xxx
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await supabase.from("User").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
