import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { auditLog } from "@/lib/audit";
import { sanitizeEmail } from "@/lib/sanitize";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// POST /api/organizations/accept-invite
//
// Accept a pending org invitation. Verifies the invite token against a
// TeamMember row, then:
//   1. Stamps TeamMember.joinedAt (so the row transitions pending → joined).
//   2. Sets User.organizationId on the caller's account so subsequent API
//      calls scope to the org when workspace=org.
//
// Body:
//   { inviteToken: string, email?: string }
//
// The `email` is optional but recommended as a defense-in-depth check: if
// provided, it must match the email on the TeamMember row. This catches
// the case where a token is accidentally leaked to a different user.
//
// Returns 200 on success, 400/401/404/409 on validation failures.
export const POST = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inviteToken =
    typeof body?.inviteToken === "string" && body.inviteToken.length >= 32
      ? body.inviteToken
      : "";
  if (!inviteToken) {
    return NextResponse.json({ error: "inviteToken is required" }, { status: 400 });
  }

  // Optional email cross-check (defense-in-depth).
  const expectedEmail = body?.email ? sanitizeEmail(String(body.email)) : "";

  // 1. Look up the pending TeamMember row by invite token.
  const { data: memberRow, error: memberErr } = await supabase
    .from("TeamMember")
    .select('id, orgId, email, role, "joinedAt"')
    .eq("inviteToken", inviteToken)
    .maybeSingle();
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }
  if (!memberRow) {
    return NextResponse.json({ error: "Invalid or expired invite token." }, { status: 404 });
  }

  const member = memberRow as Record<string, unknown>;
  if (member.joinedAt != null) {
    return NextResponse.json(
      { error: "This invitation has already been accepted." },
      { status: 409 }
    );
  }

  // The invite was sent to a specific email — only the user who owns that
  // email can accept it. If the caller's email differs, reject.
  if (member.email !== user.email) {
    return NextResponse.json(
      {
        error:
          "This invitation was sent to a different email address. Log in with the invited email to accept it.",
      },
      { status: 403 }
    );
  }

  // Defense-in-depth: if the caller also passed `email` in the body, it
  // must match both the TeamMember row AND the caller's session email.
  if (expectedEmail && expectedEmail !== user.email) {
    return NextResponse.json(
      { error: "Email mismatch — invite token does not belong to this email." },
      { status: 400 }
    );
  }

  // 2. Reject if the user is already in a different org.
  const { data: userRow } = await supabase
    .from("User")
    .select("organizationId")
    .eq("id", user.userId)
    .maybeSingle();
  const existingOrgId = (userRow as Record<string, unknown> | null)?.organizationId;
  if (typeof existingOrgId === "string" && existingOrgId.length > 0 && existingOrgId !== member.orgId) {
    return NextResponse.json(
      { error: "You are already in another organization. Leave it before accepting this invite." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  // 3. Stamp joinedAt on the TeamMember row (transitions pending → joined).
  const { error: joinErr } = await supabase
    .from("TeamMember")
    .update({ joinedAt: now, inviteToken: null })
    .eq("id", member.id as string);
  if (joinErr) {
    return NextResponse.json({ error: joinErr.message }, { status: 500 });
  }

  // 4. Set the user's organizationId.
  const { error: userUpdateErr } = await supabase
    .from("User")
    .update({ organizationId: member.orgId as string })
    .eq("id", user.userId);
  if (userUpdateErr) {
    return NextResponse.json({ error: userUpdateErr.message }, { status: 500 });
  }

  await auditLog("organization.invite_accepted", "organization", user.email, {
    orgId: member.orgId,
    userId: user.userId,
    memberId: member.id,
    role: member.role,
  });

  return NextResponse.json({
    ok: true,
    organizationId: member.orgId,
    role: member.role,
    message: "Invitation accepted. You are now a member of this organization.",
  });
});
