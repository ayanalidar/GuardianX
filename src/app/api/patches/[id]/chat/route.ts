import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatAboutPatch } from "@/lib/sentinel/engine/ai";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/patches/[id]/chat, talk to the AI about this patch.
// Body: { message: string }
export async function POST(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message)
    return NextResponse.json({ error: "message required" }, { status: 400 });

  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: {
      codebase: { select: { name: true } },
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found" }, { status: 404 });

  // persist the user's message
  await db.chatMessage.create({
    data: { patchId: patch.id, role: "user", content: message },
  });

  const systemContext = [
    `Patch: ${patch.patchId}, ${patch.title}`,
    `Severity: ${patch.severity}${patch.cve ? ` | ${patch.cve}` : ""}`,
    `File: ${patch.affectedFile}`,
    `AI confidence: ${(patch.confidence * 100).toFixed(0)}%`,
    `Sandbox: ${patch.sandboxPassed ? "PASSED" : "FAILED"}`,
    "",
    "AI explanation:",
    patch.aiExplanation,
    "",
    "AI reasoning:",
    patch.aiReasoning,
    "",
    "Original code:",
    "```js",
    patch.originalCode,
    "```",
    "",
    "Patched code:",
    "```js",
    patch.patchedCode,
    "```",
  ].join("\n");

  // history excludes the just-added user message
  const history = patch.chatMessages
    .filter((m) => !(m.role === "user" && m.content === message))
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  let reply: string;
  try {
    reply = await chatAboutPatch(systemContext, history, message);
  } catch (err) {
    reply = `(AI unavailable: ${err instanceof Error ? err.message : "unknown error"})`;
  }

  await db.chatMessage.create({
    data: { patchId: patch.id, role: "assistant", content: reply },
  });

  return NextResponse.json({
    role: "assistant",
    content: reply,
    created_at: new Date().toISOString(),
  });
}
