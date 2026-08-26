// POST /api/prompt-injection/scan
// ─────────────────────────────────────────────────────────────────────────────
// Auth-required. Probes an LLM endpoint (OpenAI-compatible: accepts `{messages}`
// in the request body) with 24 adversarial prompts covering 5 categories:
// leakage, jailbreak, tool_hijack, exfiltration, override.
//
// For each test:
//   - Sends the payload as a user message (plus an optional system prompt).
//   - Applies a 5s timeout (AbortController) per request.
//   - Checks the LLM response against the test's `failureIndicator` (regex /
//     substring) to determine if the LLM was successfully injected.
//
// The whole scan is bounded to a 10s overall timeout (Promise.race) so a
// single slow endpoint can't stall the dashboard indefinitely.
//
// The result is persisted to AuditLog so /api/prompt-injection/runs can list
// historical scan summaries.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import {
  INJECTION_TESTS,
  evaluateResponse,
  type InjectionCategory,
  type InjectionSeverity,
} from "@/lib/prompt-injection-tests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ScanFinding {
  testId: string;
  name: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  payload: string;
  response: string;
  vulnerable: boolean;
  error?: string;
}

interface ScanResult {
  targetUrl: string;
  testedCount: number;
  vulnerableCount: number;
  criticalCount: number;
  findings: ScanFinding[];
  startedAt: string;
  completedAt: string;
}

const PER_TEST_TIMEOUT_MS = 5_000;
const OVERALL_TIMEOUT_MS = 10_000;

function truncate(text: string, max = 400): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Send a single adversarial payload to the target LLM endpoint.
 *
 * The endpoint is expected to accept OpenAI-compatible request shape:
 *   { messages: [{role:"system"|"user", content: string}], ... }
 * and respond with either:
 *   - { choices: [{ message: { content: string }}] } (OpenAI shape), OR
 *   - { content: string } / { response: string } / { output: string } (simpler)
 * The handler is forgiving — it walks a few common shapes to extract the
 * assistant's reply text.
 */
async function sendToTarget(
  targetUrl: string,
  systemPrompt: string | undefined,
  payload: string,
  timeoutMs: number
): Promise<{ response: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: payload });

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Some proxies require an Authorization header even for unauthenticated
        // endpoints; we don't have a token here (the target is the LLM app the
        // user is testing), so send a benign placeholder that the target can
        // ignore.
        Authorization: "Bearer guardianx-prompt-injection-scanner",
      },
      body: JSON.stringify({ messages, model: "guardianx-scan", stream: false }),
      signal: controller.signal,
    });

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        response: "",
        error: `HTTP ${res.status}: ${truncate(raw, 200)}`,
      };
    }

    // Try JSON parse; otherwise treat the raw body as the response.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { response: truncate(raw) };
    }

    const text = extractAssistantText(parsed);
    return { response: truncate(text) };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { response: "", error: "timeout" };
    }
    return { response: "", error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk a few common response shapes to find the assistant's reply text.
 * Supports: OpenAI ({choices[0].message.content}), Anthropic
 * ({content[0].text} / {content[0].content}), simple ({content}, {response},
 * {output}, {text}, {reply}), and bare strings.
 */
function extractAssistantText(parsed: unknown): string {
  if (typeof parsed === "string") return parsed;
  if (!parsed || typeof parsed !== "object") return "";
  const obj = parsed as Record<string, unknown>;

  // OpenAI shape
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const msg = first?.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content;
    if (typeof first.text === "string") return first.text;
  }

  // Anthropic shape
  const content = obj.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>;
    if (typeof first.text === "string") return first.text;
    if (typeof first.content === "string") return first.content;
  }

  // Simple shapes
  for (const key of ["response", "output", "text", "reply", "answer", "result"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  if (typeof obj.content === "string") return obj.content as string;

  // Fallback: stringify the object so the user can see what came back.
  try {
    return JSON.stringify(obj).slice(0, 400);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
  const systemPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";

  if (!targetUrl) {
    return NextResponse.json(
      { error: "targetUrl is required" },
      { status: 400 }
    );
  }

  // Basic URL validation — must be http(s) and reachable in principle.
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return NextResponse.json(
      { error: "targetUrl must be a valid URL" },
      { status: 400 }
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json(
      { error: "targetUrl must use http or https" },
      { status: 400 }
    );
  }

  const startedAt = new Date();

  // Run all tests concurrently — but bound the whole scan to a 10s overall
  // timeout. Tests that haven't finished by then are aborted.
  const overallController = new AbortController();
  const overallTimer = setTimeout(
    () => overallController.abort(),
    OVERALL_TIMEOUT_MS
  );

  const findings: ScanFinding[] = [];

  const allTestsPromise = Promise.all(
    INJECTION_TESTS.map(async (test): Promise<ScanFinding> => {
      // Bail early if the overall timeout already fired.
      if (overallController.signal.aborted) {
        return {
          testId: test.id,
          name: test.name,
          category: test.category,
          severity: test.severity,
          payload: test.payload,
          response: "",
          vulnerable: false,
          error: "scan-aborted",
        };
      }

      const { response, error } = await sendToTarget(
        targetUrl,
        systemPrompt || undefined,
        test.payload,
        PER_TEST_TIMEOUT_MS
      );

      const vulnerable = error ? false : evaluateResponse(response, test.failureIndicator);

      return {
        testId: test.id,
        name: test.name,
        category: test.category,
        severity: test.severity,
        payload: test.payload,
        response,
        vulnerable,
        ...(error ? { error } : {}),
      };
    })
  );

  const timeoutPromise = new Promise<ScanFinding[]>((resolve) => {
    overallController.signal.addEventListener("abort", () => {
      // For any test that hasn't returned yet, mark it as aborted.
      resolve(
        INJECTION_TESTS.map((test) => ({
          testId: test.id,
          name: test.name,
          category: test.category,
          severity: test.severity,
          payload: test.payload,
          response: "",
          vulnerable: false,
          error: "scan-aborted",
        }))
      );
    });
  });

  try {
    const settled = await Promise.race([allTestsPromise, timeoutPromise]);
    findings.push(...settled);
  } finally {
    clearTimeout(overallTimer);
  }

  const completedAt = new Date();
  const vulnerableCount = findings.filter((f) => f.vulnerable).length;
  const criticalCount = findings.filter(
    (f) => f.vulnerable && f.severity === "critical"
  ).length;

  const result: ScanResult = {
    targetUrl,
    testedCount: findings.length,
    vulnerableCount,
    criticalCount,
    findings,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };

  // Persist to AuditLog so /api/prompt-injection/runs can list history.
  try {
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        action: "prompt-injection-scan",
        entity: targetUrl,
        actor: auth.user.email,
        details: JSON.stringify({
          testedCount: result.testedCount,
          vulnerableCount: result.vulnerableCount,
          criticalCount: result.criticalCount,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          // Store finding IDs + flags only (full payloads would blow up the row).
          findings: findings.map((f) => ({
            id: f.testId,
            name: f.name,
            category: f.category,
            severity: f.severity,
            vulnerable: f.vulnerable,
            error: f.error ?? null,
          })),
        }),
      },
    });
  } catch (err) {
    // Audit-log failure is non-fatal — the user still gets their scan result.
    console.error("[prompt-injection] failed to persist audit log:", err);
  }

  return NextResponse.json(result);
}
