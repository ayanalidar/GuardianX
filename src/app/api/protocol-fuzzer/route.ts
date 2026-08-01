import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/protocol-fuzzer, mutation-based protocol fuzzing engine
// Injects malformed data structures to reveal edge-case faults
// Body: { targetUrl, protocol: "http" | "graphql" | "websocket" | "rest", maxMutations?: number }
export async function POST(req: Request) {
  const { targetUrl, protocol = "http", maxMutations = 20 } = await req.json().catch(() => ({}));

  if (!targetUrl) return NextResponse.json({ error: "targetUrl required" }, { status: 400 });

  try {
    // ── Mutation strategies ───────────────────────────────────────────────
    const mutations: { type: string; payload: string; description: string }[] = [];

    // 1. Integer overflow mutations
    const intMutations = ["2147483647", "-2147483648", "99999999999999999", "0", "-1", "NaN", "Infinity"];
    for (const v of intMutations) {
      mutations.push({ type: "integer_overflow", payload: v, description: `Integer edge case: ${v}` });
    }

    // 2. String boundary mutations
    const strMutations = [
      { payload: "A".repeat(10000), desc: "10KB string buffer overflow test" },
      { payload: "", desc: "Empty string" },
      { payload: "\x00\x01\x02\x03", desc: "Null bytes + control chars" },
      { payload: "'\"<>${{7*7}}", desc: "Injection meta chars" },
      { payload: "../../etc/passwd", desc: "Path traversal" },
      { payload: "{\"$gt\":\"\"}", desc: "NoSQL injection" },
      { payload: "undefined", desc: "Undefined value" },
      { payload: "null", desc: "Null value" },
    ];
    for (const m of strMutations) {
      mutations.push({ type: "string_boundary", payload: m.payload, description: m.desc });
    }

    // 3. Protocol-specific mutations
    if (protocol === "graphql") {
      mutations.push({ type: "graphql_introspection", payload: '{"query":"{__schema{types{name}}}"}', description: "GraphQL introspection" });
      mutations.push({ type: "graphql_batch", payload: '[{"query":"{user{id}}"},{"query":"{user{id}}"}]', description: "GraphQL batch attack" });
      mutations.push({ type: "graphql_depth", payload: '{"query":"{user{friends{friends{friends{friends{friends{friends{friends{id}}}}}}}}}"}', description: "Deep nesting DoS" });
    }

    if (protocol === "websocket") {
      mutations.push({ type: "ws_oversized_frame", payload: "x".repeat(65536), description: "Oversized WebSocket frame" });
      mutations.push({ type: "ws_invalid_opcode", payload: "\x8f", description: "Invalid opcode 0x8f" });
    }

    // 4. JSON structure mutations
    const jsonMutations = [
      { payload: "{}", desc: "Empty object" },
      { payload: "[]", desc: "Empty array" },
      { payload: '{"key": null}', desc: "Null value" },
      { payload: '{"key": {"key": {"key": "deep"}}}', desc: "Deep nesting" },
      { payload: '{"key": [{"$ref": "$"}]}', desc: "Circular reference" },
      { payload: '{"key": true, "key": false}', desc: "Duplicate keys" },
    ];
    for (const m of jsonMutations) {
      mutations.push({ type: "json_structure", payload: m.payload, description: m.desc });
    }

    // Limit mutations
    const selectedMutations = mutations.slice(0, maxMutations);

    // ── Execute mutations against target ──────────────────────────────────
    const results: { mutation: string; payload: string; response_status: number; response_time: number; anomaly: string | null }[] = [];

    for (const mutation of selectedMutations) {
      const start = Date.now();
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: protocol === "http" ? mutation.payload : JSON.stringify({ query: mutation.payload }),
          signal: AbortSignal.timeout(5000),
        });
        const responseTime = Date.now() - start;

        // Detect anomalies
        let anomaly: string | null = null;
        if (responseTime > 3000) anomaly = "SLOW_RESPONSE";
        if (res.status === 500) anomaly = "SERVER_ERROR";
        if (res.status === 200) {
          const body = await res.text();
          if (body.includes("Traceback") || body.includes("Error") || body.includes("Exception")) {
            anomaly = "ERROR_LEAK";
          }
          if (body.length > 100000) anomaly = "OVERSIZED_RESPONSE";
        }

        results.push({
          mutation: mutation.type,
          payload: mutation.payload.slice(0, 100),
          response_status: res.status,
          response_time: responseTime,
          anomaly,
        });
      } catch (err) {
        results.push({
          mutation: mutation.type,
          payload: mutation.payload.slice(0, 100),
          response_status: 0,
          response_time: Date.now() - start,
          anomaly: err instanceof Error ? `TIMEOUT_OR_ERROR: ${err.message.slice(0, 50)}` : "UNKNOWN",
        });
      }
    }

    // Save results
    const fuzzId = randomUUID();
    await db.fuzzResult.create({
      data: {
        id: fuzzId,
        targetUrl,
        endpoint: targetUrl,
        method: "POST",
        totalRequests: results.length,
        crashes: results.filter((r) => r.anomaly === "SERVER_ERROR").length,
        errors: results.filter((r) => r.anomaly !== null).length,
        anomalies: JSON.stringify(results.filter((r) => r.anomaly)),
      },
    });

    const crashCount = results.filter((r) => r.anomaly === "SERVER_ERROR").length;
    const anomalyCount = results.filter((r) => r.anomaly !== null).length;

    return NextResponse.json({
      fuzz_id: fuzzId,
      target: targetUrl,
      protocol,
      total_mutations: results.length,
      crashes: crashCount,
      anomalies: anomalyCount,
      results,
      summary: `Fuzzing complete: ${results.length} mutations sent, ${crashCount} crashes, ${anomalyCount} anomalies detected.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
