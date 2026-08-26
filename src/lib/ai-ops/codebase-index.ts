// GuardianX AI Ops - Codebase Index
//
// Scans the project src/ tree and extracts a structured inventory:
//   - files (path, size, lines, type)
//   - routes (HTTP method + path) discovered in src/app/api/**
//   - components exported from src/components/**
//   - lib modules exported from src/lib/**
//   - pages under src/app/**
//   - prisma models (best-effort parse of prisma/schema.prisma)
//
// The result is suitable for inclusion in an AI system prompt so the
// diagnostic agent can answer questions like "where is the login route
// defined?" without having to grep the filesystem on every turn.

import * as fs from "node:fs";
import * as path from "node:path";

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, "src");
const PRISMA_SCHEMA = path.join(PROJECT_ROOT, "prisma", "schema.prisma");

export interface CodebaseFile {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  type: "typescript" | "tsx" | "javascript" | "json" | "css" | "prisma" | "markdown" | "other";
}

export interface CodebaseRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  path: string;
  file: string;
  hasAuth: boolean;
}

export interface CodebaseExport {
  name: string;
  kind: "function" | "const" | "class" | "interface" | "type" | "default";
  file: string;
}

export interface CodebasePage {
  path: string;
  file: string;
  isDynamic: boolean;
}

export interface PrismaModelInfo {
  name: string;
  fields: string[];
}

export interface CodebaseIndex {
  files: CodebaseFile[];
  routes: CodebaseRoute[];
  components: CodebaseExport[];
  libs: CodebaseExport[];
  pages: CodebasePage[];
  models: PrismaModelInfo[];
  summary: {
    totalFiles: number;
    totalLines: number;
    routeCount: number;
    componentCount: number;
    libCount: number;
    pageCount: number;
    modelCount: number;
    scannedAt: string;
  };
}

function detectType(filePath: string): CodebaseFile["type"] {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".jsx")) return "javascript";
  if (filePath.endsWith(".js")) return "javascript";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".css")) return "css";
  if (filePath.endsWith(".prisma")) return "prisma";
  if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) return "markdown";
  return "other";
}

function walk(dir: string, acc: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function readExports(content: string, file: string): CodebaseExport[] {
  const out: CodebaseExport[] = [];
  const patterns: Array<{ re: RegExp; kind: CodebaseExport["kind"] }> = [
    { re: /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: "default" },
    { re: /export\s+default\s+([A-Za-z_$][\w$]*)\s*=/g, kind: "default" },
    { re: /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: "function" },
    { re: /export\s+class\s+([A-Za-z_$][\w$]*)/g, kind: "class" },
    { re: /export\s+interface\s+([A-Za-z_$][\w$]*)/g, kind: "interface" },
    { re: /export\s+type\s+([A-Za-z_$][\w$]*)\s*=/g, kind: "type" },
    { re: /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g, kind: "const" },
  ];
  for (const { re, kind } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      out.push({ name: m[1], kind, file });
    }
  }
  return out;
}

function extractRoutes(content: string, file: string): CodebaseRoute[] {
  const out: CodebaseRoute[] = [];
  // Convert src/app/api/foo/bar/route.ts -> /api/foo/bar
  const m = file.replace(/\\/g, "/").match(/src\/app\/((?:.*\/)?)route\.(ts|tsx|js)$/);
  if (!m) return out;
  const segment = m[1]; // e.g. "api/clients/" or "api/incidents/[id]/contain/"
  // Strip trailing slash
  const trimmed = segment.replace(/\/$/, "");
  // Replace [id] -> {id} for readability
  const cleanPath = "/" + trimmed.replace(/\[([^\]]+)\]/g, "{$1}");
  const hasAuth = /requireAuth|requireAdmin|getUserFromRequest/.test(content);
  const methods: Array<{ method: CodebaseRoute["method"]; re: RegExp }> = [
    { method: "GET", re: /export\s+(?:async\s+)?function\s+GET/ },
    { method: "POST", re: /export\s+(?:async\s+)?function\s+POST/ },
    { method: "PUT", re: /export\s+(?:async\s+)?function\s+PUT/ },
    { method: "PATCH", re: /export\s+(?:async\s+)?function\s+PATCH/ },
    { method: "DELETE", re: /export\s+(?:async\s+)?function\s+DELETE/ },
    { method: "OPTIONS", re: /export\s+(?:async\s+)?function\s+OPTIONS/ },
  ];
  for (const { method, re } of methods) {
    if (re.test(content)) {
      out.push({ method, path: cleanPath, file, hasAuth });
    }
  }
  return out;
}

function extractPages(files: string[]): CodebasePage[] {
  const pages: CodebasePage[] = [];
  for (const file of files) {
    const norm = file.replace(/\\/g, "/");
    const m = norm.match(/src\/app\/(.*)page\.(tsx|ts|jsx|js)$/);
    if (!m) continue;
    const segment = m[1].replace(/\/$/, "");
    const cleanPath = "/" + segment.replace(/\[([^\]]+)\]/g, "{$1}");
    pages.push({
      path: cleanPath,
      file: norm,
      isDynamic: /\[[^\]]+\]/.test(segment),
    });
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}

function extractModels(): PrismaModelInfo[] {
  let content: string;
  try {
    content = fs.readFileSync(PRISMA_SCHEMA, "utf8");
  } catch {
    return [];
  }
  const out: PrismaModelInfo[] = [];
  const re = /model\s+([A-Za-z_][\w]*)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0])
      .filter(Boolean);
    out.push({ name, fields });
  }
  return out;
}

/**
 * Build (and cache in-memory) the full codebase index. Re-scans at most
 * once every CODEBASE_TTL_MS to avoid re-reading the filesystem on every
 * call to the AI agent.
 */
let cached: CodebaseIndex | null = null;
let cachedAt = 0;
const CODEBASE_TTL_MS = 60_000; // 1 minute

export function getCodebaseIndex(force = false): CodebaseIndex {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CODEBASE_TTL_MS) {
    return cached;
  }

  const allFiles: string[] = [];
  walk(SRC_ROOT, allFiles);

  const files: CodebaseFile[] = [];
  const routes: CodebaseRoute[] = [];
  const components: CodebaseExport[] = [];
  const libs: CodebaseExport[] = [];
  let totalLines = 0;

  for (const full of allFiles) {
    const rel = path.relative(PROJECT_ROOT, full).replace(/\\/g, "/");
    const type = detectType(full);
    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = countLines(content);
    totalLines += lines;
    files.push({ path: full, relativePath: rel, size: content.length, lines, type });

    // Routes
    if (/route\.(ts|tsx|js)$/.test(full)) {
      routes.push(...extractRoutes(content, rel));
    }

    // Components
    if (rel.startsWith("src/components/")) {
      components.push(...readExports(content, rel));
    }

    // Libs
    if (rel.startsWith("src/lib/")) {
      libs.push(...readExports(content, rel));
    }
  }

  const pages = extractPages(allFiles);
  const models = extractModels();

  cached = {
    files: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    components: components.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
    libs: libs.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
    pages,
    models,
    summary: {
      totalFiles: files.length,
      totalLines,
      routeCount: routes.length,
      componentCount: components.length,
      libCount: libs.length,
      pageCount: pages.length,
      modelCount: models.length,
      scannedAt: new Date().toISOString(),
    },
  };
  cachedAt = now;
  return cached;
}

/**
 * Compact text summary of the codebase, intended for inclusion in an AI
 * system prompt. Stays under ~4 KB so it leaves room for the user's
 * actual question.
 */
export function getCodebaseSummary(): string {
  const idx = getCodebaseIndex();
  const lines: string[] = [];

  lines.push("GuardianX codebase map:");
  lines.push(
    `- ${idx.summary.totalFiles} files, ${idx.summary.totalLines} lines of code`
  );
  lines.push(
    `- ${idx.summary.routeCount} API routes, ${idx.summary.componentCount} component exports, ${idx.summary.libCount} lib exports, ${idx.summary.pageCount} pages, ${idx.summary.modelCount} prisma models`
  );

  lines.push("");
  lines.push("API routes (method path [file]):");
  for (const r of idx.routes.slice(0, 200)) {
    lines.push(`  ${r.method} ${r.path}${r.hasAuth ? " (auth)" : ""}  <- ${r.file}`);
  }
  if (idx.routes.length > 200) {
    lines.push(`  ... and ${idx.routes.length - 200} more`);
  }

  lines.push("");
  lines.push("Prisma models:");
  for (const m of idx.models) {
    lines.push(`  ${m.name} { ${m.fields.slice(0, 12).join(", ")}${m.fields.length > 12 ? ", ..." : ""} }`);
  }

  lines.push("");
  lines.push("Pages:");
  for (const p of idx.pages) {
    lines.push(`  ${p.path}${p.isDynamic ? " (dynamic)" : ""}`);
  }

  lines.push("");
  lines.push("Lib modules (top 80):");
  for (const l of idx.libs.slice(0, 80)) {
    lines.push(`  ${l.kind} ${l.name}  <- ${l.file}`);
  }
  if (idx.libs.length > 80) {
    lines.push(`  ... and ${idx.libs.length - 80} more`);
  }

  return lines.join("\n");
}

/**
 * Read the source of a single file. Used by the diagnostic agent to pull
 * in the relevant file when explaining a failure. Refuses to read files
 * outside the project root.
 */
export function readFileSource(relPath: string): { path: string; content: string; lines: number } | null {
  // Normalize and prevent path traversal
  const norm = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
  const full = path.isAbsolute(norm) ? norm : path.join(PROJECT_ROOT, norm);
  if (!full.startsWith(PROJECT_ROOT)) return null;
  try {
    const content = fs.readFileSync(full, "utf8");
    return {
      path: path.relative(PROJECT_ROOT, full).replace(/\\/g, "/"),
      content,
      lines: countLines(content),
    };
  } catch {
    return null;
  }
}

/**
 * Forget the cached index. Used by the "reindex_codebase" self-heal action.
 */
export function invalidateCodebaseIndex(): void {
  cached = null;
  cachedAt = 0;
}
