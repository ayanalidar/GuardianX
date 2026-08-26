// GuardianX Webhook Dispatcher
//
// Fans a single security event out to every active WebhookConfig row whose
// `events` list (comma-separated) either contains the event type or includes
// the "*" wildcard. Each send is independent — one webhook failing does not
// block the others.
//
// Wire-up contract:
//   - Callers should fire-and-forget: `void dispatchSecurityEvent(...).catch(() => {})`
//     so a webhook failure never blocks the primary API response.
//   - The dispatcher itself NEVER throws — all errors are caught, logged to
//     stdout, and recorded in AuditLog (action: "webhook.dispatched" or
//     "webhook.failed").
//
// Wire format (what the receiver sees):
//   POST <webhook.url>
//   Headers:
//     Content-Type: application/json
//     X-GuardianX-Event: <event.type>
//     X-GuardianX-Signature: sha256=<hex hmac-sha256 of JSON.stringify(event)>
//   Body: { event, timestamp, signature }
//     - `event`    : the original SecurityEventPayload (type, severity, title, …)
//     - `timestamp`: ISO 8601 send time
//     - `signature`: hex HMAC-SHA256 of `JSON.stringify(event)` keyed by the
//                    webhook's `secret`. Empty string when no secret is set
//                    (receiver should skip verification in that case).
//
// The signature is computed over the *event payload alone* (not the wrapping
// body) so receivers can re-derive it deterministically regardless of JSON
// key ordering in the wrapper. This matches the existing Generic Webhook
// connector convention in src/lib/integrations/engine.ts.

import { hmacSha256hex, randomHex } from "@/lib/crypto";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

export interface SecurityEventPayload {
  /** Event type, e.g. "critical_finding", "incident_created", "canary_triggered", "patch_ready". */
  type: string;
  /** Severity: "info" | "low" | "medium" | "high" | "critical". */
  severity: string;
  /** Short human-readable title. */
  title: string;
  /** Longer description of what happened. */
  description: string;
  /** Optional client identifier the event relates to. */
  clientId?: string;
  /** Optional structured metadata (finding id, patch id, canary id, …). */
  metadata?: Record<string, unknown>;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Generate a fresh 32-byte HMAC secret (hex-encoded, 64 chars). Used when
 * a new WebhookConfig is created without an explicit secret.
 */
export function generateWebhookSecret(): string {
  return randomHex(32);
}

/**
 * Returns true if the comma-separated `eventsCsv` list either contains
 * the wildcard "*" or contains the exact `eventType`. Empty / null means
 * no events match.
 */
function matchesEvent(eventsCsv: string | null | undefined, eventType: string): boolean {
  if (!eventsCsv) return false;
  const parts = eventsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("*")) return true;
  return parts.includes(eventType);
}

/**
 * Compute the hex HMAC-SHA256 signature for an event payload using the
 * webhook's secret. Returns an empty string when no secret is configured
 * (the receiver should treat an empty signature as "unsigned").
 */
async function signEvent(event: SecurityEventPayload, secret: string): Promise<string> {
  if (!secret) return "";
  return hmacSha256hex(secret, JSON.stringify(event));
}

/**
 * Send a single event to a single webhook row. Returns true on HTTP 2xx,
 * false otherwise. Logs every attempt to AuditLog. NEVER throws.
 *
 * Exposed so the test endpoint can dispatch a synthetic event to one
 * specific webhook without going through the events-filter path.
 */
export async function sendToWebhook(
  webhook: Record<string, unknown>,
  event: SecurityEventPayload
): Promise<boolean> {
  const url = String(webhook.url || "");
  const name = String(webhook.name || "(unnamed)");
  const webhookId = String(webhook.id || "");
  const secret = webhook.secret ? String(webhook.secret) : "";
  const timestamp = new Date().toISOString();
  const signature = await signEvent(event, secret);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-GuardianX-Event": event.type,
  };
  if (signature) {
    headers["X-GuardianX-Signature"] = `sha256=${signature}`;
  }

  const body = JSON.stringify({ event, timestamp, signature });

  // Audit-log base fields — never include the secret.
  const auditBase = {
    webhookId,
    name,
    url,
    eventType: event.type,
    severity: event.severity,
    title: event.title,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (res.ok) {
      await auditLog("webhook.dispatched", "WebhookConfig", "system", {
        ...auditBase,
        status: res.status,
      });
      return true;
    }
    await auditLog("webhook.failed", "WebhookConfig", "system", {
      ...auditBase,
      status: res.status,
      error: `HTTP ${res.status}`,
    });
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[webhook] dispatch to ${url} (${event.type}) failed:`,
      msg
    );
    await auditLog("webhook.failed", "WebhookConfig", "system", {
      ...auditBase,
      error: msg,
    });
    return false;
  }
}

/**
 * Fan a security event out to every active WebhookConfig whose `events`
 * list matches the event type (or contains the "*" wildcard).
 *
 * NEVER throws — all errors are caught and logged. Safe to call with
 * `void dispatchSecurityEvent(...).catch(() => {})`.
 *
 * @param event The security event payload to dispatch.
 * @returns counts: { matched, succeeded, failed }
 */
export async function dispatchSecurityEvent(
  event: SecurityEventPayload
): Promise<{ matched: number; succeeded: number; failed: number }> {
  let webhooks: Record<string, unknown>[] = [];
  try {
    webhooks = await db.webhookConfig.findMany({ where: { isActive: true } });
  } catch (err) {
    console.error(
      "[webhook] failed to fetch webhook configs:",
      err instanceof Error ? err.message : err
    );
    return { matched: 0, succeeded: 0, failed: 0 };
  }

  const matched = webhooks.filter((w) =>
    matchesEvent(w.events as string | null, event.type)
  );

  if (matched.length === 0) {
    return { matched: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  await Promise.all(
    matched.map(async (w) => {
      const ok = await sendToWebhook(w, event);
      if (ok) succeeded++;
      else failed++;
    })
  );

  return { matched: matched.length, succeeded, failed };
}
