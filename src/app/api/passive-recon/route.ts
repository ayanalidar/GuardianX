import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/passive-recon, passive reconnaissance (no active attacks)
// Checks SSL/TLS, HTTP headers, DNS, security configuration
// Body: { targetUrl: string }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { targetUrl } = await req.json().catch(() => ({}));
  if (!targetUrl) return NextResponse.json({ error: "targetUrl required" }, { status: 400 });

  try {
    const url = new URL(targetUrl);
    const hostname = url.hostname;

    const results: {
      ssl: { grade: string; issues: string[] };
      headers: { present: string[]; missing: string[]; details: Record<string, string> };
      dns: { records: Record<string, string[]> };
      security: { score: number; findings: { severity: string; title: string; detail: string }[] };
      technologies: { name: string; version: string | null }[];
    } = {
      ssl: { grade: "Unknown", issues: [] },
      headers: { present: [], missing: [], details: {} },
      dns: { records: {} },
      security: { score: 100, findings: [] },
      technologies: [],
    };

    // ── 1. HTTP Headers Analysis ──────────────────────────────────────────
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "GuardianX-Recon/1.0" },
      redirect: "follow",
    }).catch(() => null);

    if (res) {
      const securityHeaders = [
        "strict-transport-security",
        "content-security-policy",
        "x-frame-options",
        "x-content-type-options",
        "x-xss-protection",
        "referrer-policy",
        "permissions-policy",
        "x-permitted-cross-domain-policies",
        "cross-origin-opener-policy",
        "cross-origin-embedder-policy",
      ];

      for (const header of securityHeaders) {
        const value = res.headers.get(header);
        if (value) {
          results.headers.present.push(header);
          results.headers.details[header] = value;
        } else {
          results.headers.missing.push(header);
          results.security.score -= 5;
          results.security.findings.push({
            severity: "medium",
            title: `Missing Security Header: ${header}`,
            detail: `The ${header} header is not set. This header helps protect against various attacks.`,
          });
        }
      }

      // Check server version disclosure
      const server = res.headers.get("server");
      if (server) {
        results.technologies.push({ name: "Server", version: server });
        if (server.match(/\d+\.\d+/)) {
          results.security.findings.push({
            severity: "low",
            title: "Server Version Disclosure",
            detail: `Server header reveals version: ${server}. Attackers can use this to find known vulnerabilities.`,
          });
          results.security.score -= 5;
        }
      }

      const poweredBy = res.headers.get("x-powered-by");
      if (poweredBy) {
        results.technologies.push({ name: "Backend", version: poweredBy });
        results.security.findings.push({
          severity: "low",
          title: "Technology Disclosure",
          detail: `X-Powered-By header reveals: ${poweredBy}. Remove this header to prevent information leakage.`,
        });
        results.security.score -= 3;
      }

      // ── 2. SSL/TLS Analysis (basic) ────────────────────────────────────
      if (url.protocol === "https:") {
        results.ssl.grade = "A"; // Assume good if HTTPS works
        results.ssl.issues = [];

        // Check if HSTS is present
        const hsts = res.headers.get("strict-transport-security");
        if (!hsts) {
          results.ssl.issues.push("HSTS not enabled, site vulnerable to SSL strip attacks");
          results.security.findings.push({
            severity: "medium",
            title: "HSTS Not Enabled",
            detail: "HTTP Strict Transport Security (HSTS) is not set. Without it, users can be downgraded to HTTP.",
          });
          results.security.score -= 5;
        }

        // Check HSTS max-age
        if (hsts && hsts.includes("max-age=")) {
          const maxAgeMatch = hsts.match(/max-age=(\d+)/);
          if (maxAgeMatch) {
            const maxAge = parseInt(maxAgeMatch[1]);
            if (maxAge < 31536000) { // less than 1 year
              results.ssl.issues.push(`HSTS max-age is only ${maxAge}s, recommend at least 31536000 (1 year)`);
              results.security.findings.push({
                severity: "low",
                title: "HSTS Max-Age Too Short",
                detail: `HSTS max-age is ${Math.round(maxAge / 86400)} days. Recommend at least 365 days.`,
              });
              results.security.score -= 2;
            }
          }
        }
      } else {
        results.ssl.grade = "F";
        results.ssl.issues.push("Site does not use HTTPS, all traffic is unencrypted!");
        results.security.findings.push({
          severity: "critical",
          title: "No SSL/TLS Encryption",
          detail: "The site is served over HTTP without encryption. All data (including passwords) is transmitted in plaintext.",
        });
        results.security.score -= 30;
      }

      // ── 3. Technology Fingerprinting from HTML ─────────────────────────
      const html = await res.text().catch(() => "");
      if (html.includes("__NEXT_DATA__")) results.technologies.push({ name: "Next.js", version: null });
      if (html.includes("react")) results.technologies.push({ name: "React", version: null });
      if (html.includes("vue")) results.technologies.push({ name: "Vue.js", version: null });
      if (html.includes("wp-content")) results.technologies.push({ name: "WordPress", version: null });
      if (html.includes("jquery")) results.technologies.push({ name: "jQuery", version: null });
      if (html.includes("bootstrap")) results.technologies.push({ name: "Bootstrap", version: null });
      if (html.includes("tailwind")) results.technologies.push({ name: "Tailwind CSS", version: null });
      if (html.includes("cloudflare") || server?.toLowerCase().includes("cloudflare")) results.technologies.push({ name: "Cloudflare", version: null });
      if (html.includes("gatsby")) results.technologies.push({ name: "Gatsby", version: null });
      if (html.includes("sentry")) results.technologies.push({ name: "Sentry (monitoring)", version: null });
      if (html.includes("google-analytics") || html.includes("gtag")) results.technologies.push({ name: "Google Analytics", version: null });
    }

    // ── 4. DNS Records (via DNS over HTTPS) ──────────────────────────────
    const dnsTypes = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"];
    for (const type of dnsTypes) {
      try {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${hostname}&type=${type}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "Accept": "application/dns-json" },
        });
        const dnsData = await dnsRes.json();
        if (dnsData.Answer) {
          results.dns.records[type] = dnsData.Answer.map((a: Record<string, unknown>) => a.data as string);
        }
      } catch { /* ignore DNS errors */ }
    }

    // Check for SPF, DKIM, DMARC
    try {
      const txtRes = await fetch(`https://dns.google/resolve?name=${hostname}&type=TXT`, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/dns-json" },
      });
      const txtData = await txtRes.json();
      const txtRecords = (txtData.Answer || []).map((a: Record<string, unknown>) => a.data as string);
      const hasSPF = txtRecords.some((t: string) => t.includes("v=spf1"));
      const hasDMARC = txtRecords.some((t: string) => t.includes("v=DMARC1"));

      if (!hasSPF) {
        results.security.findings.push({
          severity: "medium",
          title: "SPF Record Missing",
          detail: "No SPF record found. Email spoofing is possible, attackers can send emails as your domain.",
        });
        results.security.score -= 5;
      }

      // Check DMARC
      const dmarcRes = await fetch(`https://dns.google/resolve?name=_dmarc.${hostname}&type=TXT`, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/dns-json" },
      });
      const dmarcData = await dmarcRes.json();
      if (!dmarcData.Answer || dmarcData.Answer.length === 0) {
        results.security.findings.push({
          severity: "medium",
          title: "DMARC Record Missing",
          detail: "No DMARC record found. Email authentication is incomplete, phishing emails can bypass filters.",
        });
        results.security.score -= 5;
      }
    } catch { /* ignore */ }

    results.security.score = Math.max(0, results.security.score);

    return NextResponse.json({
      ok: true,
      targetUrl,
      hostname,
      results,
      summary: {
        ssl_grade: results.ssl.grade,
        headers_present: results.headers.present.length,
        headers_missing: results.headers.missing.length,
        dns_records: Object.keys(results.dns.records).length,
        technologies: results.technologies.length,
        security_score: results.security.score,
        findings: results.security.findings.length,
      },
      message: `Passive recon complete: SSL=${results.ssl.grade}, ${results.headers.present.length}/${results.headers.present.length + results.headers.missing.length} headers, ${results.technologies.length} technologies, ${results.security.findings.length} findings, security score: ${results.security.score}/100`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
