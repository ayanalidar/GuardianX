import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/credentials/[id], permanently delete a credential + wipe ciphertext.
export async function DELETE(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const cred = await db.credential.findUnique({ where: { id } });
  if (!cred) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.credentialAudit.create({
    data: {
      credentialId: cred.id,
      action: "deleted",
      context: `label="${cred.label}"`,
    },
  });

  await db.credential.delete({ where: { id } });
  return NextResponse.json({ ok: true, message: "Credential deleted. Ciphertext wiped." });
}

// GET /api/credentials/[id], metadata + audit history (NEVER the secret).
export async function GET(req: Request,
  { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const cred = await db.credential.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!cred) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: cred.id,
    label: cred.label,
    kind: cred.kind,
    target: cred.target,
    username: cred.username,
    created_at: (cred.createdAt as Date).toISOString(),
    last_used_at: (cred.lastUsedAt as Date | null)?.toISOString() ?? null,
    audits: (cred.audits as Array<{ id: string; action: string; context: string; createdAt: Date }>).map((a) => ({
      id: a.id,
      action: a.action,
      context: a.context,
      created_at: a.createdAt.toISOString(),
    })),
    // NO secret fields
  });
}
