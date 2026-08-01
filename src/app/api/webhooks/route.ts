import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/webhooks — list all webhook configs
export async function GET() {
  const webhooks = await db.webhookConfig.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(webhooks.map(w => ({ ...w, events: JSON.parse(w.events || "[]"), secret: w.secret ? "***" : null })));
}

// POST /api/webhooks — create a webhook
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, url, events, secret } = body;
  if (!name || !url) return NextResponse.json({ error: "name and url required" }, { status: 400 });
  const w = await db.webhookConfig.create({ data: { name, url, events: JSON.stringify(events || []), secret: secret || null } });
  return NextResponse.json({ id: w.id, message: "Webhook configured" }, { status: 201 });
}

// DELETE /api/webhooks?id=xxx
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.webhookConfig.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
