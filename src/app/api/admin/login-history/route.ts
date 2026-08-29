import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  actor: string;
  details: string | null;
  createdAt: string;
}

// GET /api/admin/login-history — current user's recent login activity (or
// admin-only view of all login events when ?scope=all is set).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const isAdminScope = scope === "all" && user.role === "admin";

  try {
    let query = supabase
      .from("AuditLog")
      .select('id, action, entity, actor, details, "createdAt"')
      .order("createdAt", { ascending: false })
      .limit(100);

    if (!isAdminScope) {
      // Filter to this user's events only — actor matches email.
      query = query.eq("actor", user.email);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = ((data || []) as unknown as AuditRow[]).filter((r) =>
      /login|logout|2fa|password|reset|approve/i.test(r.action)
    );

    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        actor: r.actor,
        details: r.details ? safeParse(r.details) : null,
        timestamp: r.createdAt,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load login history" },
      { status: 500 }
    );
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
