import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendBulkEmail } from "@/lib/email";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// POST /api/breach/notify, DPDPA § 8(6) — Personal Data Breach Notification
//
// Admin-only endpoint that:
//   1. Creates an Incident record describing the breach.
//   2. Sends a breach-notification email to every affected user.
//   3. Logs the action to the AuditLog.
//
// Body:
//   {
//     title: string,
//     description: string,
//     affectedData: string,
//     severity: "critical" | "high" | "medium" | "low"
//   }
//
// Returns:
//   { ok: true, notifiedCount: N, incidentId: "..." }
//
// "Affected users" = every user whose email matches a Client.contactEmail
// on file. If no client emails are found, the notification is sent to
// every registered user (defense-in-default: better to over-notify than
// under-notify under DPDPA § 8(6)).
//
// Per DPDPA § 8(6), the Board and affected Data Principals must be
// notified "as soon as possible" — this endpoint is the mechanism by
// which GuardianX satisfies that obligation within its own platform.

const VALID_SEVERITIES = ["critical", "high", "medium", "low"] as const;
type Severity = (typeof VALID_SEVERITIES)[number];

interface BreachBody {
  title?: unknown;
  description?: unknown;
  affectedData?: unknown;
  severity?: unknown;
}

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as BreachBody;
  const { title, description, affectedData, severity } = body;

  // ── Validate input ─────────────────────────────────────────────────────
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 255) {
    return NextResponse.json(
      { error: "title is required (1-255 chars)" },
      { status: 400 }
    );
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }
  if (typeof affectedData !== "string" || affectedData.trim().length === 0) {
    return NextResponse.json(
      { error: "affectedData is required (describe what data was exposed)" },
      { status: 400 }
    );
  }
  if (typeof severity !== "string" || !VALID_SEVERITIES.includes(severity as Severity)) {
    return NextResponse.json(
      { error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
      { status: 400 }
    );
  }

  const adminName = auth.user.name;
  const adminEmail = auth.user.email;
  const occurredAt = new Date().toISOString();

  try {
    // ── 1. Create the Incident record ───────────────────────────────────
    const incidentId = randomUUID();
    const { data: incident, error: incErr } = await supabase
      .from("Incident")
      .insert({
        id: incidentId,
        title: `[BREACH] ${title}`,
        description,
        severity,
        status: "open",
        category: "data_breach",
        source: "manual",
        sourceId: null,
        clientId: null,
        targetId: null,
        assignee: adminName,
        detectedAt: occurredAt,
        rootCause: null,
        lessonsLearned: null,
      })
      .select()
      .single();

    if (incErr) throw new Error(incErr.message);

    // Stamp an opening IncidentEvent so the DFIR timeline has a record.
    await supabase.from("IncidentEvent").insert({
      id: randomUUID(),
      incidentId,
      eventType: "breach_notification",
      source: "manual",
      sourceId: null,
      title: "Breach notification initiated",
      description: `Admin ${adminName} triggered DPDPA § 8(6) breach notification. Affected data: ${affectedData}. Severity: ${severity}.`,
      severity,
      metadata: JSON.stringify({
        affectedData,
        severity,
        initiatedBy: adminEmail,
        initiatedAt: occurredAt,
      }),
      actor: adminName,
      occurredAt,
    });

    // ── 2. Compile the recipient list ──────────────────────────────────
    // Affected users = any user whose email appears as a Client.contactEmail
    // (the contact-email is the only user→client linkage GuardianX
    // maintains today). If no matches exist, fall back to notifying ALL
    // users — DPDPA § 8(6) favors over-notification over under-notification.
    const { data: clientEmails } = await supabase
      .from("Client")
      .select("contactEmail")
      .not("contactEmail", "is", null);

    const dedupedClientEmails = Array.from(
      new Set(
        (clientEmails || [])
          .map((c: { contactEmail: string | null }) => c.contactEmail as string | null)
          .filter((e: string | null): e is string => Boolean(e))
      )
    );

    let recipients: string[];
    if (dedupedClientEmails.length > 0) {
      recipients = dedupedClientEmails;
    } else {
      // Fallback: notify every user with an approved account.
      const { data: allUsers } = await supabase
        .from("User")
        .select("email")
        .eq("approved", true);
      recipients = (allUsers || [])
        .map((u: { email: string }) => u.email)
        .filter((e: string) => Boolean(e));
    }

    // Always notify the admin who triggered the action (auditable copy).
    if (!recipients.includes(adminEmail)) {
      recipients.push(adminEmail);
    }

    // ── 3. Build + send the breach notification email ──────────────────
    const severityUpper = (severity as string).toUpperCase();
    const subject = `[${severityUpper}] GuardianX Security Incident Notification — ${title}`;

    const emailBody = buildBreachEmailBody({
      title,
      description,
      affectedData,
      severity,
      incidentId,
      occurredAt,
      initiatedBy: adminName,
    });

    const { notifiedCount, failures } = await sendBulkEmail(recipients, {
      subject,
      text: emailBody,
    });

    // ── 4. Audit log ───────────────────────────────────────────────────
    await supabase.from("AuditLog").insert({
      id: randomUUID(),
      action: "breach.notified",
      entity: incidentId,
      actor: adminEmail,
      details: JSON.stringify({
        title,
        severity,
        affectedData,
        recipientCount: recipients.length,
        notifiedCount,
        failures: failures.length,
        failureDetails: failures.slice(0, 20), // cap to avoid log bloat
        incidentId,
        occurredAt,
        triggeredBy: adminName,
      }),
    });

    return NextResponse.json({
      ok: true,
      notifiedCount,
      recipientCount: recipients.length,
      failureCount: failures.length,
      failures: failures.slice(0, 50),
      incidentId,
      message: `Breach notification dispatched to ${notifiedCount} recipient(s).`,
    });
  } catch (err) {
    console.error("[breach/notify] failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to dispatch breach notification",
      },
      { status: 500 }
    );
  }
}

/**
 * Build the plain-text body of the breach notification email.
 *
 * DPDPA § 8(6)(b) requires the notification to describe:
 *   - the nature of the breach,
 *   - the data affected,
 *   - the steps being taken to mitigate,
 *   - the contact details of the Grievance Officer.
 */
function buildBreachEmailBody(args: {
  title: string;
  description: string;
  affectedData: string;
  severity: string;
  incidentId: string;
  occurredAt: string;
  initiatedBy: string;
}): string {
  const { title, description, affectedData, severity, incidentId, occurredAt, initiatedBy } = args;
  return `Dear GuardianX User,

We are writing to inform you of a security incident affecting your account. This notification is issued in accordance with Section 8(6) of the Digital Personal Data Protection Act, 2023 (DPDPA).

INCIDENT SUMMARY
  Title:          ${title}
  Severity:       ${severity.toUpperCase()}
  Incident ID:    ${incidentId}
  Detected at:    ${occurredAt}
  Reported by:    ${initiatedBy}, GuardianX Administrator

WHAT HAPPENED
${description}

WHAT DATA WAS AFFECTED
${affectedData}

WHAT WE ARE DOING
  1. We have opened an internal incident case (ID ${incidentId}) and assigned it to our security team.
  2. The affected systems have been isolated and access revoked where applicable.
  3. We are rotating credentials and reviewing all sessions for signs of misuse.
  4. We are conducting a full forensic review and will share findings with the Data Protection Board of India as required under DPDPA § 8(6)(a).
  5. We will provide a follow-up notification once the incident is fully contained and remediated.

WHAT YOU SHOULD DO
  1. If your GuardianX password was among the affected data, change it immediately. (It is not, unless we explicitly told you so above.)
  2. Enable two-factor authentication on your account if you have not already done so.
  3. Be alert to phishing emails that reference this incident. GuardianX will never ask for your password over email.
  4. Review your account activity via Settings → Activity.

GRIEVANCE OFFICER
  Name:   GuardianX Data Protection Officer
  Email:  hello@guardianx.in
  Phone:  +91 (available on request)

  You have the right to lodge a complaint with the Data Protection Board of India if you are not satisfied with our response. Reference: DPDPA § 12 (Right of Grievance Redressal) and § 18 (Complaints to the Board).

We sincerely apologize for any inconvenience this incident may cause. We are committed to protecting your personal data and to full transparency about what happened and how we are responding.

— GuardianX Autonomous Security Operations`;
}
