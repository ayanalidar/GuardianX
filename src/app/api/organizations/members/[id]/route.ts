import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { auditLog } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

type MemberRouteContext = { params: Promise<{ id: string }> };

// DELETE /api/organizations/members/[id]
//
// Remove a member from the caller's organization. Org admins only.
//
// Behavior:
//   - If the member has already joined (joinedAt != null), also clears
//     their User.organizationId so their data goes back to solo-user mode.
//   - If the member is still pending (joinedAt == null), just deletes the
//     TeamMember row (revokes the invite).
//   - An org admin cannot remove themselves (would orphan the org). To
//     dissolve the org, use the dedicated dissolve-org API (future work)
//     or delete it from the DB directly.
//
// Path params:
//   id — the TeamMember.id to remove.
export const DELETE = withErrorHandler<MemberRouteContext>(async (req, ctx) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id: memberId } = await ctx.params;
  if (!memberId) {
    return NextResponse.json({ error: "Member id is required" }, { status: 400 });
  }

  // 1. Fetch the caller's org.
  const { data: userRow, error: userErr } = await supabase
    .from("User")
    .select("organizationId")
    .eq("id", user.userId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  const callerOrgId = (userRow as Record<string, unknown> | null)?.organizationId;
  if (typeof callerOrgId !== "string" || callerOrgId.length === 0) {
    return NextResponse.json(
      { error: "You are not in an organization." },
      { status: 409 }
    );
  }

  // 2. Caller must be an org admin.
  const { data: callerMember } = await supabase
    .from("TeamMember")
    .select("id, role")
    .eq("orgId", callerOrgId)
    .eq("email", user.email)
    .maybeSingle();
  const callerRole = (callerMember as Record<string, unknown> | null)?.role;
  if (callerRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can remove members." },
      { status: 403 }
    );
  }

  // 3. Fetch the target member. Must be in the same org (defense-in-depth:
  //    a member id from another org must NOT be deletable here).
  const { data: targetRow } = await supabase
    .from("TeamMember")
    .select('id, orgId, email, role, "joinedAt"')
    .eq("id", memberId)
    .maybeSingle();
  const target = targetRow as Record<string, unknown> | null;
  if (!target || target.orgId !== callerOrgId) {
    return NextResponse.json({ error: "Member not found in your organization." }, { status: 404 });
  }

  // 4. Prevent self-removal (would orphan the org).
  if (target.email === user.email) {
    return NextResponse.json(
      { error: "You cannot remove yourself. Transfer admin rights first or dissolve the org." },
      { status: 400 }
    );
  }

  // 5. If the member had joined, clear their User.organizationId so their
  //    data reverts to solo-user scope.
  if (target.joinedAt != null) {
    const targetEmail = target.email as string;
    const { error: userClearErr } = await supabase
      .from("User")
      .update({ organizationId: null })
      .eq("email", targetEmail);
    if (userClearErr) {
      console.error("[organizations] failed to clear removed user organizationId:", userClearErr.message);
      // Non-fatal — proceed to delete the TeamMember row anyway.
    }
  }

  // 6. Delete the TeamMember row.
  const { error: deleteErr } = await supabase
    .from("TeamMember")
    .delete()
    .eq("id", memberId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  await auditLog("organization.member_removed", "organization", user.email, {
    orgId: callerOrgId,
    removedMemberId: memberId,
    removedMemberEmail: target.email,
    wasJoined: target.joinedAt != null,
  });

  return NextResponse.json({ ok: true, message: "Member removed" });
});
