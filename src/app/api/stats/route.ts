import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/stats
export async function GET() {
  try {
    const [pending, approved, rejected, critical, codebases, scans] = await Promise.all([
      supabase.from("Patch").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("Patch").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("Patch").select("*", { count: "exact", head: true }).eq("status", "rejected"),
      supabase.from("Patch").select("*", { count: "exact", head: true }).eq("status", "pending").eq("severity", "critical"),
      supabase.from("Codebase").select("*", { count: "exact", head: true }),
      supabase.from("Scan").select("*", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      pending: pending.count || 0,
      approved: approved.count || 0,
      rejected: rejected.count || 0,
      critical_pending: critical.count || 0,
      total: (pending.count || 0) + (approved.count || 0) + (rejected.count || 0),
      codebases: codebases.count || 0,
      scans: scans.count || 0,
    });
  } catch (err) {
    return NextResponse.json({
      pending: 0, approved: 0, rejected: 0, critical_pending: 0, total: 0, codebases: 0, scans: 0,
      error: err instanceof Error ? err.message : "stats error",
    });
  }
}
