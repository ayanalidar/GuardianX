import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setDiagApiBaseUrl, chatWithAgent, type ChatMessage } from "@/lib/ai-ops/diagnostic-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/ai-ops/chat
// Body: { message: string, history?: ChatMessage[] }
// Returns: { reply, context }
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  setDiagApiBaseUrl(new URL(req.url).origin);

  const body = await req.json().catch(() => ({}));
  const { message, history } = body as { message?: string; history?: ChatMessage[] };

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await chatWithAgent(message, Array.isArray(history) ? history : []);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        reply: "I encountered an error processing your request.",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 200 }
    );
  }
}
