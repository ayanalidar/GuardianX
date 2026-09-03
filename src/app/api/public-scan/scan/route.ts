// POST /api/public-scan/scan
//
// Public endpoint (NO auth required — anyone on the homepage can scan).
// Runs a REAL, non-intrusive HTTP recon against the requested URL:
//   1. fetch the URL (follow redirects, capture status + headers)
//   2. probe well-known paths (/robots.txt, /.env, /.git/HEAD, etc.)
//   3. inspect response headers for missing security headers
//   4. (best-effort) ask the Z.AI LLM for an executive summary
//   5. compute an overall 0-100 security score
//   6. persist everything to the WebsiteScan table
//
// SSRF protections:
//   - URL must be http(s) and parse cleanly via node:url.
//   - hostname is blocked if it's a private/internal IP literal
//     (10.x / 192.168.x / 172.16-31.x / 127.x / 169.254.x / ::1 / fc00::/7)
//     or a "localhost" name.
//   - We do NOT resolve arbitrary hostnames to IPs and re-check (would
//     require DNS + isIp shenanigans + the runtime cost is unwarranted for
//     a public free-scan endpoint). IP-literal blocking covers the
//     "scanning the metadata service at 169.254.169.254" attack.
//
// Timeouts:
//   - main URL fetch: 10s AbortController
//   - each path probe: 5s AbortController
//
// LLM:
//   - `ensureZaiConfig()` is called BEFORE `ZAI.create()` so the SDK finds
//     its config file in serverless environments (Vercel) where cwd/homedir
//     aren't writable.
//   - All LLM work is wrapped in try/catch — a failure falls back to a
//     templated summary so the scan never crashes on the LLM.
//
// Latency budget: Vercel hobby function timeout is 10-15s; we use
// `maxDuration = 30` to be safe on Pro. The total scan should finish in
// 6-9s in the happy path.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureZaiConfig } from "@/lib/zai-config";
import ZAI from "z-ai-web-dev-sdk";
import { URL as NodeURL } from "node:url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// ── Finding shape (stored as JSON string in `WebsiteScan.findings`) ─────────
type Severity = "critical" | "high" | "medium" | "low" | "info";

interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  endpoint: string;
  method: string;
  description: string;
  remediation: string;
  evidence?: string;
}

// ── SSRF guard ────────────────────────────────────────────────────────────
// Matches IPv4 literals in the major private/reserved ranges + IPv6 loopback
// + IPv6 ULA. Hostnames like "localhost" / "*.local" are also blocked.
const PRIVATE_IP_REGEX =
  /^(127\.)|(10\.)|(192\.168\.)|(169\.254\.)|(0\.)|(100\.6[4-9]\.)|(100\.[7-9]\d\.)|(100\.1[0-1]\d\.)|(100\.12[0-7]\.)|(172\.(1[6-9]|2\d|3[01])\.)/;
const IPV6_LOOPBACK_OR_ULA = /^(::1$)|(^fc)|(^fd)|(^fe80)/i;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true; // GCP metadata endpoint
  if (PRIVATE_IP_REGEX.test(h)) return true;
  if (IPV6_LOOPBACK_OR_ULA.test(h)) return true;
  return false;
}

// ── URL validation ───────────────────────────────────────────────────────
function parseAndValidateUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let candidate = raw.trim();
  if (!candidate) return { ok: false, reason: "URL is required." };
  if (candidate.length > 2048) return { ok: false, reason: "URL is too long." };

  // Auto-prefix https:// if the user typed "example.com" without a scheme.
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: NodeURL;
  try {
    parsed = new NodeURL(candidate);
  } catch {
    return { ok: false, reason: "URL did not parse — please enter a valid http(s) URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: "URL is missing a hostname." };
  }

  // Reject "no-dot" hostnames like "foo" or "intranet".
  if (!parsed.hostname.includes(".")) {
    return { ok: false, reason: "URL must point to a public hostname (e.g. example.com)." };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: "Refusing to scan private/internal hosts (SSRF protection)." };
  }

  // Strip the hash (fragment) — it isn't sent to the server anyway.
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}

// ── fetch with timeout ────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

// ── Severity counters ──────────────────────────────────────────────────────
function emptyCounts() {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function computeScore(c: Record<Severity, number>): number {
  let s = 100;
  s -= c.critical * 20;
  s -= c.high * 10;
  s -= c.medium * 5;
  s -= c.low * 2;
  // info findings don't reduce the score
  return Math.max(0, Math.min(100, s));
}

// ── Security header probes ─────────────────────────────────────────────────
interface HeaderProbe {
  header: string;
  severity: Severity;
  title: string;
  description: string;
  remediation: string;
}

const HEADER_PROBES: HeaderProbe[] = [
  {
    header: "strict-transport-security",
    severity: "medium",
    title: "Missing Strict-Transport-Security (HSTS)",
    description:
      "The HSTS response header is not set, allowing man-in-the-middle SSL stripping attacks on clients that accept HTTP first.",
    remediation:
      "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` to all HTTPS responses.",
  },
  {
    header: "content-security-policy",
    severity: "medium",
    title: "Missing Content-Security-Policy",
    description:
      "No CSP header is set, leaving the page vulnerable to injected scripts (XSS) and data exfiltration.",
    remediation:
      "Set a strict Content-Security-Policy header (e.g. `default-src 'self'`).",
  },
  {
    header: "x-frame-options",
    severity: "low",
    title: "Missing X-Frame-Options (clickjacking risk)",
    description:
      "The page can be framed by any origin, enabling clickjacking attacks against authenticated users.",
    remediation:
      "Set `X-Frame-Options: DENY` or use `Content-Security-Policy: frame-ancestors 'none'`.",
  },
  {
    header: "x-content-type-options",
    severity: "low",
    title: "Missing X-Content-Type-Options",
    description:
      "Without `X-Content-Type-Options: nosniff`, browsers may MIME-sniff responses and execute non-script files as scripts.",
    remediation: "Set `X-Content-Type-Options: nosniff`.",
  },
  {
    header: "referrer-policy",
    severity: "low",
    title: "Missing Referrer-Policy",
    description:
      "No Referrer-Policy is set; the full URL (including query strings that may contain tokens) may leak to third-party sites.",
    remediation: "Set `Referrer-Policy: strict-origin-when-cross-origin`.",
  },
  {
    header: "permissions-policy",
    severity: "low",
    title: "Missing Permissions-Policy",
    description:
      "No Permissions-Policy header is set, allowing browser features (camera, microphone, geolocation) to be invoked by any origin the page embeds.",
    remediation: "Set a restrictive `Permissions-Policy` header.",
  },
];

interface PathProbe {
  path: string;
  severity: Severity;
  title: string;
  description: string;
  remediation: string;
  category: string;
  method: string;
}

const PATH_PROBES: PathProbe[] = [
  {
    path: "/robots.txt",
    severity: "info",
    title: "robots.txt publicly accessible",
    description:
      "A robots.txt file is reachable at /robots.txt. This is normal — but inspect it for sensitive paths it asks crawlers to avoid (those paths are now known to attackers).",
    remediation: "Review robots.txt for sensitive path disclosures.",
    category: "recon",
    method: "GET",
  },
  {
    path: "/security.txt",
    severity: "info",
    title: "security.txt present (good practice)",
    description:
      "A security.txt file is present, indicating a published vulnerability disclosure policy. This is a positive signal.",
    remediation: "Keep security.txt up to date with current contact + PGP key.",
    category: "recon",
    method: "GET",
  },
  {
    path: "/.well-known/security.txt",
    severity: "info",
    title: "security.txt at well-known path",
    description:
      "A security.txt file is reachable at the RFC 9116 well-known path — good practice.",
    remediation: "Keep security.txt up to date.",
    category: "recon",
    method: "GET",
  },
  {
    path: "/.env",
    severity: "critical",
    title: ".env file publicly accessible!",
    description:
      "A `.env` file is reachable at the site root. This typically contains database credentials, API keys, and secrets. Immediate remediation required.",
    remediation:
      "Block /\\.env at the web server / CDN level and rotate every secret that was in the file.",
    category: "exposure",
    method: "GET",
  },
  {
    path: "/.git/HEAD",
    severity: "critical",
    title: ".git directory exposed",
    description:
      "The /\\.git/HEAD file is reachable, which means the entire git history (including past secrets) can be downloaded. Immediate remediation required.",
    remediation:
      "Block /\\.git/.* at the web server / CDN level. Rotate any secrets ever committed to the repo.",
    category: "exposure",
    method: "GET",
  },
];

// ── LLM summary (best-effort) ──────────────────────────────────────────────
async function llmSummary(url: string, findings: ScanFinding[]): Promise<string> {
  ensureZaiConfig();
  const z = await ZAI.create();

  const compact = findings.map((f) => ({
    severity: f.severity,
    title: f.title,
    endpoint: f.endpoint,
    description: f.description,
  }));

  const completion = await z.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You are GuardianX, a security advisor. Given a list of security scan findings for a website, write a 2-3 sentence executive summary of the site's security posture for a non-technical reader. Be concrete and reference the most severe finding. Do not use bullet points or headings — just prose.",
      },
      {
        role: "user",
        content: `URL: ${url}\nFindings (JSON):\n${JSON.stringify(compact)}`,
      },
    ],
    thinking: { type: "disabled" },
  });

  const text = (completion.choices[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Empty LLM response");
  return text;
}

function templatedSummary(findings: ScanFinding[]): string {
  if (findings.length === 0) {
    return "GuardianX found no obvious security issues during this external scan. We recommend re-scanning periodically and after any infrastructure change.";
  }
  const bySeverity: Record<Severity, number> = emptyCounts();
  for (const f of findings) bySeverity[f.severity] += 1;
  const categories = new Set(findings.map((f) => f.category)).size;
  const topOrder: Severity[] = ["critical", "high", "medium", "low", "info"];
  const top = findings
    .slice()
    .sort((a, b) => topOrder.indexOf(a.severity) - topOrder.indexOf(b.severity))
    .slice(0, 1)[0];
  return (
    `GuardianX identified ${findings.length} security issue${findings.length === 1 ? "" : "s"} ` +
    `across ${categories} categor${categories === 1 ? "y" : "ies"}. ` +
    `The most severe is "${top.title}" (${top.severity.toUpperCase()}) at ${top.endpoint}. ` +
    `We recommend prioritising remediation by severity and re-scanning after fixes are deployed.`
  );
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const startedAt = Date.now();

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { url?: unknown; email?: unknown };
  try {
    body = (await req.json()) as { url?: unknown; email?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url : "";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

  const validation = parseAndValidateUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  const url = validation.url;

  // ── Capture request metadata ─────────────────────────────────────────────
  const xff = req.headers.get("x-forwarded-for");
  const ipAddress = xff ? xff.split(",")[0].trim() : null;
  const userAgent = req.headers.get("user-agent");

  // ── Create the scan row (status=running) ──────────────────────────────────
  // Wrapped in try/catch — if the DB is unavailable or the table doesn't
  // exist yet, we still run the scan and return results (just don't persist).
  let scanId: string | null = null;
  try {
    const scan = await db.websiteScan.create({
      data: {
        url,
        email,
        status: "running",
        ipAddress,
        userAgent,
      },
    });
    scanId = scan.id;
  } catch (dbErr) {
    console.warn("[public-scan/scan] DB create failed — running scan without persistence:", dbErr instanceof Error ? dbErr.message : dbErr);
  }

  // ── Run real recon ────────────────────────────────────────────────────────
  const findings: ScanFinding[] = [];
  const counts = emptyCounts();
  let finalUrl = url;

  try {
    const mainRes = await fetchWithTimeout(url, 10_000, {
      headers: {
        "User-Agent": "GuardianX-Free-Scan/1.0 (+https://guardianx.in)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    finalUrl = mainRes.url || url;

    const headers = mainRes.headers;

    // ── Security header probes ───────────────────────────────────────────────
    for (const probe of HEADER_PROBES) {
      const value = headers.get(probe.header);
      if (!value || value.trim() === "") {
        findings.push({
          id: `H-${probe.header}`,
          title: probe.title,
          severity: probe.severity,
          category: "headers",
          endpoint: "/",
          method: "GET",
          description: probe.description,
          remediation: probe.remediation,
        });
        counts[probe.severity] += 1;
      }
    }

    // ── Server / X-Powered-By version disclosure ─────────────────────────────
    const serverHeader = headers.get("server");
    if (serverHeader && serverHeader.trim()) {
      findings.push({
        id: "H-server-disclosure",
        title: "Server header discloses software/version",
        severity: "low",
        category: "disclosure",
        endpoint: "/",
        method: "GET",
        description: `The \`Server\` response header is set to "${serverHeader}". Disclosing server software versions eases targeted exploits.`,
        remediation: "Suppress or genericize the `Server` header in your web server config.",
        evidence: `Server: ${serverHeader}`,
      });
      counts.low += 1;
    }

    const poweredBy = headers.get("x-powered-by");
    if (poweredBy && poweredBy.trim()) {
      findings.push({
        id: "H-powered-by",
        title: "X-Powered-By leaks technology stack",
        severity: "low",
        category: "disclosure",
        endpoint: "/",
        method: "GET",
        description: `The \`X-Powered-By\` response header is set to "${poweredBy}", disclosing the application framework and easing attacker reconnaissance.`,
        remediation: "Disable the `X-Powered-By` header in your framework config.",
        evidence: `X-Powered-By: ${poweredBy}`,
      });
      counts.low += 1;
    }
  } catch (err) {
    // Main fetch failed: DNS / connection refused / TLS error / timeout.
    // Record as info finding but keep going — we still want to probe paths.
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? "timed out after 10s"
          : err.message
        : "unknown fetch failure";
    findings.push({
      id: "F-main-fetch-failed",
      title: "Could not fetch the URL",
      severity: "info",
      category: "recon",
      endpoint: url,
      method: "GET",
      description: `GuardianX could not establish a connection to the URL (${reason}). The site may be down, the DNS may not resolve, or the TLS certificate may be invalid. Subsequent path probes were still attempted.`,
      remediation:
        "Verify the site is reachable from a browser. If TLS is misconfigured, renew / re-chain the certificate.",
      evidence: reason,
    });
    counts.info += 1;

    // If the URL is https and the error mentions the cert, surface it as critical.
    if (url.startsWith("https://") && /cert|tls|ssl|certificate/i.test(reason)) {
      findings.push({
        id: "F-tls-cert-issue",
        title: "TLS certificate issue detected",
        severity: "critical",
        category: "tls",
        endpoint: url,
        method: "TLS",
        description:
          "The HTTPS handshake failed in a way consistent with an invalid, expired, or mis-chained TLS certificate. Browsers will warn users and many will refuse to load the page.",
        remediation:
          "Renew the certificate, ensure the full chain is served, and use a CA in the common trust store (Let's Encrypt, DigiCert, etc.).",
        evidence: reason,
      });
      counts.critical += 1;
    }
  }

  // ── Path probes (parallel, each with 5s timeout) ───────────────────────────
  // Use the final URL (after redirects) as the base for path probes. If the
  // main fetch failed we fall back to the originally-requested URL.
  const baseUrl = (() => {
    try {
      const u = new URL(finalUrl || url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return url.replace(/\/$/, "");
    }
  })();

  await Promise.all(
    PATH_PROBES.map(async (probe) => {
      const probeUrl = `${baseUrl}${probe.path}`;
      try {
        const res = await fetchWithTimeout(probeUrl, 5_000, {
          headers: { "User-Agent": "GuardianX-Free-Scan/1.0 (+https://guardianx.in)" },
        });
        if (res.ok) {
          // For .env / .git we want to be very sure — fetch the first ~2KB
          // and confirm it actually looks like the file we asked for. Avoids
          // a false-positive on a SPA that returns 200 + index.html for any
          // path (a common misconfiguration). For .env / .git we require the
          // content to match the expected pattern; otherwise we skip it.
          if (probe.severity === "critical") {
            const sample = await res.text().catch(() => "");
            let looksReal = false;
            if (probe.path === "/.env") {
              // Look for at least one KEY=value pair (allow leading export).
              looksReal = /(^|\n)\s*(?:export\s+)?[A-Z][A-Z0-9_]*\s*=/.test(sample);
            } else if (probe.path === "/.git/HEAD") {
              // Either "ref: refs/heads/<branch>" or a 40-char sha1 (packed).
              looksReal = /ref:\s*refs\/heads\//.test(sample) || /^[0-9a-f]{40}\s*$/m.test(sample);
            }
            if (!looksReal) return;
          }
          findings.push({
            id: `P-${probe.path}`,
            title: probe.title,
            severity: probe.severity,
            category: probe.category,
            endpoint: probe.path,
            method: probe.method,
            description: probe.description,
            remediation: probe.remediation,
          });
          counts[probe.severity] += 1;
        }
      } catch {
        // Probe failed (timeout / DNS / refused) — silently skip. We do not
        // want to flood the findings list with one "info" entry per probe
        // failure; that would dilute the signal.
      }
    }),
  );

  // ── LLM summary (best-effort, fallback to template) ─────────────────────────
  let summary = "";
  try {
    summary = await llmSummary(url, findings);
  } catch (err) {
    console.warn(
      "[public-scan/scan] LLM summary failed, using templated summary:",
      err instanceof Error ? err.message : err,
    );
    summary = templatedSummary(findings);
  }

  // ── Compute score + counts ─────────────────────────────────────────────────
  const score = computeScore(counts);
  const duration = Date.now() - startedAt;
  const completedAt = new Date();

  // ── Persist results ───────────────────────────────────────────────────────
  if (scanId) {
    try {
    await db.websiteScan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        score,
        findingsCount: findings.length,
        criticalCount: counts.critical,
        highCount: counts.high,
        mediumCount: counts.medium,
        lowCount: counts.low,
        findings: JSON.stringify(findings),
        completedAt,
        duration,
      },
    });
  } catch (err) {
    console.error("[public-scan/scan] failed to persist scan row:", err);
  }
  } // end if (scanId)

  return NextResponse.json({
    scanId: scanId || "untracked",
    url,
    score,
    findingsCount: findings.length,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    findings,
    summary,
    completedAt: completedAt.toISOString(),
  });
}
