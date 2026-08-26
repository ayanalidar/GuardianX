import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";
import { sanitizeText } from "@/lib/sanitize";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// GET /api/contributors — public, returns all contributors
// Optional: ?status=active to filter
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = supabase
    .from("Contributor")
    .select("*")
    .order("contributions", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}

// POST /api/contributors — admin only, add a new contributor
export async function POST(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const name = sanitizeText(body.name, 100);
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("Contributor")
    .insert({
      id: randomUUID(),
      name,
      email: body.email ? sanitizeText(body.email, 200) : null,
      role: sanitizeText(body.role || "contributor", 50),
      title: body.title ? sanitizeText(body.title, 200) : null,
      bio: body.bio ? sanitizeText(body.bio, 1000) : null,
      avatarUrl: body.avatarUrl ? sanitizeText(body.avatarUrl, 500) : null,
      githubUrl: body.githubUrl ? sanitizeText(body.githubUrl, 500) : null,
      linkedinUrl: body.linkedinUrl ? sanitizeText(body.linkedinUrl, 500) : null,
      twitterUrl: body.twitterUrl ? sanitizeText(body.twitterUrl, 500) : null,
      contributions: typeof body.contributions === "number" ? body.contributions : 0,
      contributionSummary: body.contributionSummary ? sanitizeText(body.contributionSummary, 500) : null,
      status: sanitizeText(body.status || "active", 20),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contributor: data }, { status: 201 });
}

// PUT /api/contributors — admin only, update a contributor
export async function PUT(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Sanitize all string fields
  const cleanUpdates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string") {
      cleanUpdates[key] = sanitizeText(value, key === "bio" ? 1000 : 500);
    } else {
      cleanUpdates[key] = value;
    }
  }

  const { data, error } = await supabase
    .from("Contributor")
    .update(cleanUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contributor: data });
}

// DELETE /api/contributors — admin only
export async function DELETE(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("Contributor").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Contributor removed" });
}
