import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getMemories,
  storeMemory,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from "@/lib/memory-vault/memory-store";

export const dynamic = "force-dynamic";

// GET /api/memory?category=finding&limit=10
// Returns the current user's memories, newest-first.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const url = new URL(req.url);
  const cat = url.searchParams.get("category") as MemoryCategory | null;
  const limit = parseInt(url.searchParams.get("limit") || "25", 10);

  if (cat && !MEMORY_CATEGORIES.includes(cat)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const memories = await getMemories(user.userId, cat ?? undefined, isNaN(limit) ? 25 : limit);
    return NextResponse.json({ memories, count: memories.length });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch memories", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

// POST /api/memory
// Body: { category, title, content, tags? }
// Stores a new memory for the current user.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const { category, title, content, tags } = body as {
    category?: string;
    title?: string;
    content?: string;
    tags?: string[];
  };

  if (!category || !MEMORY_CATEGORIES.includes(category as MemoryCategory)) {
    return NextResponse.json(
      { error: `category required. Must be one of: ${MEMORY_CATEGORIES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  try {
    const memory = await storeMemory(user.userId, {
      category: category as MemoryCategory,
      title,
      content,
      tags: Array.isArray(tags) ? tags : [],
    });
    if (!memory) {
      return NextResponse.json({ error: "Failed to store memory" }, { status: 500 });
    }
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to store memory", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
