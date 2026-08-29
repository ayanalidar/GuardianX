// GuardianX Honeypot-as-Defense helper.
//
// Each fake-vulnerable API endpoint (admin/_internal, .env, debug, v1/users/all,
// backup) calls into `recordHoneypotHit()` to persist the hit + emit an
// AuditLog alert, then returns FAKE data so the attacker thinks they
// succeeded and doesn't try harder.

import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export interface HoneypotContext {
  endpoint: string;       // the path that was hit, e.g. "/api/admin/_internal"
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** Brief label used in the AuditLog entry. */
  label: string;
}

export interface CapturedRequest {
  ip: string;
  userAgent: string;
  method: string;
  payload: string;        // query string + body (truncated)
}

/**
 * Extract the source IP + UA + payload from an incoming Request, suitable
 * for logging in a HoneypotHit row. Payload is a concatenation of the query
 * string + a truncated body, capped at 4 KB so a 100 MB upload doesn't blow
 * up the DB row.
 */
export async function captureRequest(req: Request): Promise<CapturedRequest> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const method = req.method || "GET";

  const url = new URL(req.url);
  const query = url.search ? url.search.slice(1) : "";

  let body = "";
  try {
    // Read body as text — capped at 4 KB so we don't pull a 100 MB upload
    // into a DB row.
    const ct = req.headers.get("content-type") || "";
    if (
      ct.includes("json") ||
      ct.includes("text") ||
      ct.includes("form") ||
      ct.includes("xml") ||
      ct.includes("urlencoded")
    ) {
      const buf = await req.text();
      body = buf.slice(0, 4096);
    } else if (method !== "GET" && method !== "HEAD") {
      body = `[binary content-type=${ct}, ${req.headers.get("content-length") || "?"} bytes]`;
    }
  } catch {
    body = "[unreadable body]";
  }

  const payload = [query, body].filter(Boolean).join(" | ").slice(0, 8192);

  return { ip, userAgent, method, payload };
}

/**
 * Persist a HoneypotHit + emit an AuditLog alert. Both writes are
 * best-effort — if the DB is down (the attacker may be hammering us), we
 * still return the fake data so the trap "works" from the attacker's POV.
 *
 * NOTE: targetId is intentionally null — honeypots are not tied to a Target
 * row, they are platform-level traps.
 */
export async function recordHoneypotHit(
  ctx: HoneypotContext,
  captured: CapturedRequest,
): Promise<void> {
  // Don't await sequentially — fire both writes concurrently.
  const writes: Promise<unknown>[] = [];

  writes.push(
    db.honeypotHit.create({
      data: {
        id: randomUUID(),
        endpoint: ctx.endpoint,
        ipAddress: captured.ip,
        userAgent: captured.userAgent,
        method: captured.method,
        payload: captured.payload,
        severity: ctx.severity,
        detectedAt: new Date(),
        status: "logged",
      },
    }),
  );

  writes.push(
    db.auditLog.create({
      data: {
        id: randomUUID(),
        action: "HONEYPOT_HIT",
        entity: ctx.endpoint,
        actor: captured.ip,
        details: JSON.stringify({
          label: ctx.label,
          endpoint: ctx.endpoint,
          severity: ctx.severity,
          method: captured.method,
          userAgent: captured.userAgent,
          payloadPreview: captured.payload.slice(0, 512),
        }),
      },
    }),
  );

  await Promise.allSettled(writes);
}
