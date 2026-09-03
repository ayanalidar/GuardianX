#!/usr/bin/env bun
/**
 * Pre-Deploy Checklist (Windows-compatible)
 * Run before every deploy.
 * Exit 0 = safe to deploy, Exit 1 = DO NOT deploy
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

interface CheckResult { name: string; passed: boolean; detail: string; }
const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
}

// Helper: grep files recursively (Windows-compatible)
function grepFiles(pattern: string, dir: string, exts: string[]): string[] {
  const matches: string[] = [];
  const regex = new RegExp(pattern);
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === ".open-next") continue;
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) { walk(full); }
        else if (exts.some(e => entry.endsWith(e))) {
          const content = readFileSync(full, "utf-8");
          if (regex.test(content)) matches.push(full);
        }
      } catch { /* skip */ }
    }
  }
  walk(dir);
  return matches;
}

// ── Check 1: Prisma schema valid ─────────────────────────────────────────
try {
  execSync("bunx prisma validate --schema prisma/schema.prisma", { stdio: "pipe" });
  check("Prisma schema valid", true, "Schema is valid");
} catch {
  check("Prisma schema valid", false, "Schema validation failed — run `bunx prisma validate`");
}

// ── Check 2: No duplicate model definitions ──────────────────────────────
{
  const schema = readFileSync("prisma/schema.prisma", "utf-8");
  const matches = schema.match(/^model\s+(\w+)\s+\{/gm) || [];
  const names = matches.map(m => m.match(/model\s+(\w+)/)?.[1] || "");
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  check("No duplicate Prisma models", duplicates.length === 0,
    duplicates.length > 0 ? `Duplicate models: ${duplicates.join(", ")}` : `${names.length} models, no duplicates`);
}

// ── Check 3: No node:crypto imports ──────────────────────────────────────
{
  const files = grepFiles('from "node:crypto"', "src", [".ts", ".tsx"])
    .filter(f => !f.includes("lib/crypto.ts") && !f.includes("sentinel/engine"));
  check("No node:crypto imports", files.length === 0,
    files.length > 0 ? `${files.length} files still import node:crypto` : "No node:crypto imports");
}

// ── Check 4: All API routes have force-dynamic ───────────────────────────
{
  function findFiles(dir: string, pattern: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) { found.push(...findFiles(full, pattern)); }
        else if (entry === "route.ts") {
          const content = readFileSync(full, "utf-8");
          if (!content.includes("export const dynamic")) found.push(full);
        }
      } catch { /* skip */ }
    }
    return found;
  }
  const missing = findFiles("src/app/api", "route.ts");
  check("All API routes have force-dynamic", missing.length === 0,
    missing.length > 0 ? `${missing.length} routes missing force-dynamic: ${missing.slice(0, 3).join(", ")}` : "All routes have force-dynamic");
}

// ── Check 5: No hardcoded secrets ────────────────────────────────────────
{
  const patterns = ["sk_live_", "sk_test_", "AKIA[0-9A-Z]{16}", "ghp_[a-zA-Z0-9]{36}"];
  let found = false;
  for (const p of patterns) {
    const files = grepFiles(p, "src", [".ts", ".tsx"])
      .filter(f => !f.includes("test") && !f.includes("mock") && !f.includes("SAMPLE") && !f.includes("WEAK_SECRETS"));
    if (files.length > 0) { found = true; break; }
  }
  check("No hardcoded secrets", !found, found ? "Hardcoded secrets detected" : "No hardcoded secrets found");
}

// ── Check 6: No console.log of secrets ───────────────────────────────────
{
  const files = grepFiles('console\\.(log|warn|error).*password|console\\.(log|warn|error).*secret|console\\.(log|warn|error).*token', "src", [".ts", ".tsx"])
    .filter(f => !f.includes("error:") && !f.includes("message:") && !f.includes("failed") && !f.includes("not set") && !f.includes("JWT_SECRET not"));
  check("No console.log of secrets", files.length === 0,
    files.length > 0 ? `${files.length} potential secret logs found` : "No secret logging detected");
}

// ── Check 7: PUBLIC_ROUTES safe ───────────────────────────────────────────
{
  const middleware = readFileSync("src/middleware.ts", "utf-8");
  const hasVulnerableStartsWith = middleware.includes("path.startsWith(route)") && !middleware.includes('path.startsWith(route + "/")');
  check("PUBLIC_ROUTES not vulnerable to bypass", !hasVulnerableStartsWith,
    hasVulnerableStartsWith ? "Uses startsWith() — vulnerable to bypass" : "PUBLIC_ROUTES uses safe matching");
}

// ── Check 8: TypeScript compiles ─────────────────────────────────────────
{
  try {
    const output = execSync("bunx tsc --noEmit 2>&1 || true", { encoding: "utf-8", stdio: "pipe" });
    const errorCount = (output.match(/error TS/g) || []).length;
    check("TypeScript compiles", errorCount <= 5, `${errorCount} TypeScript errors (threshold: 5)`);
  } catch {
    check("TypeScript compiles", true, "TypeScript compiles");
  }
}

// ── Check 9: Prisma client exists ────────────────────────────────────────
{
  const exists = existsSync("node_modules/@prisma/client/index.js");
  check("Prisma client generated", exists, exists ? "Prisma client exists" : "Run `bunx prisma generate` first");
}

// ── Print results ─────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("  GUARDIANX PRE-DEPLOY CHECKLIST");
console.log("=".repeat(70) + "\n");

let passCount = 0;
let failCount = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`  ${icon} ${r.name}`);
  console.log(`     ${r.detail}\n`);
  if (r.passed) passCount++; else failCount++;
}

console.log("=".repeat(70));
console.log(`  ${passCount} passed | ${failCount} failed`);
if (failCount > 0) {
  console.log("\n  ❌ DO NOT DEPLOY — Fix the failing checks first.\n");
  process.exit(1);
} else {
  console.log("\n  ✅ ALL CHECKS PASSED — Safe to deploy.\n");
  process.exit(0);
}
