import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchUrl } from "@/lib/sentinel/engine/http-attacker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/graphql-test, GraphQL security testing (introspection, injection, batching)
// Body: { targetUrl }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const base = body.targetUrl || "http://localhost:3004";

  // Test 1: Introspection query
  const introspectionQuery = JSON.stringify({ query: "{ __schema { types { name fields { name } } } }" });
  let introspectionEnabled = false;
  try {
    const res = await fetchUrl(`${base}/graphql`, { method: "POST", body: introspectionQuery, headers: { "Content-Type": "application/json" }, timeoutMs: 5000 });
    if (res.status === 200 && res.body.includes("__schema")) introspectionEnabled = true;
  } catch { /* no graphql endpoint */ }

  // Test 2: Batch query attack (send multiple queries in one request)
  const batchQuery = JSON.stringify([
    { query: "{ user(id:1) { email } }" },
    { query: "{ user(id:2) { email } }" },
    { query: "{ user(id:3) { email } }" },
  ]);
  let batchAttackPossible = false;
  try {
    const res = await fetchUrl(`${base}/graphql`, { method: "POST", body: batchQuery, headers: { "Content-Type": "application/json" }, timeoutMs: 5000 });
    if (res.status === 200) batchAttackPossible = true;
  } catch { /* ignore */ }

  // Test 3: SQL injection in GraphQL variable
  const sqliQuery = JSON.stringify({ query: `{ user(email: "' OR '1'='1") { email password } }` });
  let sqliVulnerable = false;
  try {
    const res = await fetchUrl(`${base}/graphql`, { method: "POST", body: sqliQuery, headers: { "Content-Type": "application/json" }, timeoutMs: 5000 });
    if (res.body.includes("password")) sqliVulnerable = true;
  } catch { /* ignore */ }

  const results = [
    { test: "Introspection Enabled", vulnerable: introspectionEnabled, severity: "medium", description: "GraphQL introspection is enabled, attackers can map your entire API schema." },
    { test: "Batch Query Attack", vulnerable: batchAttackPossible, severity: "high", description: "Server accepts batched queries, enables DoS and data exfiltration via bulk queries." },
    { test: "SQL Injection via Variables", vulnerable: sqliVulnerable, severity: "critical", description: "GraphQL variables are not sanitized, SQL injection possible." },
  ];

  return NextResponse.json({
    target: base,
    endpoint: `${base}/graphql`,
    tests_run: 3,
    vulnerabilities_found: results.filter(r => r.vulnerable).length,
    results,
  });
}
