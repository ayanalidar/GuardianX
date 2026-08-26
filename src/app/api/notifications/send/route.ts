import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, isSmtpConfigured } from "@/lib/email";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/notifications/send
// Manually send an email notification to any address.
// Body: { to: string, subject: string, message: string, clientId?: string }
//
// - Always attempts to send via SMTP (or dev-log if SMTP not configured).
// - If clientId is provided, an AuditLog entry is recorded so the action
//   shows up in the client's audit trail.
// - Requires an authenticated GuardianX session (any role).

interface SendBody {
  to?: string;
  subject?: string;
  message?: string;
  clientId?: string;
}

export async function POST(req: Request) {
  // Auth: any signed-in user can send a manual notification.
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, subject, message, clientId } = body;

  if (!to || !subject || !message) {
    return NextResponse.json(
      { error: "to, subject, and message are required" },
      { status: 400 }
    );
  }

  // Basic email format sanity check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: "Invalid recipient email address" },
      { status: 400 }
    );
  }

  // If clientId is provided, verify it exists so we never write a dangling audit log.
  let clientName: string | undefined;
  if (clientId) {
    try {
      const client = await db.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      if (!client) {
        return NextResponse.json(
          { error: "Client not found for the provided clientId" },
          { status: 404 }
        );
      }
      clientName = (client as Record<string, unknown>).name as string;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to verify client" },
        { status: 500 }
      );
    }
  }

  // Build a clean HTML email from the plain-text message.
  const html = buildNotificationHtml({
    subject,
    message,
    clientName,
    actorName: user.name,
    actorEmail: user.email,
  });

  const smtpOn = await isSmtpConfigured();
  let sent: boolean;
  try {
    sent = await sendEmail(to, subject, html, "notification");
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Email send failed",
        sent: false,
      },
      { status: 500 }
    );
  }

  // Always record an audit log entry when a clientId is provided,
  // regardless of whether SMTP delivery succeeded. A failed send is
  // itself a security-relevant event.
  if (clientId) {
    try {
      await db.auditLog.create({
        data: {
          action: sent ? "notification.sent" : "notification.send_failed",
          entity: "client",
          actor: user.email,
          details: JSON.stringify({
            clientId,
            clientName: clientName || null,
            to,
            subject,
            messagePreview: message.slice(0, 200),
            smtpConfigured: smtpOn,
            deliveryMode: smtpOn ? "smtp" : "dev-log",
            sent,
          }),
        },
      });
    } catch (err) {
      // Audit log failure must not mask the email result.
      console.error("[notifications/send] audit log failed:", err instanceof Error ? err.message : err);
    }
  }

  if (!sent) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: "Email delivery failed. Check SMTP configuration and server logs.",
        smtp_configured: smtpOn,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    to,
    subject,
    smtp_configured: smtpOn,
    delivery_mode: smtpOn ? "smtp" : "dev-log",
    audit_logged: !!clientId,
    timestamp: new Date().toISOString(),
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildNotificationHtml(opts: {
  subject: string;
  message: string;
  clientName?: string;
  actorName: string;
  actorEmail: string;
}): string {
  const messageHtml = esc(opts.message).replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(opts.subject)}</title></head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);">
      <div style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 20px 28px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #10b981; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 14px;">G</div>
          <div>
            <div style="color: #ffffff; font-size: 16px; font-weight: 700;">Guardian<span style="color: #6ee7b7;">X</span></div>
            <div style="color: #a7f3d0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;">Security Notification</div>
          </div>
        </div>
      </div>
      <div style="padding: 24px 28px;">
        <h1 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 700;">${esc(opts.subject)}</h1>
        <div style="font-size: 14px; line-height: 1.6; color: #1e293b;">${messageHtml}</div>
        ${opts.clientName ? `<div style="margin-top: 20px; padding: 12px 16px; background: #f1f5f9; border-radius: 8px; font-size: 12px; color: #475569;">Related client: <strong>${esc(opts.clientName)}</strong></div>` : ""}
      </div>
      <div style="padding: 14px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 11px; color: #94a3b8;">
          Sent by ${esc(opts.actorName)} (${esc(opts.actorEmail)}) via GuardianX. This is an automated security notification.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
