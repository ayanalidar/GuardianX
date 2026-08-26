import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/clients/[id], full client detail with all assets
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;

  try {
    const client = await db.client.findUnique({
      where: { id },
      include: {
        codebases: { select: { id: true, name: true, language: true, description: true, createdAt: true } },
        targets: { select: { id: true, name: true, baseUrl: true, authorized: true, createdAt: true } },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: client.id,
      name: client.name,
      description: client.description,
      contact_name: client.contactName,
      contact_email: client.contactEmail,
      contact_phone: client.contactPhone,
      target_url: client.targetUrl,
      repo_url: client.repoUrl,
      scope: client.scope,
      authorized: client.authorized,
      frameworks: client.frameworks ? (client.frameworks as string).split(",").map((s) => s.trim()) : [],
      status: client.status,
      created_at: (client.createdAt as Date).toISOString(),
      codebases: ((client.codebases as Array<Record<string, unknown>>) || []).map((cb) => ({
        id: cb.id,
        name: cb.name,
        language: cb.language,
        description: cb.description,
        created_at: (cb.createdAt as Date).toISOString(),
      })),
      targets: ((client.targets as Array<Record<string, unknown>>) || []).map((t) => ({
        id: t.id,
        name: t.name,
        base_url: t.baseUrl,
        authorized: t.authorized,
        created_at: (t.createdAt as Date).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load client" },
      { status: 500 }
    );
  }
}

// PATCH /api/clients/[id], update client (status, authorized, etc.)
export async function PATCH(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const data: Record<string, unknown> = {};
    const allowed = [
      "name", "description", "contactName", "contactEmail", "contactPhone",
      "targetUrl", "repoUrl", "scope", "authorized", "status", "frameworks",
    ];
    for (const key of allowed) {
      if (key in body) {
        if (key === "frameworks" && Array.isArray(body.frameworks)) {
          data.frameworks = body.frameworks.join(",");
        } else {
          data[key] = body[key];
        }
      }
    }

    const updated = await db.client.update({ where: { id }, data });
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      authorized: updated.authorized,
      message: "Client updated",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update client" },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[id]
export async function DELETE(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  try {
    await db.client.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete client" },
      { status: 500 }
    );
  }
}
