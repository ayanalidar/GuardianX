import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { hashPassword, createToken } from "@/lib/auth";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/signup
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, name, password } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
  }

  // Input validation
  if (typeof email !== "string" || email.length > 255 || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (typeof name !== "string" || name.length > 100 || name.length < 1) {
    return NextResponse.json({ error: "Name must be 1-100 characters" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Password too long" }, { status: 400 });
  }

  try {
    // Probe table existence
    const { data: probe, error: probeErr } = await supabase
      .from("User")
      .select("id")
      .limit(1);

    if (probeErr) {
      const msg = probeErr.message || "";
      if (msg.includes("Could not find the table") || msg.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "Database not initialized. Run the SQL migration.",
            code: "DB_NOT_INITIALIZED",
          },
          { status: 503 }
        );
      }
      throw new Error(msg);
    }

    // First user becomes admin (auto-approved). All others need admin approval.
    const isFirstUser = (!probe || probe.length === 0);
    const role = isFirstUser ? "admin" : "viewer";
    const approved = isFirstUser; // First user (admin) is auto-approved, others need approval

    // Check if email exists
    const { data: existing } = await supabase
      .from("User")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Hash password with bcrypt (12 rounds)
    const hashedPassword = await hashPassword(password);
    const id = randomUUID();

    // Insert user
    const { data: user, error } = await supabase
      .from("User")
      .insert({
        id,
        email,
        name,
        password: hashedPassword,
        role,
        approved,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // If not approved (not first user), don't issue a token — they need admin approval
    if (!approved) {
      return NextResponse.json(
        {
          user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: false },
          token: null,
          message: "Account created! An administrator must approve your access before you can log in. Contact hello@guardianx.in for expedited approval.",
          needsApproval: true,
        },
        { status: 201 }
      );
    }

    // First user (admin) — issue token immediately
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: true },
        token,
        message: "Admin account created successfully",
      },
      { status: 201 }
    );

    // Set HTTP-only cookie
    response.cookies.set("guardianx-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}
