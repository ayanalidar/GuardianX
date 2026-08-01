import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { verifyPassword, createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/login
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  // Input validation — prevent injection
  if (typeof email !== "string" || email.length > 255) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length > 128) {
    return NextResponse.json({ error: "Invalid password" }, { status: 400 });
  }

  try {
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      const msg = error.message || "";
      if (msg.includes("Could not find the table") || msg.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "Database not initialized. Run the SQL migration in Supabase.",
            code: "DB_NOT_INITIALIZED",
          },
          { status: 503 }
        );
      }
      throw new Error(msg);
    }

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify password (supports both bcrypt and legacy SHA-256)
    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // FAIL-SAFE approval check: only explicitly-approved users may log in.
    // Using `!== true` (not `=== false`) so that NULL / undefined / missing
    // column all resolve to "not approved" instead of silently letting the
    // user through.
    if (user.approved !== true) {
      return NextResponse.json(
        {
          error: "Your account is pending admin approval. Please contact hello@guardianx.in to expedite access.",
          code: "PENDING_APPROVAL",
        },
        { status: 403 }
      );
    }

    // Create JWT token — embed `approved` so the Edge middleware can re-check
    // it on every request (defense in depth). This also means any token issued
    // BEFORE this flag existed is automatically rejected by the middleware,
    // forcibly logging out unapproved users who grabbed a token earlier.
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      approved: true,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      message: "Login successful",
    });

    // Set HTTP-only cookie for additional security
    response.cookies.set("guardianx-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
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
