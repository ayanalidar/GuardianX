import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/users — list all users (ADMIN ONLY).
// Returns emails + approval status, so this must be admin-gated.
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { data, error } = await supabase
      .from("User")
      .select('id, email, name, role, approved, "createdAt"')
      .order("createdAt", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json((data || []).map((u: Record<string, unknown>) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      approved: u.approved === true,
      created_at: u.createdAt,
    })));
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/users — admin creates a new user (ADMIN ONLY).
// SECURITY FIX: previously this endpoint was NOT admin-gated, used weak
// SHA-256 hashing, and auto-set approved=true — letting any authenticated
// user mint pre-approved admin accounts. Now it:
//   1. Requires admin (requireAdmin also enforces approved=true).
//   2. Uses bcrypt (12 rounds) via hashPassword.
//   3. Defaults new users to approved=false so the admin must explicitly
//      approve them via /api/users/[id]/approve (unless `approve: true`
//      is passed in the body for same-instant provisioning).
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { email, name, role, password, approve } = body;
  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name, password required" }, { status: 400 });
  }

  // Input validation
  if (typeof email !== "string" || email.length > 255 || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (typeof name !== "string" || name.length < 1 || name.length > 100) {
    return NextResponse.json({ error: "Name must be 1-100 characters" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 8-128 characters" }, { status: 400 });
  }

  const { randomUUID } = await import("node:crypto");
  const validRoles = ["admin", "analyst", "viewer"];
  const userRole = validRoles.includes(role) ? role : "viewer";

  // bcrypt hash (12 rounds) — replaces the old weak SHA-256+salt scheme
  const hashedPassword = await hashPassword(password);

  const { data, error } = await supabase
    .from("User")
    .insert({
      id: randomUUID(),
      email,
      name,
      password: hashedPassword,
      role: userRole,
      // Default: NOT approved. Admin can pass `approve: true` to provision
      // an immediately-active account, or approve later via the approve API.
      approved: approve === true,
    })
    .select("id, email, name, role, approved")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    {
      ...data,
      message: approve === true
        ? "User created and approved — they can log in now."
        : "User created (pending approval). Approve them from User Management.",
    },
    { status: 201 }
  );
}

// PATCH /api/users?id=xxx — update role (ADMIN ONLY)
export async function PATCH(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const body = await req.json().catch(() => ({}));
  if (!id || !body.role) {
    return NextResponse.json({ error: "id and role required" }, { status: 400 });
  }

  const validRoles = ["admin", "analyst", "viewer"];
  const userRole = validRoles.includes(body.role) ? body.role : "viewer";

  const { data, error } = await supabase
    .from("User")
    .update({ role: userRole })
    .eq("id", id)
    .select("id, role")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, message: "Role updated" });
}

// DELETE /api/users?id=xxx — remove user (ADMIN ONLY)
export async function DELETE(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Prevent admin from deleting themselves (avoid lockout)
  const self = JSON.parse(req.headers.get("x-user-id") || '""');
  if (id === self) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  await supabase.from("User").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
