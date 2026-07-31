import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/alerts — list alert rules
export async function GET() {
  const rules = await db.alertRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rules.map(r => ({ ...r, channelConfig: r.channelConfig ? JSON.parse(r.channelConfig) : null })));
}

// POST /api/alerts — create an alert rule
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, condition, channel, channelConfig } = body;
  if (!name || !condition || !channel) return NextResponse.json({ error: "name, condition, channel required" }, { status: 400 });
  const r = await db.alertRule.create({ data: { name, condition, channel, channelConfig: JSON.stringify(channelConfig || {}) } });
  return NextResponse.json({ id: r.id, message: "Alert rule created" }, { status: 201 });
}

// POST /api/alerts/trigger — internally triggered by other APIs
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { event, data } = body;
  const rules = await db.alertRule.findMany({ where: { isActive: true } });
  let triggered = 0;
  for (const rule of rules) {
    // Simple condition matching: "severity==critical" or "posture_score<50"
    const match = evaluateCondition(rule.condition, data);
    if (match) {
      await db.alertRule.update({ where: { id: rule.id }, data: { lastTriggered: new Date() } });
      await db.auditLog.create({ data: { action: "alert_triggered", entity: rule.id, details: JSON.stringify({ event, data }) } });
      // Fire webhook/email/slack (simplified — in production this would be async queue)
      triggered++;
    }
  }
  return NextResponse.json({ triggered, totalRules: rules.length });
}

function evaluateCondition(condition: string, data: Record<string, unknown>): boolean {
  try {
    const parts = condition.match(/(\w+)\s*(==|!=|<|>|<=|>=)\s*(.+)/);
    if (!parts) return false;
    const [, field, op, val] = parts;
    const actual = data[field];
    const expected = val.trim().replace(/['"]/g, "");
    switch (op) {
      case "==": return String(actual) === expected;
      case "!=": return String(actual) !== expected;
      case "<": return Number(actual) < Number(expected);
      case ">": return Number(actual) > Number(expected);
      default: return false;
    }
  } catch { return false; }
}
