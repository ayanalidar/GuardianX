// POST /api/support/ticket — create a support ticket from the in-app chat.
//
// Backs the floating SupportChat widget. The widget sends a `subject` (a short
// label auto-derived from the first 60 chars of the message) and the full
// `message`. We attach the caller's userId / email / name + an `isAdmin` flag
// + `priority: "admin"` when the caller is an admin, so the triage queue can
// surface admin-submitted tickets with the "Admin priority" badge.
//
// Auth: required (the chat is in-app, so the user is always logged in). The
// route uses `requireAuth`, which also enforces the `approved` flag.
//
// Response: 201 with the created ticket's id + a friendly acknowledgement
// message that the chat panel surfaces as the assistant's reply.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/support/ticket
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const messageRaw = typeof body.message === "string" ? body.message : "";
    const subjectRaw = typeof body.subject === "string" ? body.subject : "";

    const message = sanitizeText(messageRaw, 8000);
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Subject defaults to the first 60 chars of the message if not provided.
    const subject = sanitizeText(subjectRaw, 200) || message.slice(0, 60);

    const isAdmin = auth.user.role === "admin";

    const ticket = (await db.supportTicket.create({
      data: {
        userId: auth.user.userId,
        userEmail: auth.user.email,
        userName: auth.user.name,
        subject,
        message,
        status: "open",
        priority: isAdmin ? "admin" : "normal",
        isAdmin,
      },
    })) as Record<string, unknown>;

    // Audit trail entry — never log the full message body (it may contain
    // sensitive details the user shared with support); just the id + subject.
    await auditLog(
      "support_ticket.created",
      "SupportTicket",
      auth.user.email,
      {
        ticketId: ticket.id,
        subject,
        priority: isAdmin ? "admin" : "normal",
      }
    );

    return NextResponse.json(
      {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        created_at: (ticket.createdAt as Date).toISOString(),
        message:
          "Thanks for reaching out — your message is ticket #" +
          String(ticket.id).slice(-6).toUpperCase() +
          ". We typically respond within 24 hours. For urgent issues, email hello@guardianx.in.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create ticket",
      },
      { status: 500 }
    );
  }
}
