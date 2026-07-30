import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/credentials/[id] — permanently delete a credential + wipe ciphertext.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

// GET /api/credentials/[id] — metadata + audit history (NEVER the secret).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    created_at: cred.createdAt.toISOString(),
    last_used_at: cred.lastUsedAt?.toISOString() ?? null,
    audits: cred.audits.map((a) => ({
      id: a.id,
      action: a.action,
      context: a.context,
      created_at: a.createdAt.toISOString(),
    })),
    // NO secret fields
  });
}
