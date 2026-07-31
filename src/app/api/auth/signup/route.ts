import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/auth/signup — register a new user
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
    // Check if any users exist — if not, this is the first signup (admin)
    const userCount = await db.user.count().catch(() => 0);
    const role = userCount === 0 ? "admin" : "viewer";

    const existing = await db.user.findUnique({ where: { email } }).catch(() => null);
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Hash password
    const { createHash, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const hashedPassword = createHash("sha256").update(salt + password).digest("hex");

    const user = await db.user.create({
      data: { email, name, password: `${salt}:${hashedPassword}`, role },
    });

    const token = randomBytes(32).toString("hex");

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      message: "Account created successfully",
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error — tables may not be initialized. Run: npx prisma db push";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
