import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/sentinel/crypto";

export const dynamic = "force-dynamic";

// GET /api/credentials — list all credentials (metadata only, NEVER secrets).
export async function GET() {
  const creds = await db.credential.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { audits: true } },
    },
  });
  return NextResponse.json(
    (creds || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      target: c.target,
      username: c.username,
      created_at: (c.createdAt as Date).toISOString(),
      last_used_at: c.lastUsedAt ? (c.lastUsedAt as Date).toISOString() : null,
      audit_count: (c._count as Record<string, number>)?.audits ?? 0,
      // explicitly NO secret fields returned
    }))
  );
}

// POST /api/credentials — add a credential (encrypts the token at rest).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const kind =
    typeof body.kind === "string" && ["github", "gitlab", "git"].includes(body.kind)
      ? body.kind
      : "github";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  const token = typeof body.token === "string" ? body.token : "";
  const username =
    typeof body.username === "string" && body.username.trim()
      ? body.username.trim()
      : null;

  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const enc = encryptSecret(token);

  const cred = await db.credential.create({
    data: {
      label,
      kind,
      target,
      username,
      secretCipher: enc.cipher,
      secretIv: enc.iv,
      secretTag: enc.tag,
    },
  });

  await db.credentialAudit.create({
    data: { credentialId: cred.id, action: "created", context: `label="${label}" target=${target}` },
  });

  return NextResponse.json(
    {
      id: cred.id,
      label: cred.label,
      kind: cred.kind,
      target: cred.target,
      username: cred.username,
      created_at: cred.createdAt.toISOString(),
      message: "Credential added. The token is encrypted at rest and will never be shown again.",
    },
    { status: 201 }
  );
}
