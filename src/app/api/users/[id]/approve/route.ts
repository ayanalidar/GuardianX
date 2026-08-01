import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/users/[id]/approve — approve a pending user (admin only)
// Body: { action: "approve" | "reject" }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    if (action === "approve") {
      const { data, error } = await supabase
        .from("User")
        .update({ approved: true })
        .eq("id", id)
        .select("id, email, name, role, approved")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({
        ok: true,
        user: data,
        message: `Approved ${data.email}. They can now log in.`,
      });
    } else if (action === "reject") {
      // Delete the user account
      const { error } = await supabase
        .from("User")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
      return NextResponse.json({
        ok: true,
        message: "User rejected and account deleted.",
      });
    }

    return NextResponse.json({ error: "Unknown action. Use 'approve' or 'reject'." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET /api/users/[id]/approve — check approval status
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await params;
  try {
    const { data, error } = await supabase
      .from("User")
      .select("id, email, approved")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ approved: data?.approved || false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
