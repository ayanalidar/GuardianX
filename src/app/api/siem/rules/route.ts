import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  serializeRule,
  deserializeRule,
  getDefaultRules,
  type RuleDefinition,
} from "@/lib/siem/correlation";

export const dynamic = "force-dynamic";

// GET /api/siem/rules - list all correlation rules.
// Optional query: ?defaults=true to get the 4 built-in templates without
// touching the database (useful for the "import template" UI flow).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("defaults") === "true") {
      return NextResponse.json({
        total: 4,
        defaults: getDefaultRules(),
      });
    }

    const rows = (await db.alertRule.findMany({
      orderBy: { createdAt: "desc" },
    })) as Array<Record<string, unknown>>;

    const rules = rows.map(deserializeRule);
    return NextResponse.json({
      total: rules.length,
      rules,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list SIEM rules" },
      { status: 500 }
    );
  }
}

// POST /api/siem/rules - create a new correlation rule.
// Body: RuleDefinition (name, conditions, timeWindowSec, minMatchCount,
//                       groupBy, action, actionConfig, description, isActive)
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<RuleDefinition> & {
      importDefault?: number;
    };

    // Convenience: ?importDefault=0..3 imports one of the 4 default templates.
    if (typeof body.importDefault === "number") {
      const defaults = getDefaultRules();
      const idx = body.importDefault;
      if (idx < 0 || idx >= defaults.length) {
        return NextResponse.json(
          { error: `importDefault index out of range (0..${defaults.length - 1})` },
          { status: 400 }
        );
      }
      const rule = defaults[idx];
      const serialized = serializeRule(rule);
      const created = await db.alertRule.create({ data: serialized });
      return NextResponse.json(
        {
          id: created.id,
          name: created.name,
          message: "Default rule imported",
        },
        { status: 201 }
      );
    }

    if (!body.name || !Array.isArray(body.conditions) || body.conditions.length === 0) {
      return NextResponse.json(
        { error: "name and at least one condition are required" },
        { status: 400 }
      );
    }
    if (!body.action) {
      return NextResponse.json(
        { error: "action is required (create_incident | add_ioc | forward_alert | log_only)" },
        { status: 400 }
      );
    }

    const rule: RuleDefinition = {
      name: body.name,
      description: body.description || "",
      conditions: body.conditions,
      timeWindowSec: Number(body.timeWindowSec) || 300,
      minMatchCount: Number(body.minMatchCount) || 1,
      groupBy: body.groupBy || null,
      action: body.action,
      actionConfig: body.actionConfig || {},
      isActive: body.isActive !== false,
    };

    const serialized = serializeRule(rule);
    const created = await db.alertRule.create({ data: serialized });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        action: created.channel,
        message: "Rule created",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create SIEM rule" },
      { status: 500 }
    );
  }
}

// PATCH /api/siem/rules?id=xxx - update an existing rule (partial).
export async function PATCH(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const existing = await db.alertRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<RuleDefinition>;
    const current = deserializeRule(existing as Record<string, unknown>);

    const merged: RuleDefinition = {
      id,
      name: body.name || current.name,
      description: body.description !== undefined ? body.description : current.description,
      conditions: body.conditions || current.conditions,
      timeWindowSec: body.timeWindowSec !== undefined ? Number(body.timeWindowSec) : current.timeWindowSec,
      minMatchCount: body.minMatchCount !== undefined ? Number(body.minMatchCount) : current.minMatchCount,
      groupBy: body.groupBy !== undefined ? body.groupBy : current.groupBy,
      action: body.action || current.action,
      actionConfig: body.actionConfig || current.actionConfig,
      isActive: body.isActive !== undefined ? body.isActive : current.isActive,
    };

    const serialized = serializeRule(merged);
    const updated = await db.alertRule.update({
      where: { id },
      data: serialized,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      message: "Rule updated",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update SIEM rule" },
      { status: 500 }
    );
  }
}

// DELETE /api/siem/rules?id=xxx - delete a rule.
export async function DELETE(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const existing = await db.alertRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await db.alertRule.delete({ where: { id } });
    return NextResponse.json({ id, message: "Rule deleted" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete SIEM rule" },
      { status: 500 }
    );
  }
}
