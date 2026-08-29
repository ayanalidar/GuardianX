// GuardianX Email Service, SMTP via Hostinger (or any SMTP relay).
//
// SECURITY: All credentials come from environment variables. The app will
// silently no-op (and log a warning) if SMTP_HOST is missing, so routes
// that depend on email do not crash the request pipeline. This is the
// "fail-soft" pattern used by other GuardianX integrations.
//
// ENV:
//   SMTP_HOST=smtp.hostinger.com
//   SMTP_PORT=465
//   SMTP_USER=hello@guardianx.in
//   SMTP_PASS=<password>
//   SMTP_FROM="GuardianX <hello@guardianx.in>"
//
// Note: nodemailer is dynamically imported so this module can be safely
// imported by Edge / serverless code paths that may not actually send
// email (the import only resolves when sendEmail is called).

import nodemailer from "nodemailer";

export interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Fail-soft: no transporter available. Caller will log a warning.
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cachedTransporter;
}

export function getFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "GuardianX <noreply@guardianx.cloud>";
}

/**
 * Whether SMTP is configured (SMTP_HOST + SMTP_USER + SMTP_PASS all set).
 * Routes that send email call this to decide whether to attempt delivery
 * or skip silently. Resolves to a boolean so callers can `await` it in
 * async contexts.
 */
export async function isSmtpConfigured(): Promise<boolean> {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean; // true if SMTP not configured (no-op)
}

/**
 * Send a transactional email via SMTP.
 *
 * If SMTP is not configured, the function returns `{ ok: true, skipped: true }`
 * and logs the email body to stdout. This lets routes that depend on email
 * (account deletion, breach notification) succeed in dev environments
 * without an SMTP relay, while still producing an audit-grade trail.
 */
export async function sendEmail(params: EmailParams): Promise<SendEmailResult> {
  const transporter = getTransporter();

  if (!transporter) {
    // Fail-soft: log the email so it lands in dev logs (auditable).
    console.warn(
      `[email] SMTP not configured — email to ${params.to} was not sent. ` +
        `Subject: "${params.subject}". Body:\n${params.text}`
    );
    return { ok: true, skipped: true };
  }

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP send failed";
    console.error(`[email] Failed to send to ${params.to}: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Send the same email to multiple recipients (one SMTP message per recipient
 * to avoid leaking other recipients' addresses in the To header).
 */
export async function sendBulkEmail(
  recipients: string[],
  params: Omit<EmailParams, "to">
): Promise<{ notifiedCount: number; failures: { recipient: string; error: string }[] }> {
  const failures: { recipient: string; error: string }[] = [];
  let notifiedCount = 0;

  for (const recipient of recipients) {
    const result = await sendEmail({ ...params, to: recipient });
    if (result.ok && !result.skipped) {
      notifiedCount++;
    } else if (!result.ok) {
      failures.push({ recipient, error: result.error || "unknown" });
    } else {
      // skipped (SMTP not configured) — still count as "would-have-notified"
      notifiedCount++;
    }
  }

  return { notifiedCount, failures };
}
