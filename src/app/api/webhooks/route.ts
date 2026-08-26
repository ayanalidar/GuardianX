import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/webhooks, list all webhook configs
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const webhooks = await db.webhookConfig.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json((webhooks || []).map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events ? (w.events as string).split(",") : [],
      is_active: w.isActive,
      created_at: (w.createdAt as Date).toISOString(),
    })));
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/webhooks, create a webhook config
// Body: { name, url, events: string[] }
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { name, url, events } = await req.json().catch(() => ({}));
  if (!name || !url) return NextResponse.json({ error: "name and url required" }, { status: 400 });

  try {
    const webhook = await db.webhookConfig.create({
      data: {
        id: randomUUID(),
        name,
        url,
        events: Array.isArray(events) ? events.join(",") : events || "*",
        isActive: true,
      },
    });
    return NextResponse.json({ id: webhook.id, message: "Webhook configured" }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/webhooks?id=xxx
export async function DELETE(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await db.webhookConfig.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
