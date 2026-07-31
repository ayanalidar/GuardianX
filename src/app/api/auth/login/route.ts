import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/auth/login
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 }
    );
  }

  try {
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    // Special-case: table doesn't exist yet → actionable error
    if (error) {
      const msg = error.message || "";
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

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password (salt:hash format)
    const [salt, storedHash] = (user.password as string).split(":");
    const hashedPassword = createHash("sha256")
      .update(salt + password)
      .digest("hex");
    if (hashedPassword !== storedHash) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = randomBytes(32).toString("hex");

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
      message: "Login successful",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}
