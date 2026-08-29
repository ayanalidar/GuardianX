import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/commons/rules/[id] — fetch a single community rule by id.
// Public — anyone can read a rule's full definition.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing rule id." }, { status: 400 });
  }
  try {
    const rule = await db.communityRule.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    }
    return NextResponse.json({ rule });
  } catch (err) {
    console.error("[commons/rules/[id] GET] error:", err);
    return NextResponse.json({ error: "Failed to load rule." }, { status: 500 });
  }
}

// PATCH /api/commons/rules/[id] — update your own rule. Auth required.
// Only the original author can edit. Increments `version` on save so the
// commons can show a version history without losing prior snapshots.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing rule id." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const existing = await db.communityRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    }
    if (existing.authorId !== auth.user.userId) {
      return NextResponse.json(
        { error: "You can only edit your own rules." },
        { status: 403 }
      );
    }

    const data: Record<string, unknown> = { version: existing.version + 1 };
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim();
    if (typeof body.pattern === "string" && body.pattern.trim()) data.pattern = body.pattern.trim();
    if (typeof body.severity === "string") {
      const sev = body.severity.toLowerCase();
      if (!["critical", "high", "medium", "low", "info"].includes(sev)) {
        return NextResponse.json({ error: `Invalid severity "${sev}".` }, { status: 400 });
      }
      data.severity = sev;
    }
    if (typeof body.language === "string" && body.language.trim()) data.language = body.language.toLowerCase().trim();
    if (body.cwe !== undefined) data.cwe = body.cwe ? String(body.cwe).trim() : null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const updated = await db.communityRule.update({
      where: { id },
      data,
    });
    return NextResponse.json({ ok: true, rule: updated });
  } catch (err) {
    console.error("[commons/rules/[id] PATCH] error:", err);
    return NextResponse.json({ error: "Failed to update rule." }, { status: 500 });
  }
}

// DELETE /api/commons/rules/[id] — soft-delete your own rule (sets
// isActive=false). Auth required. Hard delete is intentionally avoided
// so historical findings that reference this rule keep their attribution.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing rule id." }, { status: 400 });
  }

  try {
    const existing = await db.communityRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    }
    if (existing.authorId !== auth.user.userId) {
      return NextResponse.json(
        { error: "You can only delete your own rules." },
        { status: 403 }
      );
    }

    const updated = await db.communityRule.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, rule: updated });
  } catch (err) {
    console.error("[commons/rules/[id] DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete rule." }, { status: 500 });
  }
}
