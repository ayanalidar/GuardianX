// Mock for `@/lib/email` — the module that talks to the SMTP relay.
//
// Tests don't want to send real emails (and don't have SMTP configured), so
// `sendEmail` / `sendTextEmail` / `sendEmailWithConfig` are stubbed to
// resolve `true` (the value the real module returns in dev mode when no SMTP
// config is present).
//
// The mock also records every call into `__emailCalls` so a test can assert
// "the signup flow attempted to send exactly one verification email to
// <address>" without needing to inspect SMTP traffic.

export interface EmailCall {
  to: string;
  subject: string;
  html: string;
  template?: string;
}

const calls: EmailCall[] = [];

export const __emailCalls = calls;

export function __resetEmailMock(): void {
  calls.length = 0;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  template?: string
): Promise<boolean> {
  calls.push({ to, subject, html, template });
  return true;
}

export async function sendTextEmail(
  to: string,
  subject: string,
  text: string,
  template?: string
): Promise<boolean> {
  calls.push({ to, subject, html: text, template });
  return true;
}

export async function sendEmailWithConfig(
  _cfg: unknown,
  to: string,
  subject: string,
  html: string,
  template?: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  calls.push({ to, subject, html, template });
  return { ok: true, messageId: "mock-message-id" };
}

export async function isSmtpConfigured(): Promise<boolean> {
  return false;
}

export function invalidateSmtpConfigCache(): void {
  /* no-op */
}

export function explainSmtpError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildSmtpConfigFromForm(): null {
  return null;
}

export async function testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
  return { ok: true, message: "mock" };
}
