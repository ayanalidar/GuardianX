import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cloneRepoWithCredential, cleanupClone } from "@/lib/sentinel/git";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/git/explore
// Body: { credentialId, repoUrl }
// Clones the repo (shallow), returns the list of scannable source files, then
// cleans up the clone. The decrypted token never leaves the server.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const credentialId =
    typeof body.credentialId === "string" ? body.credentialId : "";
  const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";

  if (!credentialId)
    return NextResponse.json({ error: "credentialId required" }, { status: 400 });
  if (!repoUrl)
    return NextResponse.json({ error: "repoUrl required" }, { status: 400 });

  const cred = await db.credential.findUnique({ where: { id: credentialId } });
  if (!cred)
    return NextResponse.json({ error: "credential not found" }, { status: 404 });

  let dir: string | null = null;
  try {
    const clone = await cloneRepoWithCredential(credentialId, repoUrl, { depth: 1 });
    dir = clone.dir;
    return NextResponse.json({
      repo_url: repoUrl,
      file_count: clone.files.length,
      files: clone.files.map((f) => ({ path: f.path, size: f.size })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (dir) await cleanupClone(dir);
  }
}
