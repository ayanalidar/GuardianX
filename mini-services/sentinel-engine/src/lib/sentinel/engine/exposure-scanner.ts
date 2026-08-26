// Sensitive Data Exposure Scanner.
// Detects exposed secrets + PII in HTTP responses and probes known exposure
// paths (.env, .git/, .DS_Store, backups, source maps, etc.).
//
// RESPONSIBLE DESIGN:
//   - Runs ONLY against targets the user has explicitly authorized.
//   - Stores only a REDACTED preview of any secret found (first4...last4),
//     never the full value. The goal is to PROVE the exposure for remediation,
//     not to exfiltrate credentials.
//   - Each finding maps to OWASP Top 10 (A02:2021 Cryptographic Failures,
//     A05:2021 Security Misconfiguration).

import { fetchUrl, type HttpResponse } from "./http-attacker";

export interface ExposureHit {
  type: string; // e.g. "AWS Access Key", "Stripe Secret Key", "SSN"
  category: "secret" | "pii" | "config";
  owasp: string; // e.g. "A02:2021-Cryptographic Failures"
  severity: "critical" | "high" | "medium" | "low";
  redactedSample: string; // first4...last4 — NEVER the full value
  count: number; // how many matches in this response
  context: string; // surrounding text (redacted) proving where it appeared
}

export interface ExposureFinding {
  url: string;
  method: string;
  status: number;
  hits: ExposureHit[];
}

// ── Secret patterns ────────────────────────────────────────────────────────
// Each detector: regex + metadata. Samples are redacted before storage.

interface Detector {
  type: string;
  category: "secret" | "pii" | "config";
  owasp: string;
  severity: "critical" | "high" | "medium" | "low";
  regex: RegExp;
}

const SECRET_DETECTORS: Detector[] = [
  {
    type: "AWS Access Key",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "critical",
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    type: "Google API Key",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "high",
    regex: /AIza[0-9A-Za-z\-_]{35}/g,
  },
  {
    type: "Stripe Secret Key",
    category: "secret",
    owasp: "A02:2021-Cryptographic Failures",
    severity: "critical",
    regex: /sk_live_[0-9a-zA-Z]{20,}/g,
  },
  {
    type: "Stripe Restricted Key",
    category: "secret",
    owasp: "A02:2021-Cryptographic Failures",
    severity: "critical",
    regex: /rk_live_[0-9a-zA-Z]{20,}/g,
  },
  {
    type: "GitHub Personal Access Token",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "critical",
    regex: /gh[pousr]_[A-Za-z0-9]{36,}/g,
  },
  {
    type: "Slack Token",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "high",
    regex: /xox[baprs]-[0-9A-Za-z\-]{10,}/g,
  },
  {
    type: "JWT Token",
    category: "secret",
    owasp: "A02:2021-Cryptographic Failures",
    severity: "high",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    type: "Private Key",
    category: "secret",
    owasp: "A02:2021-Cryptographic Failures",
    severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    type: "Database Connection String",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "critical",
    regex: /(?:mongodb|postgres|postgresql|mysql|redis|mssql):\/\/[^\s'"<>]+:[^\s'"<>]+@[^\s'"<>]+/g,
  },
  {
    type: "Generic API Key",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "high",
    regex: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9\-_]{16,}['"]/gi,
  },
  {
    type: "Password in Source",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "high",
    regex: /(?:pass(?:word|wd)?|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/gi,
  },
  {
    type: "AWS Secret Access Key",
    category: "secret",
    owasp: "A05:2021-Security Misconfiguration",
    severity: "critical",
    regex: /aws_secret_access_key\s*[:=]\s*['"][A-Za-z0-9/+=]{40}['"]/gi,
  },
  {
    type: "Bearer Token",
    category: "secret",
    owasp: "A02:2021-Cryptographic Failures",
    severity: "medium",
    regex: /Bearer\s+[A-Za-z0-9\-_\.]{20,}/g,
  },
];

// ── PII patterns ───────────────────────────────────────────────────────────

const PII_DETECTORS: Detector[] = [
  {
    type: "Social Security Number (SSN)",
    category: "pii",
    owasp: "A04:2021-Insecure Design",
    severity: "high",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: "Credit Card Number",
    category: "pii",
    owasp: "A04:2021-Insecure Design",
    severity: "critical",
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
  },
  {
    type: "Email Address",
    category: "pii",
    owasp: "A04:2021-Insecure Design",
    severity: "low",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
];

// ── Known exposure paths to probe ──────────────────────────────────────────

const KNOWN_PATHS: { path: string; label: string; owasp: string; severity: "critical" | "high" | "medium" | "low"; indicator?: RegExp }[] = [
  { path: "/.env", label: "Environment File Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /=/ },
  { path: "/.env.local", label: "Environment File Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /=/ },
  { path: "/.env.production", label: "Environment File Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /=/ },
  { path: "/.git/HEAD", label: "Git Repository Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high", indicator: /ref:\s+refs\/heads\// },
  { path: "/.git/config", label: "Git Repository Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high", indicator: /\[core\]|repositoryformatversion/ },
  { path: "/.DS_Store", label: "macOS Directory Listing Leak", owasp: "A05:2021-Security Misconfiguration", severity: "medium" },
  { path: "/backup.sql", label: "Database Backup Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /CREATE TABLE|INSERT INTO|-- MySQL dump/i },
  { path: "/db.sql", label: "Database Dump Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /CREATE TABLE|INSERT INTO/i },
  { path: "/dump.sql", label: "Database Dump Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /CREATE TABLE|INSERT INTO/i },
  { path: "/robots.txt", label: "Robots.txt Disclosure", owasp: "A05:2021-Security Misconfiguration", severity: "low", indicator: /User-agent|Disallow/i },
  { path: "/server-status", label: "Apache server-status Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high" },
  { path: "/server-info", label: "Apache server-info Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high" },
  { path: "/phpinfo.php", label: "PHP Info Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high", indicator: /PHP Version|phpinfo/i },
  { path: "/info.php", label: "PHP Info Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high", indicator: /PHP Version|phpinfo/i },
  { path: "/swagger.json", label: "Swagger API Spec Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "medium", indicator: /"swagger"|"openapi"/i },
  { path: "/api-docs", label: "API Docs Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "medium" },
  { path: "/wp-config.php.bak", label: "WordPress Config Backup Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /DB_PASSWORD|DB_USER/i },
  { path: "/config.php.bak", label: "Config Backup Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical" },
  { path: "/package.json", label: "package.json Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "low", indicator: /"dependencies"|"scripts"/i },
  { path: "/composer.json", label: "composer.json Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "low", indicator: /"require"/i },
  { path: "/admin", label: "Admin Panel Exposed", owasp: "A01:2021-Broken Access Control", severity: "medium" },
  { path: "/.svn/entries", label: "SVN Repository Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "high" },
  { path: "/.aws/credentials", label: "AWS Credentials File Exposure", owasp: "A05:2021-Security Misconfiguration", severity: "critical", indicator: /aws_access_key_id|aws_secret_access_key/i },
];

// ── Redaction ──────────────────────────────────────────────────────────────

/**
 * Redact a secret to a safe preview: first 4 + ... + last 4 chars.
 * For secrets shorter than 12 chars, redact entirely except the type.
 * This proves the exposure without storing the full credential.
 */
export function redactSecret(value: string): string {
  const clean = value.replace(/['"]/g, "").trim();
  if (clean.length <= 12) return "•".repeat(clean.length);
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

/**
 * Extract a redacted context window around a match (40 chars each side,
 * with the secret itself redacted).
 */
function redactedContext(body: string, matchStr: string): string {
  const idx = body.indexOf(matchStr);
  if (idx === -1) return "";
  const start = Math.max(0, idx - 30);
  const end = Math.min(body.length, idx + matchStr.length + 30);
  const before = body.slice(start, idx).replace(/\s+/g, " ").trim();
  const after = body.slice(idx + matchStr.length, end).replace(/\s+/g, " ").trim();
  return `…${before} [${redactSecret(matchStr)}] ${after}…`;
}

// ── Scanning ───────────────────────────────────────────────────────────────

/** Scan a single HTTP response for exposed secrets + PII. */
export function scanResponse(
  url: string,
  method: string,
  response: HttpResponse
): ExposureFinding | null {
  const body = response.body;
  if (!body || body.length === 0) return null;

  const hits: ExposureHit[] = [];
  const allDetectors = [...SECRET_DETECTORS, ...PII_DETECTORS];

  for (const det of allDetectors) {
    const matches = body.match(det.regex);
    if (!matches || matches.length === 0) continue;

    // Dedupe matches (case-insensitive) and cap context sampling
    const unique = [...new Set(matches)].slice(0, 3);
    const sample = unique[0] ?? "";
    hits.push({
      type: det.type,
      category: det.category,
      owasp: det.owasp,
      severity: det.severity,
      redactedSample: redactSecret(sample),
      count: matches.length,
      context: redactedContext(body, sample),
    });
  }

  if (hits.length === 0) return null;
  return { url, method, status: response.status, hits };
}

export interface ProbeResult {
  path: string;
  label: string;
  owasp: string;
  severity: "critical" | "high" | "medium" | "low";
  status: number;
  found: boolean;
  redactedSample: string;
  bodySize: number;
}

/** Probe known exposure paths against a base URL. */
export async function probeKnownPaths(
  baseUrl: string,
  authHeader?: string | null
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const base = baseUrl.replace(/\/$/, "");

  // Probe sequentially with a small concurrency to be gentle on the target.
  const concurrency = 4;
  for (let i = 0; i < KNOWN_PATHS.length; i += concurrency) {
    const batch = KNOWN_PATHS.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await fetchUrl(`${base}${p.path}`, {
            headers: authHeader ? { Authorization: authHeader } : {},
            timeoutMs: 6000,
          });
          // Found if 200 + (no indicator or indicator matches) + body not a generic 404 page
          const indicatorOk = !p.indicator || p.indicator.test(res.body);
          const looksLike404 =
            res.body.length < 50 &&
            /not found|404/i.test(res.body);
          const found = res.status === 200 && indicatorOk && !looksLike404;
          return {
            path: p.path,
            label: p.label,
            owasp: p.owasp,
            severity: p.severity,
            status: res.status,
            found,
            redactedSample: found
              ? redactSecret(res.body.slice(0, 80).replace(/\s+/g, " ").trim())
              : "",
            bodySize: res.body.length,
          } satisfies ProbeResult;
        } catch {
          return {
            path: p.path,
            label: p.label,
            owasp: p.owasp,
            severity: p.severity,
            status: 0,
            found: false,
            redactedSample: "",
            bodySize: 0,
          } satisfies ProbeResult;
        }
      })
    );
    results.push(...batchResults);
  }

  return results.filter((r) => r.found);
}
