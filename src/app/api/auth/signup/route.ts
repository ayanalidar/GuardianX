import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/signup
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, name, password } = body;

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "email, name, and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  try {
    // Probe table existence with a regular select (head:true doesn't surface
    // the "table missing" error from PostgREST, so we use select + limit 1).
    const { data: probe, error: probeErr } = await supabase
      .from("User")
      .select("id")
      .limit(1);

    // Special-case: table doesn't exist yet → actionable error
    if (probeErr) {
      const msg = probeErr.message || "";
      if (
        msg.includes("Could not find the table") ||
        msg.includes("does not exist") ||
        msg.includes("schema cache")
      ) {
        return NextResponse.json(
          {
            error:
              "Database not initialized. Please run /supabase/migrations/0001_init.sql in your Supabase SQL Editor, then POST /api/db-init.",
            code: "DB_NOT_INITIALIZED",
            steps: [
              "1. Supabase Dashboard → SQL Editor → New Query",
              "2. Paste contents of supabase/migrations/0001_init.sql",
              "3. Click Run",
              "4. POST /api/db-init to seed demo data",
              "5. Then sign up / log in",
            ],
          },
          { status: 503 }
        );
      }
      throw new Error(msg);
    }

    // First user becomes admin; subsequent signups are viewers.
    const role = (!probe || probe.length === 0) ? "admin" : "viewer";

    // Check if email exists
    const { data: existing } = await supabase
      .from("User")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    // Hash password (salt:hash)
    const salt = randomBytes(16).toString("hex");
    const hashedPassword = createHash("sha256")
      .update(salt + password)
      .digest("hex");
    const id = randomUUID();

    // Insert user
    const { data: user, error } = await supabase
      .from("User")
      .insert({
        id,
        email,
        name,
        password: `${salt}:${hashedPassword}`,
        role,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const token = randomBytes(32).toString("hex");

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
        message: "Account created successfully",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}
