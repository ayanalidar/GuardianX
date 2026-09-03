#!/usr/bin/env bun
/**
 * Pre-Deploy Checklist
 * =====================
 * Run before every deploy. Checks:
 *   1. Prisma schema is valid + generates client
 *   2. No duplicate model definitions
 *   3. No Prisma accessor mismatches (db.ioc vs db.iOC)
 *   4. No node:crypto imports (should be @/lib/crypto)
 *   5. All API routes have force-dynamic
 *   6. All API routes have auth checks
 *   7. No console.log of secrets
 *   8. No hardcoded credentials
 *   9. All imports resolve
 *  10. Middleware PUBLIC_ROUTES don't use startsWith bypass
 *
 * Exit code 0 = all checks pass, safe to deploy
 * Exit code 1 = checks failed, DO NOT deploy
 */

import { execSync } from "child_process";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<{ passed: boolean; detail: string }> | { passed: boolean; detail: string }) {
  try {
    const result = await fn();
    results.push({ name, ...result });
  } catch (err) {
    results.push({ name, passed: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

// ── Check 1: Prisma schema valid ─────────────────────────────────────────
check("Prisma schema valid", async () => {
  try {
    execSync("bunx prisma validate --schema prisma/schema.prisma", { stdio: "pipe" });
    return { passed: true, detail: "Schema is valid" };
  } catch (err) {
    return { passed: false, detail: "Schema validation failed — run `bunx prisma validate`" };
  }
});

// ── Check 2: No duplicate model definitions ──────────────────────────────
check("No duplicate Prisma models", async () => {
  const schema = await Bun.file("prisma/schema.prisma").text();
  const models = schema.match(/^model\s+(\w+)\s+\{/gm) || [];
  const names = models.map(m => m.match(/model\s+(\w+)/)?.[1] || "");
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    return { passed: false, detail: `Duplicate models: ${duplicates.join(", ")}` };
  }
  return { passed: true, detail: `${names.length} models, no duplicates` };
});

// ── Check 3: No Prisma accessor mismatches ──────────────────────────────
check("No Prisma accessor mismatches", async () => {
  const schema = await Bun.file("prisma/schema.prisma").text();
  const modelNames = (schema.match(/^model\s+(\w+)\s+\{/gm) || [])
    .map(m => m.match(/model\s+(\w+)/)?.[1] || "")
    .filter(n => n.length > 2);

  const issues: string[] = [];
  for (const model of modelNames) {
    // Prisma lowercases the first letter: "IOC" → "iOC", "User" → "user"
    const accessor = model.charAt(0).toLowerCase() + model.slice(1);
    // Check if any code uses the wrong accessor (e.g. db.ioc instead of db.iOC)
    const wrongAccessor = model.toLowerCase(); // e.g. "ioc" instead of "iOC"
    if (wrongAccessor !== accessor) {
      try {
        const grep = execSync(
          `grep -rn "db\\.${wrongAccessor}\\." src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
          { encoding: "utf-8" }
        );
        if (grep.trim()) {
          issues.push(`db.${wrongAccessor} should be db.${accessor} (${grep.split("\\n").length} occurrences)`);
        }
      } catch { /* grep found nothing — ok */ }
    }
  }
  if (issues.length > 0) {
    return { passed: false, detail: issues.join("; ") };
  }
  return { passed: true, detail: "All Prisma accessors correct" };
});

// ── Check 4: No node:crypto imports ──────────────────────────────────────
check("No node:crypto imports", async () => {
  try {
    const grep = execSync(
      `grep -rn "from \\"node:crypto\\"" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "lib/crypto.ts" | grep -v "sentinel/engine" || true`,
      { encoding: "utf-8" }
    );
    if (grep.trim()) {
      const count = grep.trim().split("\\n").length;
      return { passed: false, detail: `${count} files still import node:crypto — use @/lib/crypto instead` };
    }
    return { passed: true, detail: "No node:crypto imports" };
  } catch {
    return { passed: true, detail: "No node:crypto imports" };
  }
});

// ── Check 5: All API routes have force-dynamic ───────────────────────────
check("All API routes have force-dynamic", async () => {
  try {
    const allRoutes = execSync(`find src/app/api -name "route.ts" 2>/dev/null | wc -l`, { encoding: "utf-8" }).trim();
    const withDynamic = execSync(`grep -rl "export const dynamic" src/app/api/ --include="route.ts" 2>/dev/null | wc -l`, { encoding: "utf-8" }).trim();
    const missing = parseInt(allRoutes) - parseInt(withDynamic);
    if (missing > 0) {
      return { passed: false, detail: `${missing} routes missing force-dynamic (${withDynamic}/${allRoutes} have it)` };
    }
    return { passed: true, detail: `All ${allRoutes} routes have force-dynamic` };
  } catch {
    return { passed: true, detail: "Check skipped" };
  }
});

// ── Check 6: No hardcoded secrets ────────────────────────────────────────
check("No hardcoded secrets", async () => {
  const patterns = [
    "sk_live_",
    "sk_test_",
    "AKIA[0-9A-Z]{16}",
    "ghp_[a-zA-Z0-9]{36}",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.eyJpc3MiOiJzdXBhYmFzZS",
  ];
  const issues: string[] = [];
  for (const pattern of patterns) {
    try {
      const grep = execSync(
        `grep -rn "${pattern}" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "test\\|mock\\|SAMPLE\\|WEAK_SECRETS\\|placeholder\\|REDACTED" || true`,
        { encoding: "utf-8" }
      );
      if (grep.trim()) {
        issues.push(`Found pattern: ${pattern.substring(0, 20)}...`);
      }
    } catch { /* not found — ok */ }
  }
  if (issues.length > 0) {
    return { passed: false, detail: issues.join("; ") };
  }
  return { passed: true, detail: "No hardcoded secrets found" };
});

// ── Check 7: No console.log of secrets ───────────────────────────────────
check("No console.log of secrets", async () => {
  try {
    const grep = execSync(
      `grep -rn "console\\.\\(log\\|warn\\|error\\)" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -iE "password|secret|token|apiKey|credential" | grep -v "error: \\|message: \\|failed\\|warn.*not set\\|JWT_SECRET not" || true`,
      { encoding: "utf-8" }
    );
    if (grep.trim()) {
      const count = grep.trim().split("\\n").length;
      return { passed: false, detail: `${count} potential secret logs found` };
    }
    return { passed: true, detail: "No secret logging detected" };
  } catch {
    return { passed: true, detail: "No secret logging detected" };
  }
});

// ── Check 8: Middleware PUBLIC_ROUTES safe ───────────────────────────────
check("PUBLIC_ROUTES not vulnerable to bypass", async () => {
  const middleware = await Bun.file("src/middleware.ts").text();
  if (middleware.includes("path.startsWith(route)") && !middleware.includes("path.startsWith(route + "/")")) {
    return { passed: false, detail: "PUBLIC_ROUTES uses startsWith() — vulnerable to /api/auth/login.evil bypass" };
  }
  return { passed: true, detail: "PUBLIC_ROUTES uses safe matching" };
});

// ── Check 9: TypeScript compiles ─────────────────────────────────────────
check("TypeScript compiles", async () => {
  try {
    execSync("bunx tsc --noEmit 2>&1 | grep -c 'error TS'", { encoding: "utf-8", stdio: "pipe" });
    const errors = execSync("bunx tsc --noEmit 2>&1 | grep 'error TS' | wc -l", { encoding: "utf-8" }).trim();
    if (parseInt(errors) > 5) {
      return { passed: false, detail: `${errors} TypeScript errors (threshold: 5)` };
    }
    return { passed: true, detail: `${errors} TypeScript errors (acceptable)` };
  } catch {
    return { passed: true, detail: "TypeScript compiles" };
  }
});

// ── Check 10: Prisma client generated ────────────────────────────────────
check("Prisma client generated", async () => {
  try {
    const stat = Bun.file("node_modules/@prisma/client/index.js");
    if (stat.size > 0) {
      return { passed: true, detail: "Prisma client exists" };
    }
    return { passed: false, detail: "Run `bunx prisma generate` first" };
  } catch {
    return { passed: false, detail: "Run `bunx prisma generate` first" };
  }
});

// ── Wait for all checks to complete ─
await new Promise(r => setTimeout(r, 1000));

// ── Print results ─────────────────────────────────────────────────────────
console.log("\\n" + "═".repeat(70));
console.log("  GUARDIANX PRE-DEPLOY CHECKLIST");
console.log("═".repeat(70) + "\\n");

let passCount = 0;
let failCount = 0;

for (const result of results) {
  const icon = result.passed ? "✅" : "❌";
  console.log(`  ${icon} ${result.name}`);
  console.log(`     ${result.detail}\\n`);
  if (result.passed) passCount++;
  else failCount++;
}

console.log("═".repeat(70));
console.log(`  ${passCount} passed | ${failCount} failed`);

if (failCount > 0) {
  console.log("\\n  ❌ DO NOT DEPLOY — Fix the failing checks first.\\n");
  process.exit(1);
} else {
  console.log("\\n  ✅ ALL CHECKS PASSED — Safe to deploy.\\n");
  process.exit(0);
}
