import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

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

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  // Hash password (SHA-256 with salt — simple for demo; use bcrypt in production)
  const salt = randomBytes(16).toString("hex");
  const hashedPassword = createHash("sha256").update(salt + password).digest("hex");

  const user = await db.user.create({
    data: { email, name, password: `${salt}:${hashedPassword}`, role: "admin" }, // First user is admin
  });

  // Generate a session token
  const token = randomBytes(32).toString("hex");

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
    message: "Account created successfully",
  }, { status: 201 });
}
