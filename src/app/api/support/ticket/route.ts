import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/support/ticket — list the caller's own tickets (newest first)
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  try {
    const tickets = await db.supportTicket.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return NextResponse.json({
      tickets: tickets.map((t: Record<string, unknown>) => ({
        id: t.id,
        subject: t.subject,
        message: t.message,
        priority: t.priority,
        status: t.status,
        reply: t.reply ?? null,
        createdAt: (t.createdAt as Date).toISOString(),
        updatedAt: (t.updatedAt as Date).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tickets" },
      { status: 500 }
    );
  }
}

// POST /api/support/ticket — file a new ticket from the floating chat widget
// Body: { subject, message, priority? }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { subject, message, priority } = body;

  if (!message || typeof message !== "string" || message.trim().length < 3) {
    return NextResponse.json({ error: "Message must be at least 3 characters." }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long (max 4000 chars)." }, { status: 400 });
  }

  const validPriorities = ["low", "normal", "high", "urgent"];
  const finalPriority = validPriorities.includes(priority)
    ? priority
    : user.role === "admin"
      ? "high"
      : "normal";

  try {
    const ticket = await db.supportTicket.create({
      data: {
        userId: user.userId,
        subject: (subject || "Support request").toString().slice(0, 120),
        message: message.trim(),
        priority: finalPriority,
        status: "open",
      },
    });
    return NextResponse.json(
      {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        message: "Your ticket has been logged. We typically respond within 24 hours.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to file ticket" },
      { status: 500 }
    );
  }
}
