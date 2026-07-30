// Git integration: clone a remote repo using a stored credential, list
// scannable files, and read a specific file. All clones go to an isolated
// temp directory that is cleaned up after use.
//
// Security: the decrypted token is used ONLY to build the clone URL passed to
// the git child process. It is never logged, never returned in any API
// response, and the buffer is discarded once the clone completes.

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, extname } from "node:path";
import { db } from "@/lib/db";
import {
  decryptSecret,
  buildAuthedCloneUrl,
  type EncryptedSecret,
} from "./crypto";

export interface ClonedFile {
  path: string; // repo-relative path, e.g. "src/auth/login.js"
  size: number;
}

export interface CloneResult {
  dir: string; // temp dir (caller must clean up)
  files: ClonedFile[];
  repoUrl: string;
}

const SCANNABLE_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".php",
]);

// directories we never want to scan
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "vendor",
  "__pycache__",
  ".cache",
]);

const MAX_FILE_SIZE = 256 * 1024; // 256 KB — skip huge generated files

async function runGit(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: cwd,
        // Disable any host-level credential helpers / SSH agents so the
        // token in the URL is the only auth source. Also avoid writing to
        // the user's global git config.
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "/bin/true",
        GIT_SSH_COMMAND: "/bin/false",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
    child.on("error", () => resolve({ code: -1, stderr: stderr + "\nspawn error" }));
  });
}

/**
 * Clone a repo using a stored credential. Returns the temp dir + a list of
 * scannable files. The CALLER is responsible for cleaning up `dir`.
 * Records an audit entry + updates lastUsedAt.
 */
export async function cloneRepoWithCredential(
  credentialId: string,
  repoUrl: string,
  opts: { depth?: number } = {}
): Promise<CloneResult> {
  const cred = await db.credential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new Error("Credential not found");

  const decrypted = decryptSecret({
    cipher: cred.secretCipher,
    iv: cred.secretIv,
    tag: cred.secretTag,
  } satisfies EncryptedSecret);

  await db.credentialAudit.create({
    data: {
      credentialId: cred.id,
      action: "decrypted",
      context: `clone ${repoUrl}`,
    },
  });

  const authedUrl = buildAuthedCloneUrl(repoUrl, cred.kind, decrypted, cred.username);
  const dir = await mkdtemp(join(tmpdir(), "sentinel-clone-"));

  const depth = opts.depth ?? 1;
  const result = await runGit(
    ["clone", "--depth", String(depth), "--quiet", authedUrl, dir],
    dir
  );

  if (result.code !== 0) {
    // Clean up + audit the failure. Never include the token in the error.
    await rm(dir, { recursive: true, force: true }).catch(() => null);
    const safeErr = result.stderr
      .replace(/https?:\/\/[^\s@]+@[^\s]+/g, "https://<redacted>")
      .trim();
    throw new Error(
      `git clone failed (exit ${result.code}): ${safeErr || "unknown error"}`
    );
  }

  await db.credential.update({
    where: { id: cred.id },
    data: { lastUsedAt: new Date() },
  });
  await db.credentialAudit.create({
    data: {
      credentialId: cred.id,
      action: "used",
      context: `cloned ${repoUrl}`,
    },
  });

  const files = await listScannableFiles(dir, dir);
  return { dir, files, repoUrl };
}

/** Recursively list scannable source files under a directory. */
async function listScannableFiles(
  root: string,
  current: string
): Promise<ClonedFile[]> {
  const out: ClonedFile[] = [];
  let entries: string[];
  try {
    entries = await readdir(current);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".") continue;
    const full = join(current, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      out.push(...(await listScannableFiles(root, full)));
    } else if (s.isFile() && SCANNABLE_EXTS.has(extname(name))) {
      if (s.size > MAX_FILE_SIZE) continue;
      out.push({ path: relative(root, full), size: s.size });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Read a single file from an already-cloned dir. */
export async function readFileFromClone(
  cloneDir: string,
  filePath: string
): Promise<string> {
  // Prevent path traversal outside the clone dir.
  const safe = join(cloneDir, filePath);
  const root = join(cloneDir);
  if (!safe.startsWith(root)) {
    throw new Error("path traversal blocked");
  }
  return readFile(safe, "utf8");
}

/** Remove a cloned temp dir. */
export async function cleanupClone(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => null);
}
