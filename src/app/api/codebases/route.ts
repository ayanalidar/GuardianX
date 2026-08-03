import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser, getVisibleClientIds } from "@/lib/ownership";
import { sanitizeText } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// GET /api/codebases
// - Admins see all codebases.
// - Viewers see only codebases belonging to clients they own.
export async function GET(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const visibleClientIds = await getVisibleClientIds(req);

    // null = admin (see all), [] = viewer with no clients, [ids...] = viewer with clients
    let query = supabase
      .from("Codebase")
      .select("id, name, language, description, createdAt, clientId")
      .order("createdAt", { ascending: false });

    if (visibleClientIds !== null) {
      if (visibleClientIds.length === 0) {
        // Viewer with no clients — return empty
        return NextResponse.json([]);
      }
      query = query.in("clientId", visibleClientIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Get patch counts per codebase
    const codebases = await Promise.all((data || []).map(async (cb: { id: string; name: string; language: string; description: string | null; createdAt: string }) => {
      const { count } = await supabase.from("Patch").select("*", { count: "exact", head: true }).eq("codebaseId", cb.id);
      return {
        id: cb.id,
        name: cb.name,
        language: cb.language,
        description: cb.description,
        created_at: cb.createdAt,
        patch_count: count || 0,
      };
    }));

    return NextResponse.json(codebases);
  } catch (err) {
    console.error("[codebases GET] error:", err);
    return NextResponse.json([]);
  }
}

// POST /api/codebases
// Creates a codebase. Requires auth. If clientId is provided, verifies the
// user owns that client. Supports both JSON body (paste) and multipart/form-data (file upload).
export async function POST(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required. Please log in." }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  let name = "";
  let sourceCode = "";
  let language = "javascript";
  let description: string | null = null;
  let clientId: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    // File upload mode
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      name = (formData.get("name") as string)?.trim() || "";
      description = (formData.get("description") as string)?.trim() || null;
      clientId = (formData.get("clientId") as string)?.trim() || null;
      language = (formData.get("language") as string)?.trim() || "javascript";

      if (!file) {
        return NextResponse.json({ error: "No file provided. Use the 'file' field." }, { status: 400 });
      }

      // Read file content
      sourceCode = await file.text();

      // Auto-detect language from filename if not provided
      if (!formData.get("language")) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const langMap: Record<string, string> = {
          js: "javascript", mjs: "javascript", cjs: "javascript",
          ts: "typescript", tsx: "typescript",
          py: "python",
          go: "go",
          rb: "ruby",
          php: "php",
          java: "java",
          cs: "csharp",
          cpp: "cpp", cc: "cpp", cxx: "cpp",
          c: "c",
          rs: "rust",
          swift: "swift",
          kt: "kotlin",
        };
        language = langMap[ext] || "javascript";
      }

      // Use filename if no name provided
      if (!name) {
        name = file.name;
      }

      // Limit file size to 5MB
      if (sourceCode.length > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large. Maximum 5MB." }, { status: 413 });
      }
    } catch (err) {
      return NextResponse.json({ error: "Failed to parse file upload: " + (err instanceof Error ? err.message : "unknown") }, { status: 400 });
    }
  } else {
    // JSON body mode (paste)
    const body = await req.json().catch(() => ({}));
    name = typeof body.name === "string" ? body.name.trim() : "";
    sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
    language = typeof body.language === "string" ? body.language : "javascript";
    description = typeof body.description === "string" ? body.description.trim() : null;
    clientId = typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : null;
  }

  // Sanitize inputs
  name = sanitizeText(name, 200);
  description = description ? sanitizeText(description, 2000) : null;
  if (clientId) clientId = sanitizeText(clientId, 100);

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!sourceCode.trim()) return NextResponse.json({ error: "sourceCode required" }, { status: 400 });

  // If clientId is provided, verify the user owns that client
  if (clientId) {
    const { canAccessClient } = await import("@/lib/ownership");
    const access = await canAccessClient(req, clientId);
    if (!access.ok) return access.response;
  }

  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();

  const { data, error } = await supabase.from("Codebase").insert({
    id, name, language, description, sourceCode, clientId,
  }).select("id, name, language, description, createdAt").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    name: data.name,
    language: data.language,
    description: data.description,
    created_at: data.createdAt,
  }, { status: 201 });
}
