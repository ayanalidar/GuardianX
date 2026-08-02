import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setDiagApiBaseUrl, diagnoseFailure } from "@/lib/ai-ops/diagnostic-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai-ops/diagnose
// Body: { component: string, error: string }
// Returns: Diagnosis object with rootCause, severity, suggestedFixes, relatedFiles.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  setDiagApiBaseUrl(new URL(req.url).origin);

  const body = await req.json().catch(() => ({}));
  const { component, error } = body as { component?: string; error?: string };

  if (!component || typeof component !== "string") {
    return NextResponse.json({ error: "component is required (route path, file path, table name, or lib name)" }, { status: 400 });
  }

  try {
    const diagnosis = await diagnoseFailure(component, error || "");
    return NextResponse.json(diagnosis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diagnosis failed" },
      { status: 500 }
    );
  }
}
