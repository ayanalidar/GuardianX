import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/codebases
export async function GET() {
  try {
    const { data, error } = await supabase.from("Codebase").select("id, name, language, description, createdAt").order("createdAt", { ascending: false });
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
    return NextResponse.json([]);
  }
}

// POST /api/codebases
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
  const language = typeof body.language === "string" ? body.language : "javascript";
  const description = typeof body.description === "string" ? body.description.trim() : null;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!sourceCode.trim()) return NextResponse.json({ error: "sourceCode required" }, { status: 400 });

  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();

  const { data, error } = await supabase.from("Codebase").insert({
    id, name, language, description, sourceCode,
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
