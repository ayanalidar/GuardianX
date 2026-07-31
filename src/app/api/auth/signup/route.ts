import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/signup
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, name, password } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  try {
    // Check if any users exist (first user = admin)
    const { count } = await supabase.from("User").select("*", { count: "exact", head: true });
    const role = (count || 0) === 0 ? "admin" : "viewer";

    // Check if email exists
    const { data: existing } = await supabase.from("User").select("*").eq("email", email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Hash password
    const salt = randomBytes(16).toString("hex");
    const hashedPassword = createHash("sha256").update(salt + password).digest("hex");
    const id = randomUUID();

    // Insert user
    const { data: user, error } = await supabase.from("User").insert({
      id,
      email,
      name,
      password: `${salt}:${hashedPassword}`,
      role,
    }).select().single();

    if (error) throw new Error(error.message);

    const token = randomBytes(32).toString("hex");

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      message: "Account created successfully",
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}
