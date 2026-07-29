import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/codebases — list all codebases.
export async function GET() {
  const codebases = await db.codebase.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      language: true,
      description: true,
      createdAt: true,
      _count: { select: { patches: true } },
    },
  });
  return NextResponse.json(
    codebases.map((c) => ({
      id: c.id,
      name: c.name,
      language: c.language,
      description: c.description,
      created_at: c.createdAt.toISOString(),
      patch_count: c._count.patches,
    }))
  );
}

// POST /api/codebases — create a codebase from user-supplied source.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceCode =
    typeof body.sourceCode === "string" ? body.sourceCode : "";
  const language = typeof body.language === "string" ? body.language : "javascript";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!sourceCode.trim())
    return NextResponse.json({ error: "sourceCode required" }, { status: 400 });

  const cb = await db.codebase.create({
    data: { name, language, description, sourceCode },
  });
  return NextResponse.json(
    {
      id: cb.id,
      name: cb.name,
      language: cb.language,
      description: cb.description,
      created_at: cb.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
