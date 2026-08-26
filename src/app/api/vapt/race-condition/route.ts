import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Types ────────────────────────────────────────────────────────────────────

interface RaceResponse {
  ok: boolean;
  status: number;
  durationMs: number;
  body: string;
  error?: string;
}

interface RaceTest {
  name: string;
  cwe: string;
  concurrency: number;
  fired: number;
  succeeded: number;
  failed: number;
  blocked: number;
  detected: boolean;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  threshold: string;
  responses: RaceResponse[];
}

interface FindingSummary {
  id: string;
  title: string;
  severity: string;
  category: string;
  cwe: string;
  endpoint: string;
  method: string;
}

// ── SSRF guard ───────────────────────────────────────────────────────────────

function isPrivateIp(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "") return true;
  if (h.endsWith(".localhost")) return true;
  // IPv4 private / reserved ranges
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (/^198\.(1[89])\./.test(h)) return true;
  if (/^255\./.test(h)) return true;
  // IPv6 loopback / link-local / ULA
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
  if (/^fe80:/i.test(h)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  // Cloud metadata hostnames
  if (h === "metadata.google.internal") return true;
  return false;
}

function ssrfGuard(
  targetUrl: string
): { ok: true } | { ok: false; error: string } {
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "Only http: and https: protocols are allowed." };
    }
    if (isPrivateIp(u.hostname)) {
      return {
        ok: false,
        error:
          "SSRF guard: target resolves to a private, loopback, or link-local address.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid URL — could not parse targetUrl." };
  }
}

// ── Single request with AbortController timeout ──────────────────────────────

async function fireRequest(
  url: string,
  method: string,
  body: string | undefined,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<RaceResponse> {
  const start = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      headers: { ...headers },
      signal: ac.signal,
      redirect: "manual",
    };
    if (method !== "GET" && method !== "HEAD" && body !== undefined) {
      init.body = body;
      const hdrs = init.headers as Record<string, string>;
      if (!hdrs["Content-Type"]) {
        hdrs["Content-Type"] = "application/json";
      }
    }
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
      body: text.slice(0, 2000),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "request failed";
    const timedOut = msg.toLowerCase().includes("abort");
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - start,
      body: "",
      error: timedOut ? "timeout" : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fireConcurrent(
  url: string,
  method: string,
  body: string | undefined,
  headers: Record<string, string>,
  n: number,
  timeoutMs: number
): Promise<RaceResponse[]> {
  const promises: Promise<RaceResponse>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(fireRequest(url, method, body, headers, timeoutMs));
  }
  return Promise.all(promises);
}

function analyzeStats(responses: RaceResponse[]): {
  succeeded: number;
  failed: number;
  blocked: number;
} {
  let succeeded = 0;
  let failed = 0;
  let blocked = 0;
  for (const r of responses) {
    if (r.status === 0) {
      failed++;
    } else if (r.status >= 200 && r.status < 300) {
      succeeded++;
    } else if (r.status === 429 || r.status === 403) {
      blocked++;
    } else {
      failed++;
    }
  }
  return { succeeded, failed, blocked };
}

// ── POST /api/vapt/race-condition ───────────────────────────────────────────
// Body: { targetUrl: string, method: string, body?: string,
//         headers?: Record<string,string>, concurrency?: number }
// Returns: { engagementId, testsRun, raceConditionsFound, findings, tests,
//           distribution, totalFired, totalSucceeded }

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const parsed = await req.json().catch(() => ({}));
  const {
    targetUrl,
    method = "GET",
    body: reqBody,
    headers = {},
    concurrency = 50,
  } = (parsed || {}) as {
    targetUrl: string;
    method: string;
    body?: string;
    headers?: Record<string, string>;
    concurrency?: number;
  };

  if (!targetUrl) {
    return NextResponse.json({ error: "targetUrl required" }, { status: 400 });
  }

  const guard = ssrfGuard(targetUrl);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 400 });
  }

  const upperMethod = (method || "GET").toUpperCase();
  const conc = Math.max(2, Math.min(200, Number(concurrency) || 50));

  try {
    // ── Create synthetic Target + Engagement row ─────────────────────────
    const targetId = randomUUID();
    const target = await db.target.create({
      data: {
        id: targetId,
        name: `Race-Condition Test (${new Date().toISOString()})`,
        baseUrl: targetUrl,
        authorized: true,
        notes: `Auto-created for race-condition testing by ${auth.user.email}`,
      },
    });

    const engagement = await db.engagement.create({
      data: {
        targetId: target.id as string,
        status: "analyzing",
        stageLabel: "Race-condition testing",
      },
    });
    const engagementId = engagement.id as string;

    const tests: RaceTest[] = [];
    const findings: FindingSummary[] = [];

    // Helper: persist a finding for a confirmed race condition
    const persistFinding = async (params: {
      title: string;
      severity: "critical" | "high" | "medium";
      category: string;
      cwe: string;
      description: string;
      proofRequest: string;
      sample: RaceResponse;
      remediation: string;
      confidence: number;
    }) => {
      const finding = await db.finding.create({
        data: {
          id: randomUUID(),
          engagementId,
          title: params.title,
          severity: params.severity,
          category: params.category,
          owasp: params.cwe,
          endpoint: targetUrl,
          method: upperMethod,
          description: params.description,
          proofRequest: params.proofRequest,
          proofResponse: `HTTP/1.1 ${params.sample.status}\n${params.sample.error ? `X-Error: ${params.sample.error}\n` : ""}\n${params.sample.body.slice(0, 1200)}`,
          payload: reqBody ? reqBody.slice(0, 500) : null,
          confidence: params.confidence,
          remediation: params.remediation,
        },
      });
      findings.push({
        id: finding.id as string,
        title: finding.title as string,
        severity: finding.severity as string,
        category: finding.category as string,
        cwe: finding.owasp as string,
        endpoint: finding.endpoint as string,
        method: finding.method as string,
      });
    };

    // ── Test 1: Double-Spend Test ──────────────────────────────────────
    // Fire N concurrent requests to the same endpoint simultaneously.
    // All succeed → critical (no locking); only 1 succeeds → safe;
    // some succeed → medium (partial protection).
    {
      const n = Math.min(conc, 50);
      const responses = await fireConcurrent(
        targetUrl,
        upperMethod,
        reqBody,
        headers,
        n,
        10000
      );
      const stats = analyzeStats(responses);
      let detected = false;
      let severity: RaceTest["severity"] = "info";
      if (stats.succeeded === n && n > 1) {
        detected = true;
        severity = "critical";
      } else if (stats.succeeded > 1) {
        detected = true;
        severity = "medium";
      }
      tests.push({
        name: "Double-Spend Test",
        cwe: "CWE-362",
        concurrency: n,
        fired: n,
        succeeded: stats.succeeded,
        failed: stats.failed,
        blocked: stats.blocked,
        detected,
        severity,
        description: `Fired ${n} concurrent requests simultaneously. ${stats.succeeded} of ${n} succeeded (expected: 1 if proper locking enforced).`,
        threshold: "all succeed → critical; >1 → medium; ==1 → safe",
        responses,
      });

      if (detected && (severity === "critical" || severity === "medium")) {
        const sample = responses.find((r) => r.ok) || responses[0];
        await persistFinding({
          title: "Double-Spend Race Condition (TOCTOU)",
          severity: severity === "critical" ? "critical" : "medium",
          category: "race_condition",
          cwe: "CWE-362",
          description: `${stats.succeeded} of ${n} concurrent requests to the same endpoint succeeded simultaneously. This indicates a Time-Of-Check/Time-Of-Use (TOCTOU) vulnerability — the endpoint does not enforce atomic locking on its critical section.`,
          proofRequest: `${upperMethod} ${targetUrl} HTTP/1.1\nHost: ${new URL(targetUrl).host}\nX-Concurrent: ${n}\n\n${reqBody || ""}`,
          sample,
          remediation:
            "Wrap the critical read-check-write sequence in a database transaction with row-level locking (SELECT ... FOR UPDATE) or use an atomic UPDATE ... WHERE condition. For distributed systems, serialize via a Redis SETNX-based lock.",
          confidence: severity === "critical" ? 0.95 : 0.78,
        });
      }
    }

    // ── Test 2: Duplicate Submission (idempotency) ─────────────────────
    // POST the same body N times concurrently. >1 succeed → critical.
    {
      const n = Math.min(conc, 50);
      const dupBody =
        reqBody ||
        JSON.stringify({
          transactionId: `race-test-${Date.now()}`,
          amount: 100,
          action: "transfer",
        });
      const responses = await fireConcurrent(
        targetUrl,
        "POST",
        dupBody,
        headers,
        n,
        10000
      );
      const stats = analyzeStats(responses);
      const detected = stats.succeeded > 1;
      const severity: RaceTest["severity"] = detected ? "critical" : "info";
      tests.push({
        name: "Duplicate Submission",
        cwe: "CWE-362",
        concurrency: n,
        fired: n,
        succeeded: stats.succeeded,
        failed: stats.failed,
        blocked: stats.blocked,
        detected,
        severity,
        description: `Fired ${n} concurrent POSTs with an identical body. ${stats.succeeded} succeeded (expected: 1 if idempotency is enforced).`,
        threshold: ">1 succeed → critical (idempotency not enforced)",
        responses,
      });

      if (detected) {
        const sample = responses.find((r) => r.ok) || responses[0];
        await persistFinding({
          title: "Duplicate Submission (Idempotency Not Enforced)",
          severity: "critical",
          category: "race_condition",
          cwe: "CWE-362",
          description: `${stats.succeeded} of ${n} concurrent duplicate submissions with the same request body succeeded. The server does not enforce idempotency — replaying the same request N times produces N side-effects instead of 1.`,
          proofRequest: `POST ${targetUrl} HTTP/1.1\nHost: ${new URL(targetUrl).host}\nX-Concurrent: ${n}\nContent-Type: application/json\n\n${dupBody.slice(0, 600)}`,
          sample,
          remediation:
            "Add an idempotency-key header (Stripe-style) or unique transaction-id column with a database UNIQUE constraint. Reject duplicates server-side after the first commit.",
          confidence: 0.92,
        });
      }
    }

    // ── Test 3: Concurrent Balance Deduction (overdraft) ───────────────
    // Fire 20 concurrent POSTs with amount=100. If >1 succeed → critical.
    {
      const n = Math.min(conc, 20);
      const deductBody =
        reqBody ||
        JSON.stringify({
          amount: 100,
          action: "deduct",
          accountId: "race-test",
        });
      const responses = await fireConcurrent(
        targetUrl,
        "POST",
        deductBody,
        headers,
        n,
        10000
      );
      const stats = analyzeStats(responses);
      const detected = stats.succeeded > 1;
      const severity: RaceTest["severity"] = detected ? "critical" : "info";
      const totalDeducted = stats.succeeded * 100;
      tests.push({
        name: "Concurrent Balance Deduction",
        cwe: "CWE-362",
        concurrency: n,
        fired: n,
        succeeded: stats.succeeded,
        failed: stats.failed,
        blocked: stats.blocked,
        detected,
        severity,
        description: `Fired ${n} concurrent POSTs with amount=100. Total deducted: ${totalDeducted} (expected: at most 100 if balance enforced atomically).`,
        threshold: "total deducted > 100 → critical (double-spend)",
        responses,
      });

      if (detected) {
        const sample = responses.find((r) => r.ok) || responses[0];
        await persistFinding({
          title: "Concurrent Balance Deduction (Double-Spend)",
          severity: "critical",
          category: "race_condition",
          cwe: "CWE-362",
          description: `${stats.succeeded} of ${n} concurrent deduction requests succeeded — total deducted ${totalDeducted} exceeds the per-account balance limit. This is a textbook TOCTOU double-spend: the balance check and the deduction are not atomic, so concurrent requests each see the pre-deduction balance and all succeed.`,
          proofRequest: `POST ${targetUrl} HTTP/1.1\nHost: ${new URL(targetUrl).host}\nX-Concurrent: ${n}\nContent-Type: application/json\n\n${deductBody.slice(0, 600)}`,
          sample,
          remediation:
            "Use SELECT ... FOR UPDATE row-level locks inside a SERIALIZABLE or REPEATABLE READ transaction, or perform an atomic conditional UPDATE (UPDATE accounts SET balance = balance - 100 WHERE balance >= 100) and check the affected-rows count.",
          confidence: 0.93,
        });
      }
    }

    // ── Test 4: Rate-Limit Race (100 concurrent auth attempts) ──────────
    // If all 100 get through without 429/403 → medium (CWE-770).
    {
      const n = Math.min(conc, 100);
      const loginBody =
        reqBody ||
        JSON.stringify({
          email: `race-test-${Date.now()}@example.com`,
          password: "race-test-password",
        });
      const responses = await fireConcurrent(
        targetUrl,
        upperMethod,
        loginBody,
        headers,
        n,
        10000
      );
      const stats = analyzeStats(responses);
      const noRateLimit = stats.blocked === 0 && n >= 10;
      const detected = noRateLimit;
      const severity: RaceTest["severity"] = detected ? "medium" : "info";
      tests.push({
        name: "Rate-Limit Race",
        cwe: "CWE-770",
        concurrency: n,
        fired: n,
        succeeded: stats.succeeded,
        failed: stats.failed,
        blocked: stats.blocked,
        detected,
        severity,
        description: `Fired ${n} concurrent requests. ${stats.blocked} were rate-limited (429/403). ${stats.succeeded + stats.failed} were processed without throttling.`,
        threshold: "0 blocked → medium (no rate-limiting on auth endpoint)",
        responses,
      });

      if (detected) {
        const sample = responses[0];
        await persistFinding({
          title: "Missing Rate Limiting on Concurrent Requests",
          severity: "medium",
          category: "rate_limit",
          cwe: "CWE-770",
          description: `All ${n} concurrent requests were accepted without rate-limiting (no 429 or 403 responses). This enables brute-force attacks, credential stuffing, and resource-exhaustion DoS.`,
          proofRequest: `${upperMethod} ${targetUrl} HTTP/1.1\nHost: ${new URL(targetUrl).host}\nX-Concurrent: ${n}\n\n${loginBody.slice(0, 600)}`,
          sample,
          remediation:
            "Implement per-IP and per-account rate limiting (e.g., 10 req/min on auth endpoints) using a Redis token bucket. Return HTTP 429 with a Retry-After header when the limit is exceeded.",
          confidence: 0.82,
        });
      }
    }

    // ── Test 5: Coupon Abuse (single-use enforcement) ──────────────────
    // 20 concurrent same-coupon POSTs. >1 succeed → high.
    {
      const n = Math.min(conc, 20);
      const couponBody =
        reqBody ||
        JSON.stringify({
          couponCode: "RACE-TEST-100",
          amount: 100,
          cartId: `cart-${Date.now()}`,
        });
      const responses = await fireConcurrent(
        targetUrl,
        "POST",
        couponBody,
        headers,
        n,
        10000
      );
      const stats = analyzeStats(responses);
      const detected = stats.succeeded > 1;
      const severity: RaceTest["severity"] = detected ? "high" : "info";
      tests.push({
        name: "Coupon Abuse",
        cwe: "CWE-362",
        concurrency: n,
        fired: n,
        succeeded: stats.succeeded,
        failed: stats.failed,
        blocked: stats.blocked,
        detected,
        severity,
        description: `Fired ${n} concurrent applications of the same coupon code. ${stats.succeeded} succeeded (expected: 1 if single-use enforced).`,
        threshold: ">1 succeed → high (coupon reuse allowed)",
        responses,
      });

      if (detected) {
        const sample = responses.find((r) => r.ok) || responses[0];
        await persistFinding({
          title: "Coupon Abuse via Race Condition",
          severity: "high",
          category: "race_condition",
          cwe: "CWE-362",
          description: `${stats.succeeded} of ${n} concurrent applications of the same coupon code succeeded. The coupon is not single-use — concurrent requests each observe the coupon as unused and bypass the redemption guard.`,
          proofRequest: `POST ${targetUrl} HTTP/1.1\nHost: ${new URL(targetUrl).host}\nX-Concurrent: ${n}\nContent-Type: application/json\n\n${couponBody.slice(0, 600)}`,
          sample,
          remediation:
            "Mark the coupon as used atomically: UPDATE coupons SET used_at = NOW() WHERE id = ? AND used_at IS NULL RETURNING *. If the affected-rows count is 0, the coupon was already redeemed — reject the request.",
          confidence: 0.88,
        });
      }
    }

    // ── Mark engagement completed ───────────────────────────────────────
    const detectedCount = tests.filter((t) => t.detected).length;
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        completedAt: new Date(),
        stageLabel: `Race-condition: ${detectedCount}/${tests.length} vulnerabilities detected`,
      },
    });

    // ── Aggregate response distribution + timeline ─────────────────────
    const allResponses = tests.flatMap((t) => t.responses);
    const distribution = {
      ok: allResponses.filter((r) => r.status >= 200 && r.status < 300).length,
      "4xx": allResponses.filter((r) => r.status >= 400 && r.status < 500).length,
      "5xx": allResponses.filter((r) => r.status >= 500 && r.status < 600).length,
      timeout: allResponses.filter((r) => r.status === 0).length,
    };

    return NextResponse.json({
      engagementId,
      testsRun: tests.length,
      raceConditionsFound: detectedCount,
      findings,
      tests: tests.map((t) => ({
        name: t.name,
        cwe: t.cwe,
        concurrency: t.concurrency,
        fired: t.fired,
        succeeded: t.succeeded,
        failed: t.failed,
        blocked: t.blocked,
        detected: t.detected,
        severity: t.severity,
        description: t.description,
        threshold: t.threshold,
        timeline: t.responses.map((r, i) => ({
          index: i,
          durationMs: r.durationMs,
          status: r.status,
          testName: t.name,
        })),
      })),
      distribution,
      totalFired: allResponses.length,
      totalSucceeded: allResponses.filter(
        (r) => r.status >= 200 && r.status < 300
      ).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Race-condition test failed" },
      { status: 500 }
    );
  }
}
