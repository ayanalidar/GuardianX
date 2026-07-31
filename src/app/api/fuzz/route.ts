import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchUrl } from "@/lib/sentinel/engine/http-attacker";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// POST /api/fuzz — API fuzzing engine. Throws mutated inputs at endpoints.
// Body: { targetUrl, endpoint, method, paramCount }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { targetUrl, endpoint, method } = body;
  const base = targetUrl || "http://localhost:3004";
  const ep = endpoint || "/search";
  const meth = method || "GET";

  // Fuzz payloads — mutated inputs designed to find crashes/edge cases
  const fuzzPayloads = [
    "", "A".repeat(10000), "' OR '1'='1", "'; DROP TABLE--", "<script>alert(1)</script>",
    "../../../etc/passwd", "${7*7}", "{{7*7}}", "null", "undefined", "true", "false",
    "0", "-1", "999999999999", "NaN", "Infinity", "\x00", "\n\r", "%00", "%0a%0d",
    "{\"$gt\":\"\"}", "{\"$ne\":\"\"}", "[]", "[null]", "{\"a\":null}",
    "file:///etc/passwd", "http://localhost:3004", "javascript:alert(1)",
    "a".repeat(1000000), "../../", "..\\..\\", "\\\\..\\\\..\\\\",
  ];

  let crashes = 0;
  let errors = 0;
  const anomalies: Array<{ payload: string; status: number; responseSize: number; anomaly: string }> = [];

  for (const payload of fuzzPayloads) {
    try {
      let url = `${base}${ep}`;
      if (meth === "GET") {
        url += (ep.includes("?") ? "&" : "?") + `q=${encodeURIComponent(payload)}`;
      }
      const res = await fetchUrl(url, { method: meth as "GET" | "POST", timeoutMs: 5000 });

      if (res.status === 0) { crashes++; anomalies.push({ payload: payload.slice(0, 50), status: 0, responseSize: 0, anomaly: "connection refused / crash" }); }
      else if (res.status >= 500) { crashes++; anomalies.push({ payload: payload.slice(0, 50), status: res.status, responseSize: res.body.length, anomaly: `server error ${res.status}` }); }
      else if (res.status >= 400) { errors++; }
      // Check for SQL errors, stack traces, etc.
      else if (/SQL|mysql|postgres|sqlite|stack trace|exception|error in/i.test(res.body)) {
        anomalies.push({ payload: payload.slice(0, 50), status: res.status, responseSize: res.body.length, anomaly: "error leak in response" });
      }
    } catch { crashes++; }
  }

  // Save result
  const fuzz = await db.fuzzResult.create({
    data: { targetUrl: base, endpoint: ep, method: meth, totalRequests: fuzzPayloads.length, crashes, errors, anomalies: JSON.stringify(anomalies) },
  });

  return NextResponse.json({
    id: fuzz.id,
    target: base + ep,
    method: meth,
    total_requests: fuzzPayloads.length,
    crashes,
    errors,
    anomalies_found: anomalies.length,
    anomalies: anomalies.slice(0, 10),
    summary: `${fuzzPayloads.length} requests sent → ${crashes} crashes, ${errors} client errors, ${anomalies.length} anomalies detected`,
  });
}
