import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/client-portal-auth — client portal login (separate from admin login)
// Clients use their email + a portal access code to see only their data
// Body: { email: string, portalCode: string }

export async function POST(req: Request) {
  const { email, portalCode } = await req.json().catch(() => ({}));

  if (!email || !portalCode) {
    return NextResponse.json({ error: "email and portalCode required" }, { status: 400 });
  }

  try {
    // Find client by contact email
    const clients = await db.client.findMany({
      select: { id: true, name: true, contactEmail: true, description: true, frameworks: true, status: true, authorized: true, targetUrl: true },
    });

    const client = clients.find((c: Record<string, unknown>) => (c.contactEmail as string)?.toLowerCase() === email.toLowerCase());

    if (!client) {
      return NextResponse.json({ error: "No client found with this email" }, { status: 404 });
    }

    // For now, portal code = client ID prefix (first 8 chars)
    // In production, this would be a proper hashed code stored on the client
    const expectedCode = (client as Record<string, unknown>).id as string;
    if (portalCode !== expectedCode && portalCode !== expectedCode.slice(0, 8)) {
      return NextResponse.json({ error: "Invalid portal access code" }, { status: 401 });
    }

    // Create a limited-scope JWT (role: "client", clientId embedded).
    // Clients are pre-approved by virtue of holding a valid portal code.
    const token = createToken({
      userId: (client as Record<string, unknown>).id as string,
      email,
      name: (client as Record<string, unknown>).name as string,
      role: "client",
      approved: true,
    });

    return NextResponse.json({
      token,
      client: {
        id: (client as Record<string, unknown>).id,
        name: (client as Record<string, unknown>).name,
        description: (client as Record<string, unknown>).description,
        frameworks: (client as Record<string, unknown>).frameworks ? ((client as Record<string, unknown>).frameworks as string).split(",") : [],
        status: (client as Record<string, unknown>).status,
      },
      message: "Portal access granted. You can view your security posture.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
