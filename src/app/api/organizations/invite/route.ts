import { NextResponse } from "next/server";
import { randomUUID } from "@/lib/crypto";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { auditLog } from "@/lib/audit";
import { sanitizeEmail, sanitizeText } from "@/lib/sanitize";
import { sendEmail } from "@/lib/email";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// POST /api/organizations/invite
//
// Invite a user (by email) to the caller's organization. Generates a
// single-use invite token, persists a TeamMember row with joinedAt=null,
// and sends an invitation email containing a signup/accept link.
//
// Body:
//   { email: string, role?: "admin" | "analyst" | "viewer" }
//
// The invite email contains a link of the form:
//   {origin}/signup?orgId=<orgId>&inviteToken=<token>&email=<email>
//
// Two acceptance paths are supported:
//   - New user: clicks the link, signs up. /api/auth/signup reads orgId +
//     inviteToken from the body, sets User.organizationId immediately, and
//     stamps the TeamMember row's joinedAt.
//   - Existing user: logs in, then POSTs to /api/organizations/accept-invite
//     with the token. That endpoint verifies the token against the TeamMember
//     row + the user's email, then sets User.organizationId + joinedAt.
//
// Returns 201 on success, 400/401/403/409 on validation failures.
export const POST = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = sanitizeEmail(String(body?.email ?? ""));
  if (!email) {
    return NextResponse.json({ error: "A valid invitee email is required" }, { status: 400 });
  }

  // Restrict org-level role to the three valid GuardianX roles. Default
  // to "viewer" for least-privilege.
  const validRoles = ["admin", "analyst", "viewer"];
  const role = validRoles.includes(body?.role) ? body.role : "viewer";

  // 1. Look up the caller's org. They must already be in one.
  const { data: userRow, error: userErr } = await supabase
    .from("User")
    .select("organizationId")
    .eq("id", user.userId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  const orgId = (userRow as Record<string, unknown> | null)?.organizationId;
  if (typeof orgId !== "string" || orgId.length === 0) {
    return NextResponse.json(
      { error: "You are not in an organization. Create one first." },
      { status: 409 }
    );
  }

  // 2. Only org admins may invite. We treat any TeamMember with role=admin
  //    as an org admin (independent of their global GuardianX role).
  const { data: callerMember } = await supabase
    .from("TeamMember")
    .select("id, role")
    .eq("orgId", orgId)
    .eq("email", user.email)
    .maybeSingle();
  const callerRole = (callerMember as Record<string, unknown> | null)?.role;
  if (callerRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can invite new members." },
      { status: 403 }
    );
  }

  // 3. Reject duplicate invites: if there's already a TeamMember row for
  //    this email in this org, return 409 (whether they joined or not).
  const { data: existing } = await supabase
    .from("TeamMember")
    .select("id, joinedAt")
    .eq("orgId", orgId)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That email is already a member (or has a pending invite) of this organization." },
      { status: 409 }
    );
  }

  // 4. Look up the org name for the email body.
  const { data: orgRow } = await supabase
    .from("Organization")
    .select("name, slug")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = sanitizeText(
    String((orgRow as Record<string, unknown> | null)?.name ?? "your team"),
    120
  );

  // 5. Mint a single-use invite token (two concatenated UUIDs, 72 chars,
  //    same pattern as the password-reset / email-verification flows).
  const inviteToken = randomUUID() + randomUUID();
  const memberId = randomUUID();
  const now = new Date().toISOString();

  const { error: memberErr } = await supabase.from("TeamMember").insert({
    id: memberId,
    orgId,
    email,
    role,
    inviteToken,
    invitedAt: now,
    joinedAt: null,
  });
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // 6. Build the invite URL + send the email. Fire-and-forget so a slow
  //    SMTP server doesn't block the API response.
  const origin = new URL(req.url).origin;
  const inviteUrl = `${origin}/signup?orgId=${encodeURIComponent(orgId)}&inviteToken=${encodeURIComponent(
    inviteToken
  )}&email=${encodeURIComponent(email)}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a; border-radius: 12px;">
      <h1 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">
        You've been invited to <span style="color: #10b981;">${orgName}</span> on GuardianX
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        <strong style="color: #d4d4d8;">${user.email}</strong> has invited you to join
        <strong style="color: #d4d4d8;">${orgName}</strong> as a
        <strong style="color: #10b981;">${role}</strong>.
        GuardianX is an autonomous security operations platform for VAPT, patching,
        compliance, and incident response.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 24px;">
        Click the button below to accept the invite and create your account:
      </p>
      <a href="${inviteUrl}" style="display: inline-block; background: #059669; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">
        Accept Invite &amp; Sign Up
      </a>
      <p style="font-size: 12px; line-height: 1.5; color: #71717a; margin: 24px 0 0;">
        Or paste this link into your browser:<br />
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #a1a1aa; word-break: break-all;">${inviteUrl}</span>
      </p>
      <p style="font-size: 12px; line-height: 1.5; color: #52525b; margin: 24px 0 0; border-top: 1px solid #27272a; padding-top: 16px;">
        If you weren't expecting this invitation, you can safely ignore this email.
        The invite token expires when used or when an admin revokes your membership.
      </p>
    </div>
  `;

  void sendEmail(email, `You're invited to ${orgName} on GuardianX`, html, "orgInvite").then(
    (ok) => {
      console.log(
        `[organizations] invite email to ${email} for org ${orgId}: ${ok ? "sent" : "failed (check SMTP)"}`
      );
    }
  );

  await auditLog("organization.member_invited", "organization", user.email, {
    orgId,
    inviteeEmail: email,
    role,
    memberId,
  });

  return NextResponse.json(
    { id: memberId, email, role, message: `Invitation sent to ${email}` },
    { status: 201 }
  );
});
