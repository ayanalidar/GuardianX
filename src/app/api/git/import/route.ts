import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  cloneRepoWithCredential,
  readFileFromClone,
  cleanupClone,
} from "@/lib/sentinel/git";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/git/import
// Body: { credentialId, repoUrl, filePath, name? }
// Clones the repo, reads the chosen file, creates a Codebase from it, cleans up.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const credentialId =
    typeof body.credentialId === "string" ? body.credentialId : "";
  const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
  const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : filePath.split("/").pop() || "imported.js";

  if (!credentialId || !repoUrl || !filePath)
    return NextResponse.json(
      { error: "credentialId, repoUrl, and filePath are required" },
      { status: 400 }
    );

  let dir: string | null = null;
  try {
    const clone = await cloneRepoWithCredential(credentialId, repoUrl, { depth: 1 });
    dir = clone.dir;

    const source = await readFileFromClone(dir, filePath);
    if (!source.trim())
      return NextResponse.json({ error: "file is empty" }, { status: 400 });

    const cb = await db.codebase.create({
      data: {
        name,
        language: "javascript",
        description: `Imported from ${repoUrl} → ${filePath}`,
        sourceCode: source,
      },
    });

    return NextResponse.json(
      {
        id: cb.id,
        name: cb.name,
        description: cb.description,
        created_at: cb.createdAt.toISOString(),
        source_lines: source.split("\n").length,
        message: `Imported ${filePath} from ${repoUrl}`,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (dir) await cleanupClone(dir);
  }
}
