import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCodebaseIndex, getCodebaseSummary, readFileSource, invalidateCodebaseIndex } from "@/lib/ai-ops/codebase-index";

export const dynamic = "force-dynamic";

// GET /api/ai-ops/codebase
//   ?summary=true              -> return compact text summary (for AI prompts)
//   ?file=<relative path>      -> return source of a single file
//   ?reindex=true              -> invalidate cache + return fresh index
//   default                    -> return the full structured codebase index
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const summary = url.searchParams.get("summary") === "true";
    const file = url.searchParams.get("file");
    const reindex = url.searchParams.get("reindex") === "true";

    if (reindex) invalidateCodebaseIndex();

    if (summary) {
      return NextResponse.json({ summary: getCodebaseSummary() });
    }

    if (file) {
      const src = readFileSource(file);
      if (!src) {
        return NextResponse.json({ error: "File not found or outside project root" }, { status: 404 });
      }
      return NextResponse.json(src);
    }

    const idx = getCodebaseIndex();
    // Trim the file list to the most useful fields to keep payload small.
    return NextResponse.json({
      ...idx,
      files: idx.files.map((f) => ({
        relativePath: f.relativePath,
        lines: f.lines,
        type: f.type,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Codebase index failed" },
      { status: 500 }
    );
  }
}
