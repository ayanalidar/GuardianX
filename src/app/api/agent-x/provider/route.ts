// Agent X — LLM Provider Badge
// ─────────────────────────────────────────────────────────────────────────
// GET /api/agent-x/provider
//
// Auth required. Returns the display name of the LLM provider currently
// active on the server (OpenAI / Anthropic / Groq / OpenRouter / Z.AI /
// Heuristic). The Agent X client (a client component) can't import
// `getProviderName` directly because `@/lib/llm` reads env vars that
// only exist server-side — so it pings this endpoint on activation to
// render a small "POWERED BY <provider>" badge in the header.
//
// Response: { provider: string }

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getProviderName } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ provider: getProviderName() });
}
