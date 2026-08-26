import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// GET /api/organizations/current
//
// Returns the calling user's organization + member list. Returns 200 with
// `{ organization: null }` if the user is not in any org (solo user).
//
// Response shape:
//   {
//     organization: {
//       id, name, slug,
//       members: [{ id, email, role, joinedAt, invitedAt, isCreator }],
//       memberCount: number
//     } | null,
//     currentUserMemberId: string | null  // the caller's TeamMember.id, if any
//   }
export const GET = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // 1. Fetch the user's organizationId.
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
    return NextResponse.json({ organization: null, currentUserMemberId: null });
  }

  // 2. Fetch the org row + members in parallel.
  const [orgRes, membersRes] = await Promise.all([
    supabase.from("Organization").select("id, name, slug").eq("id", orgId).maybeSingle(),
    supabase
      .from("TeamMember")
      .select('id, email, role, "invitedAt", "joinedAt"')
      .eq("orgId", orgId)
      .order("joinedAt", { ascending: true, nullsFirst: false }),
  ]);

  if (orgRes.error) {
    return NextResponse.json({ error: orgRes.error.message }, { status: 500 });
  }
  if (!orgRes.data) {
    // User.organizationId points to a deleted org — treat as solo user.
    return NextResponse.json({ organization: null, currentUserMemberId: null });
  }

  const members = (membersRes.data || []) as Array<Record<string, unknown>>;
  const currentMember = members.find((m) => m.email === user.email) || null;

  return NextResponse.json({
    organization: {
      id: (orgRes.data as Record<string, unknown>).id,
      name: (orgRes.data as Record<string, unknown>).name,
      slug: (orgRes.data as Record<string, unknown>).slug,
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
        // A member is considered the creator if they have role=admin AND
        // joinedAt is set (the creator is the only member who joins without
        // an invite token, but we don't expose the token here).
        isCreator: m.role === "admin" && m.joinedAt != null,
      })),
      memberCount: members.length,
    },
    currentUserMemberId: currentMember ? (currentMember.id as string) : null,
  });
});
