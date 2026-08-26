import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { measureApiTime } from "@/lib/performance";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/patches/pending
//
// Performance (perf-optimize task):
//   - Wrapped with `measureApiTime` so slow responses (>500ms) are logged.
//   - 15s private Cache-Control coalesces the console's 10s polls.
export const GET = measureApiTime(
  "/api/patches/pending",
  async function GET() {
    try {
      const { data, error } = await supabase
        .from("Patch")
        .select("patchId, id, title, severity, cve, affectedFile, aiExplanation, confidence, sandboxPassed, createdAt, codebaseId")
        .eq("status", "pending")
        .order("severity", { ascending: true })
        .order("createdAt", { ascending: false });

      if (error) throw new Error(error.message);

      // Get codebase names
      const cbIds = [...new Set((data || []).map((p: { codebaseId: string }) => p.codebaseId))];
      const { data: codebases } = await supabase.from("Codebase").select("id, name").in("id", cbIds);
      const cbMap = new Map((codebases || []).map((c: { id: string; name: string }) => [c.id, c.name]));

      return NextResponse.json(
        (data || []).map((p: Record<string, unknown>) => ({
          patch_id: p.patchId,
          internal_id: p.id,
          codebase_name: cbMap.get(p.codebaseId as string) || "unknown",
          title: p.title,
          severity: p.severity,
          cve: p.cve,
          affected_file: p.affectedFile,
          ai_explanation: p.aiExplanation,
          confidence: p.confidence,
          sandbox_passed: p.sandboxPassed,
          has_exploit: false,
          exploit_confirmed: false,
          adversarial_rounds: 0,
          adversarial_won: false,
          created_at: p.createdAt,
        })),
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=10",
          },
        }
      );
    } catch {
      return NextResponse.json([]);
    }
  },
);
