// POST /api/public-scan/send-report
//
// Public endpoint (NO auth required — visitor provides their email after
// the scan completes on the homepage).
//
// Body: { scanId: string, email: string }
//
// Behaviour:
//   1. Validate email format.
//   2. Fetch the WebsiteScan row by `scanId`. If not found, 404.
//   3. If `reportSent` is already true, return 200 with an idempotent
//      "already sent" message — protects against double-sends if the user
//      clicks twice.
//   4. Generate a professional HTML email report (dark theme, emerald
//      accents, inline styles, `<table>`-based findings list — email
//      clients strip external CSS and render tables reliably).
//   5. Call `sendEmail(...)` from @/lib/email. SMTP credentials come from
//      env (SMTP_HOST / SMTP_USER / SMTP_PASS). On Vercel these are set
//      in the project settings. The sendEmail helper fail-softs if SMTP
//      isn't configured — in that case we return a 200 with a "delivery
//      unavailable right now, scan still saved" message rather than 500,
//      because the visitor already has their findings on screen.
//   6. If the email send succeeds, set `reportSent: true` on the row,
//      write the same HTML to `/tmp/scan-report-${scanId}.html` (for a
//      future download link), return 200.
//
// Colour policy: NO indigo / blue. Severity → {critical: red, high:
// amber, medium: yellow, low: cyan, info: zinc}. Score → {≥80 emerald,
// 60-79 amber, 40-59 yellow, <40 red}. Background #0a0a0a, accent emerald.

import { NextResponse } from "next/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// ── Finding shape (must match scan/route.ts; declared locally to avoid
// creating a shared file outside the allowed scope) ─────────────────────────
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

// ── Email + format validation ────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Severity → colour palette (no indigo / blue) ───────────────────────────
const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: "#450a0a", text: "#fca5a5", border: "#dc2626", label: "CRITICAL" },
  high: { bg: "#451a03", text: "#fcd34d", border: "#d97706", label: "HIGH" },
  medium: { bg: "#422006", text: "#fde68a", border: "#ca8a04", label: "MEDIUM" },
  low: { bg: "#083344", text: "#67e8f9", border: "#06b6d4", label: "LOW" },
  info: { bg: "#18181b", text: "#d4d4d8", border: "#52525b", label: "INFO" },
};

function scoreColour(score: number): string {
  if (score >= 80) return "#10b981"; // emerald
  if (score >= 60) return "#f59e0b"; // amber
  if (score >= 40) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── HTML report builder ────────────────────────────────────────────────────
// Used for BOTH the email HTML body AND the static /tmp/scan-report-<id>.html
// file (so the downloaded report is identical to the emailed one).
function buildReportHtml(opts: {
  url: string;
  scannedAt: Date;
  score: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: ScanFinding[];
  summary: string;
  scanId: string;
}): string {
  const {
    url,
    scannedAt,
    score,
    findingsCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    findings,
    summary,
    scanId,
  } = opts;

  const dateStr = scannedAt.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  const scoreText = score === null ? "N/A" : String(score);
  const scoreCol = score === null ? "#52525b" : scoreColour(score);

  // ── Severity count chips row ────────────────────────────────────────────
  const sevChip = (label: string, count: number, sev: Severity) => {
    const style = SEVERITY_STYLE[sev];
    return (
      `<td style="padding:6px 10px;text-align:center;background:${style.bg};` +
      `border:1px solid ${style.border};border-radius:6px;color:${style.text};` +
      `font-family:monospace,monospace;font-size:11px;letter-spacing:0.5px;">` +
      `<strong style="font-size:14px;">${count}</strong><br/>${label}</td>`
    );
  };

  // ── Findings table rows ──────────────────────────────────────────────────
  const findingRows =
    findings.length === 0
      ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#a1a1aa;` +
        `font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;">` +
        `No findings were detected during this scan. 🎉</td></tr>`
      : findings
          .map((f) => {
            const style = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info;
            return (
              `<tr>` +
              `<td style="padding:10px 12px;border-bottom:1px solid #27272a;vertical-align:top;">` +
              `<span style="display:inline-block;padding:2px 8px;background:${style.bg};` +
              `color:${style.text};border:1px solid ${style.border};border-radius:4px;` +
              `font-family:monospace,monospace;font-size:10px;font-weight:bold;letter-spacing:0.5px;">` +
              `${style.label}</span>` +
              `</td>` +
              `<td style="padding:10px 12px;border-bottom:1px solid #27272a;vertical-align:top;">` +
              `<div style="color:#f4f4f5;font-weight:600;font-size:13px;margin-bottom:3px;">${escapeHtml(f.title)}</div>` +
              `<div style="color:#71717a;font-family:monospace,monospace;font-size:11px;">` +
              `${escapeHtml(f.method)} ${escapeHtml(f.endpoint)}</div>` +
              `</td>` +
              `<td style="padding:10px 12px;border-bottom:1px solid #27272a;vertical-align:top;` +
              `color:#d4d4d8;font-size:12px;line-height:1.5;">${escapeHtml(f.description)}</td>` +
              `<td style="padding:10px 12px;border-bottom:1px solid #27272a;vertical-align:top;` +
              `color:#86efac;font-size:12px;line-height:1.5;">${escapeHtml(f.remediation)}</td>` +
              `</tr>`
            );
          })
          .join("");

  // ── Counts row ────────────────────────────────────────────────────────────
  const countsRow =
    `<tr>` +
    sevChip("CRIT", criticalCount, "critical") +
    sevChip("HIGH", highCount, "high") +
    sevChip("MED", mediumCount, "medium") +
    sevChip("LOW", lowCount, "low") +
    `</tr>`;

  // ── Report URL ────────────────────────────────────────────────────────────
  const reportUrl = `https://guardianx-two.vercel.app/scan/${scanId}`;

  // ── Final HTML ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GuardianX Security Report — ${escapeHtml(url)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
<tr><td align="center" style="padding:24px 12px;">

<!-- outer container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="max-width:600px;width:100%;background:#0a0a0a;border:1px solid #1f2a26;border-radius:12px;overflow:hidden;">

  <!-- ── Branding header ─────────────────────────────────────────────── -->
  <tr>
    <td style="padding:24px 28px;background:linear-gradient(135deg,#052e1c 0%,#0a0a0a 100%);border-bottom:1px solid #1f2a26;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:3px;color:#10b981;text-transform:uppercase;margin-bottom:4px;">// GuardianX</div>
            <div style="font-size:22px;font-weight:700;color:#f4f4f5;letter-spacing:-0.5px;">Security Scan Report</div>
          </td>
          <td align="right" style="vertical-align:middle;">
            <div style="display:inline-block;padding:6px 10px;background:#062b1a;border:1px solid #10b981;border-radius:4px;font-family:monospace,monospace;font-size:10px;color:#6ee7b7;letter-spacing:1px;">AUTONOMOUS SOC</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── URL + scan date ────────────────────────────────────────────── -->
  <tr>
    <td style="padding:20px 28px 4px 28px;">
      <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:4px;">Scanned URL</div>
      <div style="font-size:14px;color:#67e8f9;font-family:monospace,monospace;word-break:break-all;">${escapeHtml(url)}</div>
      <div style="margin-top:10px;font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:4px;">Scan Date</div>
      <div style="font-size:12px;color:#a1a1aa;">${escapeHtml(dateStr)}</div>
    </td>
  </tr>

  <!-- ── Big score ──────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:24px 28px 12px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#0a0a0a;border:1px solid #1f2a26;border-radius:10px;">
        <tr>
          <td style="padding:20px 24px;vertical-align:middle;width:130px;">
            <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:4px;">Security Score</div>
            <div style="font-size:54px;font-weight:800;color:${scoreCol};line-height:1;letter-spacing:-2px;">${escapeHtml(scoreText)}</div>
            <div style="font-family:monospace,monospace;font-size:10px;color:#52525b;letter-spacing:1px;margin-top:4px;">/ 100</div>
          </td>
          <td style="padding:12px 12px;vertical-align:middle;">
            <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:8px;">Severity Breakdown</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${countsRow}
              </tr>
              <tr><td colspan="4" style="height:6px;"></td></tr>
              <tr>
                <td colspan="4" style="font-family:monospace,monospace;font-size:10px;color:#71717a;padding:4px 4px 0 4px;">
                  ${findingsCount} finding${findingsCount === 1 ? "" : "s"} detected
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── LLM summary ─────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:8px 28px 12px 28px;">
      <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:6px;">Executive Summary</div>
      <div style="background:#08130d;border-left:3px solid #10b981;padding:14px 16px;border-radius:0 8px 8px 0;">
        <div style="color:#d1fae5;font-size:13px;line-height:1.6;">${escapeHtml(summary)}</div>
      </div>
    </td>
  </tr>

  <!-- ── Findings table ─────────────────────────────────────────────── -->
  <tr>
    <td style="padding:8px 28px 24px 28px;">
      <div style="font-family:monospace,monospace;font-size:10px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:8px;">Findings</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #1f2a26;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0c1410;">
            <th style="padding:8px 12px;text-align:left;font-family:monospace,monospace;font-size:10px;letter-spacing:1px;color:#71717a;border-bottom:1px solid #1f2a26;width:90px;">SEVERITY</th>
            <th style="padding:8px 12px;text-align:left;font-family:monospace,monospace;font-size:10px;letter-spacing:1px;color:#71717a;border-bottom:1px solid #1f2a26;">TITLE / ENDPOINT</th>
            <th style="padding:8px 12px;text-align:left;font-family:monospace,monospace;font-size:10px;letter-spacing:1px;color:#71717a;border-bottom:1px solid #1f2a26;">DESCRIPTION</th>
            <th style="padding:8px 12px;text-align:left;font-family:monospace,monospace;font-size:10px;letter-spacing:1px;color:#71717a;border-bottom:1px solid #1f2a26;">REMEDIATION</th>
          </tr>
        </thead>
        <tbody>
          ${findingRows}
        </tbody>
      </table>
    </td>
  </tr>

  <!-- ── CTA button ─────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:8px 28px 28px 28px;" align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#10b981;border:1px solid #34d399;border-radius:6px;">
            <a href="${escapeHtml(reportUrl)}"
               style="display:inline-block;padding:12px 28px;color:#052e1c;font-weight:700;font-size:13px;letter-spacing:0.5px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              View Full Report Online →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Footer ─────────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:16px 28px;background:#080b09;border-top:1px solid #1f2a26;">
      <div style="font-family:monospace,monospace;font-size:10px;color:#52525b;letter-spacing:1px;text-align:center;line-height:1.7;">
        Generated by <span style="color:#10b981;">GuardianX</span> · hello@guardianx.in<br/>
        This report reflects an external, non-intrusive scan at the time of execution.
      </div>
    </td>
  </tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

// ── Plaintext version (for clients that don't render HTML) ──────────────────
function buildReportText(opts: {
  url: string;
  scannedAt: Date;
  score: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: ScanFinding[];
  summary: string;
  scanId: string;
}): string {
  const lines: string[] = [];
  lines.push("GuardianX Security Scan Report");
  lines.push("=".repeat(40));
  lines.push(`URL: ${opts.url}`);
  lines.push(`Scanned: ${opts.scannedAt.toISOString()}`);
  lines.push(`Score: ${opts.score ?? "N/A"}/100`);
  lines.push("");
  lines.push(`Findings: ${opts.findingsCount} total ` +
    `(critical: ${opts.criticalCount}, high: ${opts.highCount}, ` +
    `medium: ${opts.mediumCount}, low: ${opts.lowCount})`);
  lines.push("");
  lines.push("Executive Summary:");
  lines.push(opts.summary);
  lines.push("");
  if (opts.findings.length > 0) {
    lines.push("Findings:");
    opts.findings.forEach((f, i) => {
      lines.push(`  ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     Endpoint: ${f.method} ${f.endpoint}`);
      lines.push(`     Description: ${f.description}`);
      lines.push(`     Remediation: ${f.remediation}`);
      lines.push("");
    });
  } else {
    lines.push("No findings were detected during this scan.");
  }
  lines.push("");
  lines.push(`View full report online: https://guardianx-two.vercel.app/scan/${opts.scanId}`);
  lines.push("");
  lines.push("Generated by GuardianX · hello@guardianx.in");
  return lines.join("\n");
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { scanId?: unknown; email?: unknown };
  try {
    body = (await req.json()) as { scanId?: unknown; email?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!scanId) {
    return NextResponse.json({ error: "scanId is required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  // ── Fetch the scan row ────────────────────────────────────────────────────
  const scan = await db.websiteScan.findUnique({ where: { id: scanId } });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  // ── Idempotent: already sent ───────────────────────────────────────────────
  if (scan.reportSent) {
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      message: "Report already sent to your email.",
    });
  }

  // ── Parse findings JSON (defensive — schema defaults to "[]") ─────────────
  let findings: ScanFinding[] = [];
  try {
    const parsed = JSON.parse(scan.findings || "[]") as unknown;
    if (Array.isArray(parsed)) {
      findings = parsed as ScanFinding[];
    }
  } catch {
    findings = [];
  }

  // ── Build HTML + plaintext reports ────────────────────────────────────────
  // The WebsiteScan schema (intentionally) has no `summary` column — the
  // LLM summary is returned to the scan caller at /scan time but not
  // persisted. The email therefore uses a templated summary derived from
  // the persisted findings. If a `summary` column is added to the model
  // in the future, the duck-typed check below will pick it up automatically
  // (no code change required here).
  const persistedSummary = (scan as unknown as { summary?: string | null }).summary;
  const summary = persistedSummary || templatedSummary(findings);

  const reportOpts = {
    url: scan.url,
    scannedAt: scan.completedAt ?? scan.createdAt,
    score: scan.score,
    findingsCount: scan.findingsCount,
    criticalCount: scan.criticalCount,
    highCount: scan.highCount,
    mediumCount: scan.mediumCount,
    lowCount: scan.lowCount,
    findings,
    summary,
    scanId: scan.id,
  };

  const html = buildReportHtml(reportOpts);
  const text = buildReportText(reportOpts);

  // ── Send email ──────────────────────────────────────────────────────────
  const subject = `GuardianX Security Report — ${scan.url}`;
  const result = await sendEmail({ to: email, subject, text, html });

  if (result.ok && !result.skipped) {
    // Email actually sent — mark + write static HTML for future download.
    try {
      await db.websiteScan.update({
        where: { id: scan.id },
        data: { reportSent: true, reportPath: `/tmp/scan-report-${scan.id}.html` },
      });
    } catch (err) {
      console.error("[public-scan/send-report] failed to update reportSent:", err);
    }

    try {
      writeFileSync(join(tmpdir(), `scan-report-${scan.id}.html`), html, {
        encoding: "utf8",
      });
    } catch (err) {
      console.warn("[public-scan/send-report] could not write /tmp report file:", err);
    }

    return NextResponse.json({
      ok: true,
      message: `Report sent to ${email}.`,
    });
  }

  // SMTP not configured (skipped) OR failed — fail soft. The visitor already
  // has the findings on screen, so a 200 with a soft message is more useful
  // than a 500.
  if (result.skipped) {
    return NextResponse.json({
      ok: false,
      message:
        "Email delivery is unavailable right now. Your scan is saved — try downloading the report instead.",
    });
  }

  // Hard failure — but still 200 to avoid crashing the UX.
  console.error("[public-scan/send-report] sendEmail failed:", result.error);
  return NextResponse.json({
    ok: false,
    message:
      "Email delivery failed. Your scan is saved — try again in a few minutes or download the report.",
    error: result.error, // included for debugging — safe to expose SMTP error to the visitor
    skipped: result.skipped,
  });
}

// ── Templated summary (matches scan/route.ts behaviour) ────────────────────
// Inlined here to avoid creating a shared helper file outside the allowed
// scope. Keep in sync with src/app/api/public-scan/scan/route.ts.
function templatedSummary(findings: ScanFinding[]): string {
  if (findings.length === 0) {
    return "GuardianX found no obvious security issues during this external scan. We recommend re-scanning periodically and after any infrastructure change.";
  }
  const topOrder: Severity[] = ["critical", "high", "medium", "low", "info"];
  const top = findings
    .slice()
    .sort((a, b) => topOrder.indexOf(a.severity) - topOrder.indexOf(b.severity))
    .slice(0, 1)[0];
  const categories = new Set(findings.map((f) => f.category)).size;
  return (
    `GuardianX identified ${findings.length} security issue${findings.length === 1 ? "" : "s"} ` +
    `across ${categories} categor${categories === 1 ? "y" : "ies"}. ` +
    `The most severe is "${top.title}" (${top.severity.toUpperCase()}) at ${top.endpoint}. ` +
    `We recommend prioritising remediation by severity and re-scanning after fixes are deployed.`
  );
}
