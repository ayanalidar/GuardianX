// POST /api/deepfake-phishing/send
// ─────────────────────────────────────────────────────────────────────────────
// Auth-required (admin). Creates a PhishingSimulation row and emails the
// target a link to /phishing/sim?id=... When the target clicks, the page
// plays a TTS audio of the phishing message (CEO impersonation) using the
// Web Speech API (client-side, no server audio generation needed).
//
// Body: { targetEmail, targetName, personaName, personaRole, message,
//         campaignId? }
// Returns: { ok, simulationId }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

interface SendBody {
  targetEmail?: string;
  targetName?: string;
  personaName?: string;
  personaRole?: string;
  message?: string;
  campaignId?: string;
}

function isValidEmail(s: string): boolean {
  // Lightweight check — the SMTP layer will hard-validate the rest.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as SendBody;

  const targetEmail = (body.targetEmail ?? "").trim();
  const targetName = (body.targetName ?? "").trim();
  const personaName = (body.personaName ?? "").trim();
  const personaRole = (body.personaRole ?? "").trim();
  const message = (body.message ?? "").trim();
  const campaignId = body.campaignId ? String(body.campaignId).trim() : null;

  if (!targetEmail || !isValidEmail(targetEmail)) {
    return NextResponse.json(
      { error: "A valid targetEmail is required." },
      { status: 400 }
    );
  }
  if (!targetName) {
    return NextResponse.json({ error: "targetName is required." }, { status: 400 });
  }
  if (!personaName) {
    return NextResponse.json({ error: "personaName is required." }, { status: 400 });
  }
  if (!personaRole) {
    return NextResponse.json({ error: "personaRole is required." }, { status: 400 });
  }
  if (!message || message.length < 8) {
    return NextResponse.json(
      { error: "message is required (min 8 chars)." },
      { status: 400 }
    );
  }

  // Persist the simulation row first so we have the ID for the email link.
  const sim = await db.phishingSimulation.create({
    data: {
      id: randomUUID(),
      targetEmail,
      targetName,
      personaName,
      personaRole,
      message,
      // audioUrl is generated client-side (Web Speech API); left null here.
      audioUrl: null,
      status: "sent",
      clicked: false,
      campaignId,
    },
  });

  // Compose the phishing email. The visible sender is the persona (CEO), but
  // the actual from-address is the configured GuardianX SMTP from (we don't
  // spoof the SMTP envelope — the link inside points back to the GuardianX
  // /phishing/sim page which then plays the deepfake audio).
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const simLink = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/phishing/sim?id=${encodeURIComponent(sim.id)}`
    : `/phishing/sim?id=${encodeURIComponent(sim.id)}`;

  const subject = `Urgent: ${personaName} needs you to action this`;
  const textBody =
    `Hi ${targetName},\n\n` +
    `${personaName} (${personaRole}) here. I need you to act on this right away — ` +
    `it's a sensitive matter that I'd rather not put in writing. I've recorded ` +
    `a brief voice message explaining what's needed:\n\n` +
    `${simLink}\n\n` +
    `Please listen and respond as soon as you can.\n\n` +
    `— ${personaName}\n${personaRole}`;

  const htmlBody =
    `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto">` +
    `<p>Hi ${targetName},</p>` +
    `<p>${personaName} (<strong>${personaRole}</strong>) here. I need you to act on this ` +
    `right away — it's a sensitive matter that I'd rather not put in writing. ` +
    `I've recorded a brief voice message explaining what's needed:</p>` +
    `<p style="margin:24px 0">` +
    `<a href="${simLink}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#fff;` +
    `text-decoration:none;border-radius:6px;font-weight:600">▶ Play voice message</a>` +
    `</p>` +
    `<p>Please listen and respond as soon as you can.</p>` +
    `<p>— ${personaName}<br>${personaRole}</p>` +
    `</div>`;

  const emailResult = await sendEmail({
    to: targetEmail,
    subject,
    text: textBody,
    html: htmlBody,
  });

  // Even if the email is "skipped" (SMTP not configured in dev), the simulation
  // row is still created so the dashboard can show it + the admin can manually
  // share the sim link.
  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: emailResult.error ?? "Failed to send phishing email",
        simulationId: sim.id,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    simulationId: sim.id,
    sent: !emailResult.skipped,
    skipped: emailResult.skipped === true,
    simLink,
  });
}
