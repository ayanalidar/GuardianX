import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { importConnectors, importFindings, type ImportedFinding } from "@/lib/integrations/import-connectors";

export const dynamic = "force-dynamic";

// GET /api/imports
// Returns the catalog of supported import connectors (8 tools).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    connectors: importConnectors.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      icon: c.icon,
      configFields: c.configFields,
    })),
    count: importConnectors.length,
  });
}

// POST /api/imports
// Body: { tool: string, rawData: unknown, engagementId?: string, config?: object, preview?: boolean }
//   preview=true  -> parse only, do not persist
//   default       -> parse + persist as Finding rows linked to engagementId
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { tool, rawData, engagementId, config, preview } = body as {
      tool?: string;
      rawData?: unknown;
      engagementId?: string;
      config?: Record<string, unknown>;
      preview?: boolean;
    };

    if (!tool) {
      return NextResponse.json(
        { error: `tool is required. Supported: ${importConnectors.map((c) => c.id).join(", ")}` },
        { status: 400 }
      );
    }

    const result = await importFindings(
      tool,
      rawData,
      preview ? undefined : engagementId,
      config
    );

    // In preview mode we still want to expose parsed findings even though
    // we skipped persistence.
    if (preview) {
      return NextResponse.json({
        tool: result.tool,
        parsed: result.findings.length,
        findings: result.findings as ImportedFinding[],
        errors: result.errors,
      });
    }

    return NextResponse.json(result, { status: result.imported > 0 ? 201 : 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
