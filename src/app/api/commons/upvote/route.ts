import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/commons/upvote — upvote a community rule. Auth required.
//
// Body: { ruleId: string }
// Behavior:
//   - Idempotent: if the user has already upvoted, returns ok without
//     incrementing the count again (RuleUpvote has @@unique([ruleId, userId])).
//   - On first upvote: creates a RuleUpvote row + increments rule.upvotes.
//   - If `action: "remove"` is in the body, reverses the upvote instead.
//
// Returns: { ok: true, upvotes: number, upvoted: boolean }
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ruleId = String(body.ruleId || "").trim();
  const action = body.action === "remove" ? "remove" : "add";
  if (!ruleId) {
    return NextResponse.json({ error: "Missing ruleId." }, { status: 400 });
  }

  try {
    const rule = await db.communityRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    }

    const existing = await db.ruleUpvote.findUnique({
      where: { ruleId_userId: { ruleId, userId: auth.user.userId } },
    });

    if (action === "remove") {
      if (!existing) {
        return NextResponse.json({ ok: true, upvotes: rule.upvotes, upvoted: false });
      }
      await db.ruleUpvote.delete({ where: { id: existing.id } });
      const updated = await db.communityRule.update({
        where: { id: ruleId },
        data: { upvotes: Math.max(0, rule.upvotes - 1) },
      });
      return NextResponse.json({ ok: true, upvotes: updated.upvotes, upvoted: false });
    }

    // action === "add"
    if (existing) {
      return NextResponse.json({ ok: true, upvotes: rule.upvotes, upvoted: true });
    }
    await db.ruleUpvote.create({
      data: { ruleId, userId: auth.user.userId },
    });
    const updated = await db.communityRule.update({
      where: { id: ruleId },
      data: { upvotes: rule.upvotes + 1 },
    });
    return NextResponse.json({ ok: true, upvotes: updated.upvotes, upvoted: true });
  } catch (err) {
    console.error("[commons/upvote] error:", err);
    return NextResponse.json(
      { error: "Failed to upvote rule." },
      { status: 500 }
    );
  }
}
