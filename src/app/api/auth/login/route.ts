import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/auth/login — authenticate user
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify password
    const { createHash, randomBytes } = await import("node:crypto");
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
    const msg = err instanceof Error ? err.message : "Database error — tables may not be initialized. Run: npx prisma db push";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
