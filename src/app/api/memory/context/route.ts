import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildContextForChat } from "@/lib/memory-vault/memory-context";

export const dynamic = "force-dynamic";

// GET /api/memory/context
// Returns the built markdown context string for the Guardian AI assistant.
// Used by /api/guardian-chat/route.ts and any client that wants to peek
// at what the assistant "remembers" about the current user.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const context = await buildContextForChat(user.userId);
    return NextResponse.json({ context, length: context.length });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to build memory context", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
