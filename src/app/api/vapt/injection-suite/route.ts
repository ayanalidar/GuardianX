import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";
type InjectionCategory = "HTML Injection" | "CSRF" | "CORS";

interface InjectionFinding {
  name: string;
  category: InjectionCategory;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  payload: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
  indicator: string;
}

interface ParsedForm {
  action: string;
  method: string;
  inputs: { name: string; type: string }[];
}

interface CrawlResult {
  html: string;
  forms: ParsedForm[];
  links: string[];
}

// ─── SSRF guard (reject private/loopback/link-local/CGNAT targets) ─────────

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost") return true;
  if (h === "::1" || h === "::ffff:127.0.0.1") return true;
  if (h === "0.0.0.0") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
  }
  if (/\.(local|internal|lan|home|localhost)$/.test(h)) return true;
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
      error:
        "SSRF guard: target resolves to a private/loopback address. Public targets only.",
    };
  }
  return { ok: true, url };
}

// ─── HTTP probe helper ──────────────────────────────────────────────────

interface ProbeOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  followRedirects?: boolean;
  timeoutMs?: number;
}

interface ProbeResult {
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs: number;
  ok: boolean;
  error?: string;
}

async function probe(url: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "User-Agent": "GuardianX-InjectionSuite/1.0",
        Accept: "*/*",
        ...(opts.headers ?? {}),
      },
      body: opts.body ?? null,
      redirect: opts.followRedirects === false ? "manual" : "follow",
      signal: controller.signal,
    });
    const text = await r.text().catch(() => "");
    const headerMap: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      headerMap[k.toLowerCase()] = v;
    });
    return {
      status: r.status,
      body: text,
      headers: headerMap,
      durationMs: Date.now() - start,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      headers: {},
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

// ─── HTML parser (lightweight, no external deps) ───────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseForms(html: string, baseUrl: URL): ParsedForm[] {
  const forms: ParsedForm[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm: RegExpExecArray | null;
  while ((fm = formRe.exec(html)) !== null) {
    const attrs = fm[1] || "";
    const inner = fm[2] || "";
    const actionMatch = attrs.match(/\baction\s*=\s*"([^"]*)"/i);
    const methodMatch = attrs.match(/\bmethod\s*=\s*"([^"]*)"/i);
    let action = actionMatch ? decodeEntities(actionMatch[1]) : "";
    const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
    try {
      action = action
        ? new URL(action, baseUrl).toString()
        : baseUrl.toString();
    } catch {
      action = baseUrl.toString();
    }
    const inputs: { name: string; type: string }[] = [];
    const inputRe = /<input\b([^>]*)>/gi;
    let im: RegExpExecArray | null;
    while ((im = inputRe.exec(inner)) !== null) {
      const ia = im[1] || "";
      const nameMatch = ia.match(/\bname\s*=\s*"([^"]*)"/i);
      const typeMatch = ia.match(/\btype\s*=\s*"([^"]*)"/i);
      if (nameMatch) {
        inputs.push({
          name: decodeEntities(nameMatch[1]),
          type: (typeMatch ? typeMatch[1] : "text").toLowerCase(),
        });
      }
    }
    forms.push({ action, method, inputs });
  }
  return forms;
}

function parseLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = decodeEntities(m[1]);
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }
    try {
      const abs = new URL(href, baseUrl).toString();
      if (abs.startsWith("http://") || abs.startsWith("https://")) {
        links.add(abs);
      }
    } catch {
      /* skip malformed */
    }
  }
  return Array.from(links);
}

async function crawlTarget(targetUrl: URL): Promise<CrawlResult> {
  const r = await probe(targetUrl.toString(), { timeoutMs: 6000 });
  const html = r.status >= 200 && r.status < 400 ? r.body : "";
  return {
    html,
    forms: parseForms(html, targetUrl),
    links: parseLinks(html, targetUrl),
  };
}

// ─── HTML Injection (CWE-79, medium) ─────────────────────────────────────

interface HtmlInjectionCase {
  name: string;
  payload: string;
}

const HTML_INJECTION_PAYLOADS: HtmlInjectionCase[] = [
  { name: "Heading tag injection", payload: "<h1>test</h1>" },
  { name: "Bold tag injection", payload: "<b>bold</b>" },
  { name: "Marquee tag injection", payload: "<marquee>test</marquee>" },
  { name: "Image onerror XSS vector", payload: "<img src=x onerror=alert(1)>" },
];

const COMMON_ECHO_PARAMS = [
  "q", "query", "search", "name", "msg", "message", "input", "value", "text", "data",
];

async function testHtmlInjection(
  targetUrl: URL,
  crawl: CrawlResult
): Promise<InjectionFinding[]> {
  const results: InjectionFinding[] = [];
  const tested = new Set<string>();

  const endpointsToTest: URL[] = [targetUrl];
  for (const link of crawl.links.slice(0, 5)) {
    try {
      endpointsToTest.push(new URL(link));
    } catch {
      /* skip */
    }
  }

  for (const endpointUrl of endpointsToTest) {
    for (const param of COMMON_ECHO_PARAMS) {
      for (const c of HTML_INJECTION_PAYLOADS) {
        const testUrl = new URL(endpointUrl.toString());
        testUrl.searchParams.set(param, c.payload);
        const key = `${testUrl.toString()}|${c.payload}`;
        if (tested.has(key)) continue;
        tested.add(key);

        const r = await probe(testUrl.toString(), { method: "GET", timeoutMs: 5000 });
        const reflected = r.body.includes(c.payload);
        const escaped = r.body.includes(c.payload.replace(/</g, "&lt;"));
        const vulnerable = reflected && !escaped;

        const isXssPayload = c.payload.includes("onerror=");
        const severity: Severity = vulnerable && isXssPayload ? "high" : "medium";

        results.push({
          name: isXssPayload
            ? `HTML/XSS Injection via ?${param} (${c.name})`
            : `HTML Injection via ?${param} (${c.name})`,
          category: "HTML Injection",
          severity,
          cwe: "CWE-79",
          vulnerable,
          payload: c.payload,
          endpoint: endpointUrl.toString(),
          method: "GET",
          status: r.status,
          durationMs: r.durationMs,
          proofRequest:
            `GET ${testUrl.toString()}\n\n` +
            `Injecting \`${c.payload}\` into the \`${param}\` parameter. ` +
            `If the response body contains the literal HTML (not &lt;escaped&gt;), the target is vulnerable.`,
          proofResponse:
            `HTTP ${r.status} (${r.durationMs}ms)\n` +
            `Reflected verbatim: ${vulnerable ? "YES ⚠" : "no"}\n` +
            `HTML-escaped in body: ${escaped ? "yes (safe)" : "no"}\n` +
            `--- response excerpt ---\n${safeTruncate(r.body, 2000)}`,
          remediation:
            "Output-encode ALL user-supplied input before reflecting it in HTML. " +
            "Use a context-aware encoder (DOMPurify for HTML, encodeURIComponent for URL). " +
            "Implement a strict Content-Security-Policy header. The `<img onerror>` payload " +
            "indicates stored/reflected XSS — fix immediately.",
          indicator: vulnerable
            ? `Reflected: "${c.payload}" appears verbatim in response body`
            : "Not reflected verbatim (escaped or absent)",
        });
      }
    }
  }

  // Test each parsed <form> for HTML injection (submit payloads as form values)
  for (const form of crawl.forms.slice(0, 5)) {
    for (const input of form.inputs.slice(0, 3)) {
      if (input.type === "hidden" || input.type === "submit") continue;
      for (const c of HTML_INJECTION_PAYLOADS) {
        const key = `${form.action}|${input.name}|${c.payload}`;
        if (tested.has(key)) continue;
        tested.add(key);

        const isPost = form.method !== "GET";
        const bodyStr = `${encodeURIComponent(input.name)}=${encodeURIComponent(c.payload)}`;
        let testUrl: URL;
        try {
          testUrl = new URL(form.action);
        } catch {
          continue;
        }
        if (!isPost) {
          testUrl.searchParams.set(input.name, c.payload);
        }

        const r = await probe(testUrl.toString(), {
          method: isPost ? "POST" : "GET",
          body: isPost ? bodyStr : null,
          headers: isPost ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
          timeoutMs: 5000,
        });

        const reflected = r.body.includes(c.payload);
        const escaped = r.body.includes(c.payload.replace(/</g, "&lt;"));
        const vulnerable = reflected && !escaped;
        const isXssPayload = c.payload.includes("onerror=");
        const severity: Severity = vulnerable && isXssPayload ? "high" : "medium";

        results.push({
          name: isXssPayload
            ? `HTML/XSS via form field \`${input.name}\` (${c.name})`
            : `HTML Injection via form field \`${input.name}\` (${c.name})`,
          category: "HTML Injection",
          severity,
          cwe: "CWE-79",
          vulnerable,
          payload: c.payload,
          endpoint: form.action,
          method: isPost ? "POST" : "GET",
          status: r.status,
          durationMs: r.durationMs,
          proofRequest:
            `${isPost ? "POST" : "GET"} ${testUrl.toString()}\n` +
            (isPost ? `Body: ${bodyStr}\n` : "") +
            `Field \`${input.name}\` ← \`${c.payload}\``,
          proofResponse:
            `HTTP ${r.status} (${r.durationMs}ms)\n` +
            `Reflected verbatim: ${vulnerable ? "YES ⚠" : "no"}\n` +
            `HTML-escaped in body: ${escaped ? "yes (safe)" : "no"}\n` +
            `--- response excerpt ---\n${safeTruncate(r.body, 2000)}`,
          remediation:
            "Output-encode user-supplied form values before rendering. Use HTML escaping " +
            "(`&lt;` `&gt;` `&amp;` `&quot;`) for HTML context, or a sanitizer library. " +
            "Apply CSP headers to mitigate XSS impact.",
          indicator: vulnerable
            ? `Form field \`${input.name}\` reflected verbatim`
            : "Form value not reflected verbatim",
        });
      }
    }
  }

  return results;
}

// ─── CSRF (CWE-352, high) ────────────────────────────────────────────────

const CSRF_TOKEN_NAMES = [
  "csrf_token", "csrf", "_token", "authenticity_token", "_csrf",
  "csrfmiddlewaretoken", "x-csrf-token", "xsrf-token",
];

function formHasCsrfToken(form: ParsedForm, html: string): boolean {
  for (const input of form.inputs) {
    const lower = input.name.toLowerCase();
    if (CSRF_TOKEN_NAMES.includes(lower)) return true;
  }
  if (/<meta\b[^>]*csrf-token/i.test(html)) return true;
  if (/<meta\b[^>]*name\s*=\s*['"]_csrf['"]/i.test(html)) return true;
  return false;
}

async function testCsrf(
  targetUrl: URL,
  crawl: CrawlResult
): Promise<InjectionFinding[]> {
  const results: InjectionFinding[] = [];

  const stateChangingForms = crawl.forms.filter(
    (f) => f.method === "POST" || f.method === "PUT" || f.method === "DELETE"
  );

  for (const form of stateChangingForms.slice(0, 6)) {
    const hasToken = formHasCsrfToken(form, crawl.html);
    if (!hasToken) {
      results.push({
        name: `CSRF — state-changing ${form.method} form lacks anti-CSRF token`,
        category: "CSRF",
        severity: "high",
        cwe: "CWE-352",
        vulnerable: true,
        payload: "(no CSRF token in form)",
        endpoint: form.action,
        method: form.method,
        status: 0,
        durationMs: 0,
        proofRequest:
          `Form: <form method="${form.method}" action="${form.action}">\n` +
          `Inputs: ${form.inputs.map((i) => i.name).filter(Boolean).join(", ") || "(none)"}\n\n` +
          `Expected: <input name="csrf_token" type="hidden" value="…">\n` +
          `Actual: NO CSRF token field present in the form.`,
        proofResponse:
          `Form action: ${form.action}\n` +
          `Method: ${form.method}\n` +
          `CSRF token field found: NO\n` +
          `Inputs scanned: ${CSRF_TOKEN_NAMES.join(", ")}\n\n` +
          `A remote attacker can forge a cross-site request to this endpoint. ` +
          `Because no anti-CSRF token is required, the server cannot distinguish ` +
          `between a user-initiated request and a forged cross-origin request.`,
        remediation:
          "Add a synchronizer token pattern: include a per-session CSRF token as a hidden " +
          "input on every state-changing form, and validate it server-side on POST/PUT/DELETE. " +
          "Also enforce Origin / Referer header checks and use SameSite=Lax (or Strict) cookies.",
        indicator: `No CSRF token in ${form.method} form → ${form.action}`,
      });
    } else {
      results.push({
        name: `CSRF — ${form.method} form has anti-CSRF token`,
        category: "CSRF",
        severity: "info",
        cwe: "CWE-352",
        vulnerable: false,
        payload: "(CSRF token present)",
        endpoint: form.action,
        method: form.method,
        status: 0,
        durationMs: 0,
        proofRequest:
          `Form: <form method="${form.method}" action="${form.action}">\n` +
          `Inputs: ${form.inputs.map((i) => i.name).filter(Boolean).join(", ") || "(none)"}`,
        proofResponse:
          `Form action: ${form.action}\n` +
          `CSRF token field found: YES\n` +
          `The form includes an anti-CSRF token, which mitigates classic CSRF.`,
        remediation: "Continue enforcing CSRF tokens on all state-changing forms.",
        indicator: "CSRF token present in form",
      });
    }
  }

  // POST with NO Origin / NO Referer header
  {
    const probeUrl = targetUrl.toString();
    const r = await probe(probeUrl, {
      method: "POST",
      body: "test=guardianx-csrf-no-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeoutMs: 5000,
    });
    const processed = r.status >= 200 && r.status < 400;
    results.push({
      name: "CSRF — POST processed with no Origin / Referer header",
      category: "CSRF",
      severity: processed ? "high" : "info",
      cwe: "CWE-352",
      vulnerable: processed,
      payload: "POST (no Origin header)",
      endpoint: probeUrl,
      method: "POST",
      status: r.status,
      durationMs: r.durationMs,
      proofRequest:
        `POST ${probeUrl}\n` +
        `Content-Type: application/x-www-form-urlencoded\n` +
        `Body: test=guardianx-csrf-no-origin\n\n` +
        `Origin: <omitted>\nReferer: <omitted>`,
      proofResponse:
        `HTTP ${r.status} (${r.durationMs}ms)\n` +
        `Processed (2xx/3xx): ${processed ? "YES ⚠ — server accepted a state-changing request with no Origin/Referer" : "no"}\n` +
        `--- response excerpt ---\n${safeTruncate(r.body, 1500)}`,
      remediation:
        "Reject all state-changing requests that lack an Origin or Referer header. " +
        "Require a per-session CSRF token in addition to Origin/Referer checks (defense in depth).",
      indicator: processed
        ? "Server processed a POST with no Origin/Referer"
        : "Server rejected / errored the no-origin POST",
    });
  }

  // POST with cross-origin Origin: https://evil.com
  {
    const probeUrl = targetUrl.toString();
    const r = await probe(probeUrl, {
      method: "POST",
      body: "test=guardianx-csrf-cross-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://evil.com",
        Referer: "https://evil.com/",
      },
      timeoutMs: 5000,
    });
    const processed = r.status >= 200 && r.status < 400;
    results.push({
      name: "CSRF — POST processed with cross-origin Origin: https://evil.com",
      category: "CSRF",
      severity: processed ? "high" : "info",
      cwe: "CWE-352",
      vulnerable: processed,
      payload: "POST (Origin: https://evil.com)",
      endpoint: probeUrl,
      method: "POST",
      status: r.status,
      durationMs: r.durationMs,
      proofRequest:
        `POST ${probeUrl}\n` +
        `Content-Type: application/x-www-form-urlencoded\n` +
        `Origin: https://evil.com\n` +
        `Referer: https://evil.com/\n` +
        `Body: test=guardianx-csrf-cross-origin`,
      proofResponse:
        `HTTP ${r.status} (${r.durationMs}ms)\n` +
        `Processed with cross-origin Origin: ${processed ? "YES ⚠" : "no"}\n` +
        `--- response excerpt ---\n${safeTruncate(r.body, 1500)}`,
      remediation:
        "Validate the Origin header on every state-changing request and reject when it " +
        "does not match an allow-list of trusted origins. SameSite=Lax cookies provide a " +
        "first line of defense.",
      indicator: processed
        ? "Server processed cross-origin POST"
        : "Server rejected cross-origin POST",
    });
  }

  return results;
}

// ─── CORS (CWE-942, medium-high) ──────────────────────────────────────────

interface CorsProbe {
  name: string;
  origin: string;
  severity: Severity;
  indicator: string;
}

const CORS_PROBES: CorsProbe[] = [
  {
    name: "CORS — arbitrary Origin allowed (https://evil.com)",
    origin: "https://evil.com",
    severity: "high",
    indicator: "Access-Control-Allow-Origin reflects attacker origin",
  },
  {
    name: "CORS — null Origin allowed",
    origin: "null",
    severity: "medium",
    indicator: "Access-Control-Allow-Origin: null (sandbox iframe bypass)",
  },
  {
    name: "CORS — subdomain bypass (target.com.evil.com)",
    origin: "https://target.com.evil.com",
    severity: "high",
    indicator: "Server allows origin ending in evil.com (suffix-match bypass)",
  },
];

async function testCors(targetUrl: URL): Promise<InjectionFinding[]> {
  const results: InjectionFinding[] = [];
  const probeUrl = targetUrl.toString();

  for (const c of CORS_PROBES) {
    const r = await probe(probeUrl, {
      method: "OPTIONS",
      headers: {
        Origin: c.origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
      timeoutMs: 5000,
    });
    const acao = r.headers["access-control-allow-origin"] ?? "";
    const acac = r.headers["access-control-allow-credentials"] ?? "";
    const allowsWildcard = acao === "*";
    const allowsEchoOrigin = acao === c.origin;
    const allowsNull = c.origin === "null" && (acao === "null" || acao === "*");
    const subdomainBypass =
      c.origin === "https://target.com.evil.com" && acao === c.origin;

    const vulnerable = allowsWildcard || allowsEchoOrigin || allowsNull || subdomainBypass;
    const isCritical = vulnerable && acac.toLowerCase() === "true";
    const severity: Severity = isCritical
      ? "critical"
      : vulnerable
        ? c.severity
        : "info";

    results.push({
      name: c.name,
      category: "CORS",
      severity,
      cwe: "CWE-942",
      vulnerable,
      payload: `Origin: ${c.origin}`,
      endpoint: probeUrl,
      method: "OPTIONS",
      status: r.status,
      durationMs: r.durationMs,
      proofRequest:
        `OPTIONS ${probeUrl}\n` +
        `Origin: ${c.origin}\n` +
        `Access-Control-Request-Method: POST\n` +
        `Access-Control-Request-Headers: content-type`,
      proofResponse:
        `HTTP ${r.status} (${r.durationMs}ms)\n` +
        `Access-Control-Allow-Origin: ${acao || "(not set)"}\n` +
        `Access-Control-Allow-Credentials: ${acac || "(not set)"}\n` +
        `Vulnerable: ${vulnerable ? "YES ⚠" : "no"}\n` +
        (isCritical ? "⚠ CRITICAL: credentials=true with permissive origin\n" : "") +
        `--- response excerpt ---\n${safeTruncate(r.body, 1500)}`,
      remediation: isCritical
        ? "CRITICAL: Access-Control-Allow-Credentials: true must NEVER be paired with a wildcard or reflected origin. " +
          "Allow-list specific trusted origins only. Reject all others."
        : "Allow-list specific trusted origins in CORS responses. Never reflect arbitrary Origin headers. " +
          "Reject `null` origin. Suffix-match `endsWith` checks are unsafe — use exact-match allow-lists.",
      indicator: vulnerable
        ? `ACAO=${acao}${acac ? ` + credentials=${acac}` : ""}`
        : "ACAO not permissive (safe)",
    });
  }

  // GET probe with wildcard Origin to detect a non-preflight CORS leak
  {
    const r = await probe(probeUrl, {
      method: "GET",
      headers: { Origin: "https://evil.com" },
      timeoutMs: 5000,
    });
    const acao = r.headers["access-control-allow-origin"] ?? "";
    const acac = r.headers["access-control-allow-credentials"] ?? "";
    const vulnerable = acao === "*" || acao === "https://evil.com";
    const isCritical = vulnerable && acac.toLowerCase() === "true";
    const severity: Severity = isCritical ? "critical" : vulnerable ? "high" : "info";
    results.push({
      name: "CORS — GET response reflects permissive Access-Control-Allow-Origin",
      category: "CORS",
      severity,
      cwe: "CWE-942",
      vulnerable,
      payload: "GET (Origin: https://evil.com)",
      endpoint: probeUrl,
      method: "GET",
      status: r.status,
      durationMs: r.durationMs,
      proofRequest:
        `GET ${probeUrl}\n` +
        `Origin: https://evil.com`,
      proofResponse:
        `HTTP ${r.status} (${r.durationMs}ms)\n` +
        `Access-Control-Allow-Origin: ${acao || "(not set)"}\n` +
        `Access-Control-Allow-Credentials: ${acac || "(not set)"}\n` +
        `Vulnerable: ${vulnerable ? "YES ⚠" : "no"}\n` +
        (isCritical ? "⚠ CRITICAL: credentials=true + permissive origin\n" : "") +
        `--- response excerpt ---\n${safeTruncate(r.body, 1500)}`,
      remediation: isCritical
        ? "CRITICAL: Pairing `Access-Control-Allow-Credentials: true` with a reflected/wildcard origin allows ANY site to make authenticated cross-origin requests. Restrict to a hard-coded allow-list."
        : "Do not reflect arbitrary Origin headers. Use a strict allow-list of trusted origins.",
      indicator: vulnerable
        ? `GET ACAO=${acao}${acac ? ` + credentials=${acac}` : ""}`
        : "GET response has no permissive ACAO (safe)",
    });
  }

  return results;
}

// ─── Route Handler ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const rawTarget = typeof body?.targetUrl === "string" ? body.targetUrl : "";

  if (!rawTarget) {
    return NextResponse.json(
      { error: "targetUrl is required (e.g. https://app.example.com)." },
      { status: 400 }
    );
  }

  const v = validateTargetUrl(rawTarget);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const targetUrl = v.url;

  try {
    // ── Create Target + Engagement rows ────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `injection-suite:${targetUrl.host}`,
        baseUrl: targetUrl.toString(),
        authorized: true,
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id,
        status: "attacking",
        stageLabel: `Injection Suite — HTMLi / CSRF / CORS against ${targetUrl.host}`,
      },
    });

    // ── Crawl target for forms + endpoints ──────────────────────────────
    const crawl = await crawlTarget(targetUrl);

    // ── Run all three test categories in parallel ──────────────────────
    const [htmlFindings, csrfFindings, corsFindings] = await Promise.all([
      testHtmlInjection(targetUrl, crawl),
      testCsrf(targetUrl, crawl),
      testCors(targetUrl),
    ]);

    const allResults: InjectionFinding[] = [
      ...htmlFindings,
      ...csrfFindings,
      ...corsFindings,
    ];

    // ── Persist Findings for vulnerable tests ─────────────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    for (const r of vulnerableResults) {
      await db.finding.create({
        data: {
          engagementId: engagement.id,
          title: r.name,
          severity: r.severity,
          category: r.category,
          owasp: r.cwe,
          endpoint: r.endpoint,
          method: r.method,
          description:
            `${r.name} — ${r.cwe}. ` +
            `Indicator: ${r.indicator}. ` +
            `Payload \`${r.payload}\` was accepted/reflected by the target.`,
          proofRequest: r.proofRequest,
          proofResponse: r.proofResponse,
          payload: r.payload,
          remediation: r.remediation,
          confidence: r.severity === "critical" ? 0.95 : r.severity === "high" ? 0.85 : 0.7,
        },
      });
    }

    // ── Update engagement status ──────────────────────────────────────
    const criticalCount = vulnerableResults.filter((r) => r.severity === "critical").length;
    const highCount = vulnerableResults.filter((r) => r.severity === "high").length;
    await db.engagement.update({
      where: { id: engagement.id },
      data: {
        status: "completed",
        stageLabel:
          `Injection Suite complete — ${vulnerableResults.length} finding(s) ` +
          `(${criticalCount} critical, ${highCount} high) ` +
          `[HTMLi:${htmlFindings.filter((f) => f.vulnerable).length} ` +
          `CSRF:${csrfFindings.filter((f) => f.vulnerable).length} ` +
          `CORS:${corsFindings.filter((f) => f.vulnerable).length}]`,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      engagementId: engagement.id,
      targetId: target.id,
      testedBy: user.email,
      targetUrl: targetUrl.toString(),
      crawlSummary: {
        formsFound: crawl.forms.length,
        linksFound: crawl.links.length,
      },
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      highCount,
      categoryCounts: {
        "HTML Injection": {
          tested: htmlFindings.length,
          vulnerable: htmlFindings.filter((f) => f.vulnerable).length,
        },
        CSRF: {
          tested: csrfFindings.length,
          vulnerable: csrfFindings.filter((f) => f.vulnerable).length,
        },
        CORS: {
          tested: corsFindings.length,
          vulnerable: corsFindings.filter((f) => f.vulnerable).length,
        },
      },
      findings: allResults.map((r) => ({
        name: r.name,
        category: r.category,
        severity: r.severity,
        cwe: r.cwe,
        vulnerable: r.vulnerable,
        payload: r.payload,
        endpoint: r.endpoint,
        method: r.method,
        status: r.status,
        durationMs: r.durationMs,
        indicator: r.indicator,
        proofRequest: r.proofRequest,
        proofResponse: r.proofResponse,
        remediation: r.remediation,
      })),
      _meta: { targetId: target.id, performedAt: new Date().toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Injection suite failed.",
      },
      { status: 500 }
    );
  }
}

// GET — lightweight descriptor (no auth needed for discovery)
export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/injection-suite",
    method: "POST",
    description:
      "Injection Suite — combined HTML Injection (CWE-79), CSRF (CWE-352), and CORS (CWE-942) testing.",
    body: {
      targetUrl: "string (e.g. https://app.example.com)",
    },
    tests: [
      "HTML Injection — <h1>test</h1>, <b>bold</b>, <marquee>test</marquee>, <img src=x onerror=alert(1)> via query params + form fields",
      "CSRF — state-changing forms scanned for anti-CSRF token; no-Origin POST + cross-origin Origin POST",
      "CORS — OPTIONS preflight with arbitrary Origin, null Origin, subdomain bypass; GET with permissive ACAO + credentials check",
    ],
    cwe: ["CWE-79", "CWE-352", "CWE-942"],
  });
}
