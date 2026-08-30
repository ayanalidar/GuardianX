#!/usr/bin/env bun
/**
 * integration-test.ts — verify every API endpoint returns the expected shape
 * ==========================================================================
 * Run: `bun run scripts/integration-test.ts`
 *
 * Hits every authenticated API endpoint and checks:
 *   1. Does it return 200 (or expected status)?
 *   2. Does the response match the shape the frontend expects?
 *   3. Are there snake_case fields that should be camelCase?
 *
 * Outputs a report showing which endpoints are safe vs which would crash
 * the frontend if a component used the response directly.
 */

const BASE = process.env.BASE_URL || "https://www.guardianx.cloud";
const EMAIL = process.env.TEST_EMAIL || "ayan@guardianx.in";
const PASSWORD = process.env.TEST_PASSWORD || "GuardianX@2026";

interface EndpointTest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Expected response shape: "array" | "object" | "null-ok" */
  shape: "array" | "object" | "null-ok" | "any";
  /** Fields that MUST be present on each item (for arrays) or the response (for objects). */
  requiredFields?: string[];
  /** Whether this endpoint requires auth. */
  auth: boolean;
}

const ENDPOINTS: EndpointTest[] = [
  // ── Auth ──────────────────────────────────────────────────────────────
  { method: "POST", path: "/api/auth/login", body: { email: EMAIL, password: PASSWORD }, shape: "object", requiredFields: ["token", "user"], auth: false },
  { method: "GET", path: "/api/health", shape: "object", requiredFields: ["status"], auth: false },

  // ── Dashboard data ─────────────────────────────────────────────────────
  { method: "GET", path: "/api/stats", shape: "object", auth: true },
  { method: "GET", path: "/api/posture-score", shape: "object", auth: true },
  { method: "GET", path: "/api/activity-feed", shape: "array", auth: true },
  { method: "GET", path: "/api/clients", shape: "array", requiredFields: ["id", "name"], auth: true },
  { method: "GET", path: "/api/codebases", shape: "array", requiredFields: ["id", "name"], auth: true },
  { method: "GET", path: "/api/findings?limit=5", shape: "array", requiredFields: ["id", "title"], auth: true },
  { method: "GET", path: "/api/patches/pending", shape: "array", requiredFields: ["patch_id"], auth: true },
  { method: "GET", path: "/api/users", shape: "array", auth: true },
  { method: "GET", path: "/api/threat-intel", shape: "object", auth: true },

  // ── VAPT ───────────────────────────────────────────────────────────────
  { method: "GET", path: "/api/attestations", shape: "array", auth: true },
  { method: "GET", path: "/api/canaries", shape: "array", auth: true },
  { method: "GET", path: "/api/iocs", shape: "array", auth: true },
  { method: "GET", path: "/api/incidents", shape: "array", auth: true },
  { method: "GET", path: "/api/playbooks", shape: "array", auth: true },

  // ── Public scan ─────────────────────────────────────────────────────────
  { method: "GET", path: "/api/public-scan/recent?limit=5", shape: "array", auth: false },
];

interface TestResult {
  path: string;
  method: string;
  status: number;
  ok: boolean;
  shapeOk: boolean;
  fieldsOk: boolean;
  hasSnakeCase: boolean;
  error?: string;
  durationMs: number;
}

async function main(): Promise<void> {
  console.log("GuardianX API Integration Test");
  console.log("================================\n");

  // 1. Login to get a token
  console.log(`Logging in as ${EMAIL}...`);
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed: HTTP ${loginRes.status}`);
    process.exit(1);
  }
  const loginData = await loginRes.json() as { token: string };
  const token = loginData.token;
  console.log("✓ Login successful\n");

  // 2. Test each endpoint
  const results: TestResult[] = [];

  for (const ep of ENDPOINTS) {
    const result: TestResult = {
      path: ep.path,
      method: ep.method,
      status: 0,
      ok: false,
      shapeOk: false,
      fieldsOk: false,
      hasSnakeCase: false,
      durationMs: 0,
    };

    const start = Date.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ep.auth) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${BASE}${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      result.status = res.status;
      result.durationMs = Date.now() - start;
      result.ok = res.ok;

      if (!res.ok) {
        result.error = `HTTP ${res.status}`;
        results.push(result);
        continue;
      }

      const text = await res.text();
      if (!text) {
        result.shapeOk = ep.shape === "null-ok";
        result.fieldsOk = true;
        results.push(result);
        continue;
      }

      const data = JSON.parse(text);

      // Check shape
      if (ep.shape === "array") {
        result.shapeOk = Array.isArray(data);
      } else if (ep.shape === "object") {
        result.shapeOk = typeof data === "object" && data !== null && !Array.isArray(data);
      } else {
        result.shapeOk = true;
      }

      // Check for snake_case keys (the #1 cause of frontend crashes)
      const checkSnakeCase = (obj: unknown, depth = 0): boolean => {
        if (depth > 5 || obj === null || typeof obj !== "object") return false;
        if (Array.isArray(obj)) return obj.some((v) => checkSnakeCase(v, depth + 1));
        const keys = Object.keys(obj as Record<string, unknown>);
        return keys.some((k) => k.includes("_") && !["cve", "owasp"].includes(k));
      };
      result.hasSnakeCase = checkSnakeCase(data);

      // Check required fields
      if (ep.requiredFields && result.shapeOk) {
        if (ep.shape === "array" && Array.isArray(data) && data.length > 0) {
          const first = data[0] as Record<string, unknown>;
          const missing = ep.requiredFields.filter((f) => !(f in first));
          result.fieldsOk = missing.length === 0;
          if (!result.fieldsOk) {
            result.error = `Missing fields: ${missing.join(", ")}`;
          }
        } else if (ep.shape === "object" && typeof data === "object" && data !== null) {
          const obj = data as Record<string, unknown>;
          const missing = ep.requiredFields.filter((f) => !(f in obj));
          result.fieldsOk = missing.length === 0;
          if (!result.fieldsOk) {
            result.error = `Missing fields: ${missing.join(", ")}`;
          }
        } else {
          result.fieldsOk = true;
        }
      } else {
        result.fieldsOk = true;
      }
    } catch (err) {
      result.durationMs = Date.now() - start;
      result.error = err instanceof Error ? err.message : "unknown";
    }

    results.push(result);
  }

  // 3. Print report
  console.log("Endpoint".padEnd(40) + "Status".padEnd(8) + "Shape".padEnd(8) + "Fields".padEnd(8) + "Snake?".padEnd(8) + "Duration");
  console.log("─".repeat(80));

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const r of results) {
    const allOk = r.ok && r.shapeOk && r.fieldsOk;
    const status = allOk ? (r.hasSnakeCase ? "⚠ " : "✓ ") : "✗ ";
    const statusStr = r.status ? String(r.status) : "ERR";
    const shapeStr = r.shapeOk ? "OK" : "BAD";
    const fieldsStr = r.fieldsOk ? "OK" : "MISS";
    const snakeStr = r.hasSnakeCase ? "YES" : "no";

    console.log(
      status + r.path.padEnd(38) + statusStr.padEnd(8) + shapeStr.padEnd(8) + fieldsStr.padEnd(8) + snakeStr.padEnd(8) + r.durationMs + "ms"
    );

    if (r.error) {
      console.log("    → " + r.error);
    }

    if (allOk && !r.hasSnakeCase) passCount++;
    else if (allOk && r.hasSnakeCase) warnCount++;
    else failCount++;
  }

  console.log("\n" + "─".repeat(80));
  console.log(`✓ Pass: ${passCount} | ⚠ Warn (snake_case): ${warnCount} | ✗ Fail: ${failCount}`);

  if (failCount > 0) {
    console.log("\n❌ Some endpoints failed — these would crash the frontend if used directly.");
    process.exit(1);
  } else if (warnCount > 0) {
    console.log("\n⚠ Some endpoints return snake_case fields — use safeApi() to auto-normalize.");
  } else {
    console.log("\n✅ All endpoints pass — no shape mismatches detected.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
