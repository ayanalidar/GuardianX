import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ── Cryptographic Canary Tokens, public trigger endpoint ──────────────────
// POST /api/canary/check
// PUBLIC — called by the monitoring sweep when a canary token is observed
// somewhere it shouldn't be (dark web listing, GitHub gist, pastebin, …).
// The body includes the token, the source where it was found, and any
// metadata about the find (URL, timestamp, reporter).
//
// This endpoint:
//   1. Looks up the token.
//   2. If found AND still active, marks it as triggered (triggeredAt,
//      triggeredBy, triggerSource).
//   3. Writes an AuditLog entry so admins see the alert in their feed.
//   4. Fires an email alert to the configured admin mailbox (SMTP_FROM
//      → ADMIN_ALERT_EMAIL or SMTP_USER), fail-soft if SMTP isn't set.
//   5. Returns `{ triggered: true, resourceType, resourceId, label }`.
//
// If the token is unknown or already triggered, we still return 200 so the
// sweep doesn't retry forever, but the body indicates the new-state.

interface CheckBody {
  token: unknown;
  source: unknown;
  metadata: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function summarizeMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CheckBody;
  const token = isString(body.token) ? body.token.trim() : "";
  const source = isString(body.source) ? body.source : "unknown";
  const meta = summarizeMetadata(body.metadata);

  if (!token) {
    return NextResponse.json(
      { triggered: false, error: "token is required" },
      { status: 400 },
    );
  }

  // Resolve the caller's IP + UA for the triggeredBy record
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  const triggeredBy = `${ip} | ${ua.slice(0, 200)}`;

  const canary = await db.canaryToken.findUnique({
    where: { token },
  });

  if (!canary) {
    // Unknown token — sweep can discard it. Don't leak any info about
    // which tokens exist.
    return NextResponse.json({
      triggered: false,
      message: "Token not recognized.",
    });
  }

  if (canary.triggeredAt) {
    // Already triggered — return existing info without re-alerting
    return NextResponse.json({
      triggered: true,
      alreadyTriggered: true,
      resourceType: canary.resourceType,
      resourceId: canary.resourceId,
      label: canary.label,
      triggeredAt: canary.triggeredAt.toISOString(),
      triggerSource: canary.triggerSource,
    });
  }

  // ── Fresh trigger — this is the alert path ─────────────────────────────
  await db.canaryToken.update({
    where: { id: canary.id },
    data: {
      triggeredAt: new Date(),
      triggeredBy,
      triggerSource: source,
      // Once triggered, leave isActive=true so the sweep keeps reporting
      // new sightings — but the UI shows the triggered state.
    },
  });

  // Audit log entry — appears in the admin audit feed immediately
  await db.auditLog.create({
    data: {
      action: "canary.token_triggered",
      entity: "CanaryToken",
      actor: "monitoring-sweep",
      details: JSON.stringify({
        canaryId: canary.id,
        label: canary.label,
        resourceType: canary.resourceType,
        resourceId: canary.resourceId,
        source,
        triggeredBy,
        metadata: meta || null,
      }),
    },
  });

  // Email alert — fail-soft, no-op if SMTP isn't configured
  const alertTo = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER || "";
  if (alertTo) {
    await sendEmail({
      to: alertTo,
      subject: `[GUARDIANX ALERT] Canary token triggered: ${canary.label}`,
      text: [
        "A GuardianX cryptographic canary token has been observed in the wild.",
        "",
        `Label:          ${canary.label}`,
        `Resource Type: ${canary.resourceType}`,
        `Resource ID:   ${canary.resourceId}`,
        `Source:        ${source}`,
        `Triggered By:  ${triggeredBy}`,
        `Time (UTC):    ${new Date().toISOString()}`,
        "",
        `Token (masked): ${canary.token.slice(0, 18)}…${canary.token.slice(-6)}`,
        "",
        "Action required:",
        "  1. Investigate the data path that owns this resource.",
        "  2. Rotate any credentials that touched it.",
        "  3. Check the audit log for the full trigger context.",
        "",
        "— GuardianX Moving Target Defense",
      ].join("\n"),
      html: `
        <div style="font-family: ui-monospace, SFMono-Regular, monospace; background:#0a0a0a; color:#e4e4e7; padding:20px;">
          <h2 style="color:#ef4444; margin:0 0 12px;">⚠ CANARY TOKEN TRIGGERED</h2>
          <p style="color:#f59e0b; margin:0 0 12px;">A cryptographic canary has been observed in the wild.</p>
          <table style="font-size:13px; color:#a1a1aa;">
            <tr><td style="color:#71717a;">Label</td><td style="color:#fafafa;">${canary.label}</td></tr>
            <tr><td style="color:#71717a;">Resource Type</td><td style="color:#fafafa;">${canary.resourceType}</td></tr>
            <tr><td style="color:#71717a;">Resource ID</td><td style="color:#fafafa;">${canary.resourceId}</td></tr>
            <tr><td style="color:#71717a;">Source</td><td style="color:#f59e0b;">${source}</td></tr>
            <tr><td style="color:#71717a;">Triggered By</td><td style="color:#fafafa;">${triggeredBy}</td></tr>
            <tr><td style="color:#71717a;">Time (UTC)</td><td style="color:#fafafa;">${new Date().toISOString()}</td></tr>
          </table>
          <p style="color:#71717a; font-size:12px; margin-top:16px;">— GuardianX Moving Target Defense</p>
        </div>
      `,
    });
  }

  return NextResponse.json({
    triggered: true,
    resourceType: canary.resourceType,
    resourceId: canary.resourceId,
    label: canary.label,
    triggeredAt: new Date().toISOString(),
    triggerSource: source,
  });
}
