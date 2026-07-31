import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/login
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  try {
    const { data: user, error } = await supabase.from("User").select("*").eq("email", email).maybeSingle();
    if (error) throw new Error(error.message);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify password
    const [salt, storedHash] = user.password.split(":");
    const hashedPassword = createHash("sha256").update(salt + password).digest("hex");
    if (hashedPassword !== storedHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = randomBytes(32).toString("hex");

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      message: "Login successful",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}
