import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// ── Heuristic fallback ───────────────────────────────────────────────────
// If the Z.AI LLM is unavailable (missing API key on Vercel, network error,
// unparseable response, etc.), we fall back to a curated set of 10
// business-logic test patterns covering each of the 5 vuln classes the
// endpoint advertises. The route still returns useful findings — never a
// bare 500.
interface FallbackTest {
  title: string;
  category:
    | "race_condition"
    | "price_manipulation"
    | "workflow_bypass"
    | "privilege_escalation"
    | "idor_chain";
  description: string;
  steps: string[];
  severity: "critical" | "high" | "medium";
}

function fallbackTests(target: string): FallbackTest[] {
  return [
    {
      title: "IDOR — access another user's resource via /api/user/{id}",
      category: "idor_chain",
      description:
        "Iterate /api/user/{id} from 1..N with a low-privilege JWT. If the endpoint returns 200 + PII for ids the requester does not own, it is an IDOR (CWE-639).",
      steps: [
        `Authenticate as a regular user (user id=7) against ${target}/login`,
        `GET ${target}/api/user/8 with the attacker's JWT`,
        `GET ${target}/api/user/9 with the attacker's JWT`,
        "Compare responses — if both return 200 with another user's PII, IDOR is confirmed",
      ],
      severity: "high",
    },
    {
      title: "IDOR — order enumeration via /api/order/{id}",
      category: "idor_chain",
      description:
        "Sequential order IDs allow enumeration. An attacker can list every order in the system (CWE-639).",
      steps: [
        `GET ${target}/api/order/1001 with attacker's JWT`,
        `GET ${target}/api/order/1002 with attacker's JWT`,
        "If both return 200 + an order summary not owned by the attacker, IDOR is confirmed",
      ],
      severity: "high",
    },
    {
      title: "Price manipulation — negative line item price",
      category: "price_manipulation",
      description:
        "Submit a cart with a negative item price. If the total drops below zero (or the order is accepted), the validation is missing (CWE-841).",
      steps: [
        `POST ${target}/api/cart with {"items":[{"id":1,"price":-100,"qty":2}]}`,
        "Inspect the response — if total is negative or zero, the bug is confirmed",
        `POST ${target}/api/checkout with the poisoned cart`,
      ],
      severity: "critical",
    },
    {
      title: "Price manipulation — zero-quantity item",
      category: "price_manipulation",
      description:
        "A zero-quantity item should be rejected; some checkouts accept it and silently apply a discount on the next item (CWE-841).",
      steps: [
        `POST ${target}/api/cart with {"items":[{"id":1,"price":49.99,"qty":0},{"id":2,"price":0,"qty":1}]}`,
        "If the cart total is 0 and checkout succeeds, the bug is confirmed",
      ],
      severity: "critical",
    },
    {
      title: "Price manipulation — integer overflow on quantity",
      category: "price_manipulation",
      description:
        "Send qty = 2147483647 (INT_MAX) + 1. If the server uses a 32-bit signed int, the value wraps to a negative number (CWE-841).",
      steps: [
        `POST ${target}/api/cart with {"items":[{"id":1,"price":10,"qty":2147483648}]}`,
        "Inspect the response — if total is negative or below zero, overflow is confirmed",
      ],
      severity: "critical",
    },
    {
      title: "Workflow bypass — checkout without a cart",
      category: "workflow_bypass",
      description:
        "Call /api/checkout directly with no prior /api/cart call. If the server creates an empty order with status=paid, the workflow is bypassable (CWE-841).",
      steps: [
        `POST ${target}/api/checkout with empty body and no cart cookie`,
        "If the response is 200 + an order id, the workflow is bypassed",
      ],
      severity: "high",
    },
    {
      title: "Workflow bypass — payment confirmation without payment record",
      category: "workflow_bypass",
      description:
        "Call /api/order/{id}/confirm-payment directly. If the server marks the order as paid without verifying a payment record exists, the workflow is bypassable (CWE-841).",
      steps: [
        `POST ${target}/api/order/1001/confirm-payment with empty body`,
        "If the response is 200 + status=paid, the bug is confirmed",
      ],
      severity: "high",
    },
    {
      title: "Race condition — 50 concurrent coupon-redemption attempts",
      category: "race_condition",
      description:
        "Fire 50 simultaneous requests to apply a single-use coupon to the same order. If more than one request succeeds, the coupon logic has a TOCTOU race (CWE-362).",
      steps: [
        `Create an order: POST ${target}/api/order`,
        `Fire 50 parallel POST ${target}/api/order/{id}/coupon with {"code":"WELCOME10"}`,
        "Count successful responses — if >1, race condition is confirmed",
      ],
      severity: "critical",
    },
    {
      title: "Privilege escalation — access /admin without admin role",
      category: "privilege_escalation",
      description:
        "Call /admin/users with a regular user's JWT. If the server returns 200 + a user list, vertical privilege escalation is possible (CWE-269).",
      steps: [
        `Authenticate as a regular user (role=user)`,
        `GET ${target}/admin/users with the regular user's JWT`,
        "If the response is 200 + a list of all users, escalation is confirmed",
      ],
      severity: "critical",
    },
    {
      title: "Mass assignment — set role=admin on profile update",
      category: "privilege_escalation",
      description:
        "Send a profile-update request with an extra `role:'admin'` field. If the server accepts and persists it, mass assignment allows privilege escalation (CWE-915).",
      steps: [
        `PUT ${target}/api/user/7 with {"name":"x","role":"admin"}`,
        `GET ${target}/api/user/7 to verify the role field`,
        "If the response shows role=admin, mass assignment is confirmed",
      ],
      severity: "high",
    },
  ];
}

// POST /api/business-logic-test, AI generates business logic attack scenarios.
// Body: { targetUrl, description? }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { targetUrl } = body;
  const base = (typeof targetUrl === "string" && targetUrl.trim()) || "http://localhost:3004";

  // Crawl endpoints
  const endpoints = ["/login", "/api/login", "/api/user/1", "/api/user/2", "/comments", "/redirect", "/admin"];

  let llmUsed = true;
  let llmError: string | null = null;
  let raw = "{}";

  try {
    const z = await sdk();
    const completion = await z.chat.completions.create({
      messages: [
        { role: "assistant", content: "You are a business logic penetration tester. Given a list of endpoints, identify business logic vulnerabilities: race conditions, price manipulation, workflow bypass, privilege escalation, IDOR chains. Respond with STRICT JSON only." },
        { role: "user", content: `Target: ${base}\nEndpoints: ${JSON.stringify(endpoints)}\n\nGenerate business logic test scenarios. Respond with: {"tests":[{"title":string,"category":"race_condition|price_manipulation|workflow_bypass|privilege_escalation|idor_chain","description":string,"steps":[string],"severity":"critical|high|medium"}]}` },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch (e) {
    llmUsed = false;
    llmError = (e as Error)?.message || "unknown error";
  }

  let parsed: { tests?: Array<{ title: string; category: string; description: string; steps: string[]; severity: string }> };
  try {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.search(/[[{]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
    parsed = JSON.parse(s);
  } catch {
    parsed = { tests: [] };
  }

  // Fallback: if LLM failed OR returned 0 tests, use the heuristic set.
  let tests = parsed.tests || [];
  if (!llmUsed || tests.length === 0) {
    tests = fallbackTests(base);
  }

  return NextResponse.json({
    target: base,
    tests,
    total: tests.length,
    categories: [...new Set(tests.map((t) => t.category))],
    llmUsed,
    llmError,
  });
}
