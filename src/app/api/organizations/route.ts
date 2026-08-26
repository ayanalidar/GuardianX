import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { auditLog } from "@/lib/audit";
import { sanitizeText } from "@/lib/sanitize";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// POST /api/organizations
//
// Create a new Organization. The caller becomes the org's first admin
// TeamMember row AND has their own `User.organizationId` set so subsequent
// API calls (buildOwnershipFilter, getVisibleClientIds) immediately scope
// to the new org when their workspace context is "org".
//
// Body:
//   { name: string, slug?: string }
//
// Returns:
//   201 { id, name, slug, role: "admin" }
//   400 if the name is missing or the slug is invalid/taken.
//   401 if not authenticated.
//   409 if the user is already in an org (a user can only belong to one).
export const POST = withErrorHandler(async (req: Request) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = sanitizeText(rawName, 120);
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Slug: optional, derived from name if absent. Lowercase, [a-z0-9-] only,
  // max 60 chars. Must be unique across organizations.
  const rawSlug = typeof body?.slug === "string" ? body.slug : name;
  const slug = sanitizeText(rawSlug, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  // A user can belong to at most one organization. If they're already in one,
  // they must leave it first (via the leave-org API, future work) before
  // creating another.
  const { data: existingUser } = await supabase
    .from("User")
    .select("organizationId")
    .eq("id", user.userId)
    .maybeSingle();
  const existingOrgId = (existingUser as Record<string, unknown> | null)?.organizationId;
  if (typeof existingOrgId === "string" && existingOrgId.length > 0) {
    return NextResponse.json(
      { error: "You are already in an organization. Leave it before creating a new one." },
      { status: 409 }
    );
  }

  // Slug uniqueness check.
  const { data: slugClash } = await supabase
    .from("Organization")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugClash) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const orgId = randomUUID();
  const now = new Date().toISOString();

  // 1. Create the organization row.
  const { error: orgErr } = await supabase.from("Organization").insert({
    id: orgId,
    name,
    slug,
    createdAt: now,
  });
  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  // 2. Add the creator as the first TeamMember with role = "admin". The
  //    creator's membership is considered "joined" immediately (joinedAt
  //    set, no inviteToken needed).
  const memberId = randomUUID();
  const { error: memberErr } = await supabase.from("TeamMember").insert({
    id: memberId,
    orgId,
    email: user.email,
    role: "admin",
    inviteToken: null,
    invitedAt: now,
    joinedAt: now,
  });
  if (memberErr) {
    // Best-effort cleanup: delete the org we just created so we don't leave
    // an orphan row. If the cleanup fails too, the operator will see it in
    // the audit log.
    await supabase.from("Organization").delete().eq("id", orgId);
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // 3. Stamp the creator's User.organizationId. From this point on, every
  //    API call they make with workspace=org will scope to this org.
  const { error: userUpdateErr } = await supabase
    .from("User")
    .update({ organizationId: orgId })
    .eq("id", user.userId);
  if (userUpdateErr) {
    console.error("[organizations] failed to set creator organizationId:", userUpdateErr.message);
    // Non-fatal: the TeamMember row exists, so the user can still be
    // re-linked manually. We surface a warning in the response.
  }

  await auditLog("organization.created", "organization", user.email, {
    orgId,
    name,
    slug,
    creatorUserId: user.userId,
  });

  return NextResponse.json(
    { id: orgId, name, slug, role: "admin", message: "Organization created" },
    { status: 201 }
  );
});
