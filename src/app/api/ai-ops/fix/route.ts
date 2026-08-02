import { NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { setDiagApiBaseUrl, executeFix, type SelfHealAction } from "@/lib/ai-ops/diagnostic-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_ACTIONS: SelfHealAction[] = [
  "restart_engine",
  "rerun_migration",
  "clear_cache",
  "fix_env",
  "reinstall_deps",
  "reseed_siem_rules",
  "reindex_codebase",
  "evaluate_correlations",
  "run_retention_cleanup",
];

// POST /api/ai-ops/fix
// Body: { action: SelfHealAction }
// Admin-only. Executes one of the 9 self-heal actions and returns a FixResult.
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  setDiagApiBaseUrl(new URL(req.url).origin);

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (!action || !VALID_ACTIONS.includes(action as SelfHealAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await executeFix(action as SelfHealAction);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fix execution failed" },
      { status: 500 }
    );
  }
}

// GET /api/ai-ops/fix - list available self-heal actions (for the UI).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    actions: VALID_ACTIONS.map((a) => ({
      id: a,
      label: a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      adminRequired: true,
    })),
  });
}
