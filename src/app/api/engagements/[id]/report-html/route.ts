import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/engagements/[id]/report-html
//
// Returns a self-contained, print-ready HTML VAPT report. The HTML renders
// in any browser and includes a "Print / Save as PDF" button that triggers
// the browser's native print dialog (which can save to PDF on every OS).
//
// This is the always-available fallback for the PDF report route, which
// proxies to the Railway sentinel-engine (python3 + ReportLab) and may be
// unavailable in dev/preview environments.
//
// Path param `id` is flexible: it accepts either an engagement id or a
// target id (the closest engagement for that target is used automatically).
// This keeps the existing client-detail "Generate Report" button working
// even though it currently passes a target id.

// ── Compliance framework mappings ─────────────────────────────────────────
// Reused verbatim from /api/compliance/route.ts so reports stay consistent.

const DPDPA_SECTIONS: Record<string, { section: string; title: string; requirement: string }> = {
  "Sensitive Data Exposure": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "Data Fiduciary shall implement reasonable security safeguards to prevent personal data breach." },
  "PII Exposure": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "Personal data must be protected against unauthorized access, use, modification, or disclosure." },
  "SQL Injection": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "Adequate technical measures must prevent unauthorized access to personal data stored in databases." },
  "Path Traversal": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "File system access must be restricted to prevent unauthorized reading of personal data files." },
  "XSS": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "User input must be sanitized to prevent injection attacks that could compromise data principals' personal data." },
  "IDOR": { section: "\u00A7 4(2)", title: "Purpose Limitation & Access Control", requirement: "Personal data shall only be processed for the specified purpose. Access must be restricted to authorized principals." },
  "Open Redirect": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "Redirects must be validated to prevent phishing attacks that could lead to personal data compromise." },
  "Info Disclosure": { section: "\u00A7 8(6)", title: "Breach Notification", requirement: "On becoming aware of a personal data breach, the Data Fiduciary shall notify the Data Protection Board and affected Data Principals." },
  "Authentication Bypass": { section: "\u00A7 8(5)", title: "Security Safeguards", requirement: "Authentication mechanisms must be robust to prevent unauthorized access to personal data." },
};

const GDPR_ARTICLES: Record<string, { article: string; title: string }> = {
  "Sensitive Data Exposure": { article: "Art. 32", title: "Security of Processing" },
  "PII Exposure": { article: "Art. 5(1)(f)", title: "Integrity & Confidentiality" },
  "SQL Injection": { article: "Art. 32", title: "Security of Processing" },
  "Path Traversal": { article: "Art. 32", title: "Security of Processing" },
  "XSS": { article: "Art. 32", title: "Security of Processing" },
  "IDOR": { article: "Art. 25", title: "Data Protection by Design" },
  "Open Redirect": { article: "Art. 32", title: "Security of Processing" },
  "Info Disclosure": { article: "Art. 33", title: "Notification of Breach (72h)" },
  "Authentication Bypass": { article: "Art. 32", title: "Security of Processing" },
};

const HIPAA_RULES: Record<string, { rule: string; title: string }> = {
  "Sensitive Data Exposure": { rule: "\u00A7 164.312(a)(1)", title: "Access Control" },
  "PII Exposure": { rule: "\u00A7 164.312(a)(1)", title: "Access Control" },
  "SQL Injection": { rule: "\u00A7 164.312(b)", title: "Audit Controls" },
  "Path Traversal": { rule: "\u00A7 164.312(a)(1)", title: "Access Control" },
  "XSS": { rule: "\u00A7 164.312(e)(1)", title: "Transmission Security" },
  "IDOR": { rule: "\u00A7 164.312(a)(1)", title: "Access Control" },
  "Info Disclosure": { rule: "\u00A7 164.404", title: "Breach Notification" },
  "Authentication Bypass": { rule: "\u00A7 164.312(d)", title: "Person/Entity Authentication" },
};

interface ComplianceRow {
  issue_id: string;
  title: string;
  severity: string;
  category: string;
  source: string;
  target: string;
  dpdpa: { section: string; title: string; requirement: string } | null;
  gdpr: { article: string; title: string } | null;
  hipaa: { rule: string; title: string } | null;
  pci_dss: { rule: string; title: string };
  iso: { control: string; title: string };
  soc2: { control: string; title: string };
}

function mapToCompliance(category: string, title: string): {
  dpdpa: { section: string; title: string; requirement: string } | null;
  gdpr: { article: string; title: string } | null;
  hipaa: { rule: string; title: string } | null;
} {
  const key =
    Object.keys(DPDPA_SECTIONS).find(
      (k) => category.includes(k) || title.includes(k)
    ) || "Info Disclosure";
  return {
    dpdpa: DPDPA_SECTIONS[key] ?? null,
    gdpr: GDPR_ARTICLES[key] ?? null,
    hipaa: HIPAA_RULES[key] ?? null,
  };
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sevColor(sev: string): string {
  switch ((sev || "").toLowerCase()) {
    case "critical": return "#dc2626";
    case "high": return "#ea580c";
    case "medium": return "#ca8a04";
    case "low": return "#0284c7";
    case "info": return "#64748b";
    default: return "#64748b";
  }
}

function sevRank(sev: string): number {
  switch ((sev || "").toLowerCase()) {
    case "critical": return 0;
    case "high": return 1;
    case "medium": return 2;
    case "low": return 3;
    case "info": return 4;
    default: return 5;
  }
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Resolve engagement. Accept either engagement id or target id.
  // We use `any` here because Prisma's overloaded findUnique type with
  // `include` doesn't survive the conditional assignment below.
  let engagement: any = null;
  try {
    engagement = await db.engagement.findUnique({
      where: { id },
      include: { target: true, findings: true },
    });
    if (!engagement) {
      // Fallback: treat `id` as a target id and use its latest engagement.
      engagement = await db.engagement.findFirst({
        where: { targetId: id },
        include: { target: true, findings: true },
        orderBy: { startedAt: "desc" },
      });
    }
  } catch (err) {
    return new Response(
      `<html><body><h1>Report error</h1><pre>${esc(err instanceof Error ? err.message : String(err))}</pre></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!engagement || !engagement.target) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Engagement not found</title></head><body style="font-family: ui-sans-serif, system-ui; padding: 40px; color: #1e293b;">
         <h1 style="color: #dc2626;">Engagement not found</h1>
         <p>No engagement exists for id <code>${esc(id)}</code>.</p>
         <p>This id may be a target id with no engagements yet, or a stale link.</p>
       </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const target: any = engagement.target;
  const targetClientId: string | null = target?.clientId || null;

  // Resolve the client (target.clientId may be null in legacy data).
  let client: { name: string; description: string | null; targetUrl: string | null; frameworks: string | null } | null = null;
  if (targetClientId) {
    try {
      const found = await db.client.findUnique({
        where: { id: targetClientId },
        select: { name: true, description: true, targetUrl: true, frameworks: true },
      });
      if (found) {
        const fr = found as Record<string, unknown>;
        client = {
          name: (fr.name as string) || "Client",
          description: (fr.description as string | null) ?? null,
          targetUrl: (fr.targetUrl as string | null) ?? null,
          frameworks: (fr.frameworks as string | null) ?? null,
        };
      }
    } catch {
      client = null;
    }
  }

  // Gather SAST patches for the same client (across all its codebases).
  let patches: any[] = [];
  if (targetClientId) {
    try {
      const codebases = await db.codebase.findMany({
        where: { clientId: targetClientId },
        select: { id: true, name: true },
      });
      const cbIds = codebases.map((c) => (c as Record<string, unknown>).id as string);
      if (cbIds.length > 0) {
        patches = await db.patch.findMany({
          where: { codebaseId: { in: cbIds } },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch {
      patches = [];
    }
  }

  // Sort findings by severity then recency.
  const findings: any[] = [...(engagement.findings || [])].sort((a, b) => {
    const r = sevRank(a.severity) - sevRank(b.severity);
    if (r !== 0) return r;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Build compliance mapping.
  const complianceRows: ComplianceRow[] = [
    ...findings.map((f) => {
      const c = f.category || "";
      const t = f.title || "";
      const mapped = mapToCompliance(c, t);
      return {
        issue_id: f.id,
        title: t,
        severity: f.severity,
        category: c,
        source: "VAPT",
        target: f.endpoint || engagement.target?.name || "n/a",
        dpdpa: mapped.dpdpa,
        gdpr: mapped.gdpr,
        hipaa: mapped.hipaa,
        pci_dss: { rule: "Req 6.5", title: "Vulnerability scanning & remediation" },
        iso: { control: "A.8.8", title: "Technical vulnerability management" },
        soc2: { control: "CC7.1", title: "Vulnerability detection & remediation" },
      };
    }),
    ...patches.map((p) => {
      const c = p.cve ? "SQL Injection" : "Code Vulnerability";
      const t = p.title || "";
      const mapped = mapToCompliance(c, t);
      return {
        issue_id: p.patchId,
        title: t,
        severity: p.severity,
        category: c,
        source: "SAST",
        target: p.affectedFile || "n/a",
        dpdpa: mapped.dpdpa,
        gdpr: mapped.gdpr,
        hipaa: mapped.hipaa,
        pci_dss: { rule: "Req 6.5", title: "Vulnerability scanning & remediation" },
        iso: { control: "A.8.8", title: "Technical vulnerability management" },
        soc2: { control: "CC7.1", title: "Vulnerability detection & remediation" },
      };
    }),
  ];

  // Stats for executive summary.
  const stats = {
    totalFindings: findings.length,
    criticalFindings: findings.filter((f) => f.severity === "critical").length,
    highFindings: findings.filter((f) => f.severity === "high").length,
    mediumFindings: findings.filter((f) => f.severity === "medium").length,
    lowFindings: findings.filter((f) => f.severity === "low").length,
    totalPatches: patches.length,
    pendingPatches: patches.filter((p) => p.status === "pending").length,
    approvedPatches: patches.filter((p) => p.status === "approved").length,
    rejectedPatches: patches.filter((p) => p.status === "rejected").length,
  };

  // Risk score (mirrors /api/client-portal calculation).
  let riskScore = 0;
  riskScore += stats.criticalFindings * 15;
  riskScore += (stats.totalFindings - stats.criticalFindings) * 5;
  riskScore += stats.pendingPatches * 2;
  riskScore = Math.min(100, riskScore);
  const postureScore = Math.max(0, 100 - riskScore);
  const riskLevel =
    riskScore >= 70 ? "CRITICAL" :
    riskScore >= 40 ? "ELEVATED" :
    riskScore >= 20 ? "MODERATE" : "LOW";

  const clientName = client?.name || engagement.target.name || "the Client";
  const clientFrameworks = client?.frameworks
    ? client.frameworks.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const reportId = `GXRPT-${engagement.id.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date();
  const generatedAtStr = fmtDate(generatedAt);
  const generatedAtIso = generatedAt.toISOString();

  const html = renderReport({
    reportId,
    clientName,
    clientDescription: client?.description || null,
    clientUrl: client?.targetUrl || engagement.target.baseUrl || null,
    frameworks: clientFrameworks,
    engagement,
    target: engagement.target,
    findings,
    patches,
    complianceRows,
    stats,
    riskScore,
    postureScore,
    riskLevel,
    generatedAtStr,
    generatedAtIso,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ── HTML renderer ─────────────────────────────────────────────────────────

interface RenderInput {
  reportId: string;
  clientName: string;
  clientDescription: string | null;
  clientUrl: string | null;
  frameworks: string[];
  engagement: {
    id: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    crawlSummary: string | null;
  };
  target: { id: string; name: string; baseUrl: string; authorized: boolean };
  findings: {
    id: string;
    title: string;
    severity: string;
    category: string;
    owasp: string | null;
    endpoint: string;
    method: string;
    description: string;
    remediation: string | null;
    confidence: number;
  }[];
  patches: {
    id: string;
    patchId: string;
    title: string;
    severity: string;
    status: string;
    affectedFile: string;
    confidence: number;
    sandboxPassed: boolean;
    createdAt: Date;
  }[];
  complianceRows: ComplianceRow[];
  stats: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    totalPatches: number;
    pendingPatches: number;
    approvedPatches: number;
    rejectedPatches: number;
  };
  riskScore: number;
  postureScore: number;
  riskLevel: string;
  generatedAtStr: string;
  generatedAtIso: string;
}

function renderReport(d: RenderInput): string {
  const findingsRows = d.findings.length
    ? d.findings
        .map(
          (f, i) => `<tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px;">${i + 1}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #fff; background: ${sevColor(f.severity)}; text-transform: uppercase;">${esc(f.severity)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${esc(f.title)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">${esc(f.category)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${esc(f.owasp || "-")}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569;">${esc(f.method)} ${esc(f.endpoint)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">${esc(f.description).slice(0, 180)}${f.description.length > 180 ? "..." : ""}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #047857;">${esc(f.remediation || "See OWASP guidance").slice(0, 180)}${(f.remediation || "").length > 180 ? "..." : ""}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No findings recorded for this engagement.</td></tr>`;

  const patchRows = d.patches.length
    ? d.patches
        .map(
          (p) => `<tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569;">${esc(p.patchId)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${esc(p.title)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #fff; background: ${sevColor(p.severity)}; text-transform: uppercase;">${esc(p.severity)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; ${p.status === "approved" ? "color: #047857; background: #d1fae5;" : p.status === "rejected" ? "color: #dc2626; background: #fee2e2;" : "color: #b45309; background: #fef3c7;"}">${esc(p.status)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569;">${esc(p.affectedFile)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No SAST patches recorded for this client.</td></tr>`;

  const complianceRowsHtml = d.complianceRows.length
    ? d.complianceRows
        .map(
          (r) => `<tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #0f172a;">${esc(r.title)}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; color: #fff; background: ${sevColor(r.severity)}; text-transform: uppercase;">${esc(r.severity)}</span>
            </td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${r.dpdpa ? `${esc(r.dpdpa.section)} - ${esc(r.dpdpa.title)}` : "<span style='color:#cbd5e1;'>n/a</span>"}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${r.gdpr ? `${esc(r.gdpr.article)} - ${esc(r.gdpr.title)}` : "<span style='color:#cbd5e1;'>n/a</span>"}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${r.hipaa ? `${esc(r.hipaa.rule)} - ${esc(r.hipaa.title)}` : "<span style='color:#cbd5e1;'>n/a</span>"}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${esc(r.pci_dss.rule)}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${esc(r.iso.control)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No compliance-relevant issues mapped.</td></tr>`;

  const postureColor =
    d.postureScore >= 90 ? "#10b981" :
    d.postureScore >= 75 ? "#84cc16" :
    d.postureScore >= 60 ? "#f59e0b" :
    d.postureScore >= 40 ? "#f97316" : "#ef4444";

  const execSummary = buildExecSummary(d);

  const cleanupCert = buildCleanupCertificate(d);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GuardianX VAPT Report - ${esc(d.clientName)} - ${esc(d.reportId)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      font-size: 14px;
      line-height: 1.5;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 10;
      background: #0f172a;
      padding: 10px 24px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .toolbar-brand {
      color: #fff; font-weight: 700; font-size: 13px;
      display: flex; align-items: center; gap: 8px;
    }
    .toolbar-brand .dot {
      width: 8px; height: 8px; border-radius: 50%; background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .toolbar-actions { display: flex; gap: 8px; }
    .btn {
      padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; border: 1px solid transparent; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-primary { background: #10b981; color: #fff; }
    .btn-primary:hover { background: #059669; }
    .btn-ghost { background: transparent; color: #cbd5e1; border-color: #334155; }
    .btn-ghost:hover { background: #1e293b; }
    .page {
      max-width: 920px; margin: 24px auto; padding: 0 16px;
    }
    .card {
      background: #fff; border-radius: 10px; overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      margin-bottom: 24px;
    }
    .card-header {
      padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      flex-wrap: wrap;
    }
    .card-title {
      font-size: 13px; font-weight: 700; color: #1e293b;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .card-body { padding: 24px; }
    .hero {
      background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
      color: #fff; padding: 32px 32px;
    }
    .hero-grid {
      display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center;
    }
    .hero h1 { margin: 0 0 8px; font-size: 28px; font-weight: 800; }
    .hero .subtitle { color: #a7f3d0; font-size: 13px; }
    .hero .meta { font-size: 12px; color: #d1fae5; margin-top: 12px; }
    .hero .meta strong { color: #fff; }
    .posture-gauge {
      width: 120px; height: 120px; position: relative;
    }
    .posture-gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .posture-gauge .pct {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #fff;
    }
    .posture-gauge .pct .num { font-size: 26px; font-weight: 800; }
    .posture-gauge .pct .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #a7f3d0; }
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .stat {
      padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;
    }
    .stat .num { font-size: 22px; font-weight: 700; }
    .stat .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 10px 12px; background: #f8fafc;
      font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
      border-bottom: 1px solid #e2e8f0;
    }
    .summary-text { font-size: 13px; color: #334155; line-height: 1.6; }
    .summary-text p { margin: 0 0 12px; }
    .risk-badge {
      display: inline-block; padding: 4px 12px; border-radius: 4px;
      font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .cert {
      padding: 32px; text-align: center;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .cert-seal {
      width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 50%;
      background: linear-gradient(135deg, #10b981, #047857);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 36px; font-weight: 900;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    .cert h2 { margin: 0 0 8px; font-size: 20px; color: #047857; }
    .cert p { color: #475569; font-size: 13px; max-width: 560px; margin: 0 auto 16px; }
    .cert .signature {
      margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1;
      font-size: 11px; color: #94a3b8;
    }
    .cert .signature .name { color: #1e293b; font-weight: 600; }
    .page-break { page-break-before: always; }
    .footer-note {
      text-align: center; color: #94a3b8; font-size: 11px; padding: 24px;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { margin: 0; padding: 0; max-width: none; }
      .card { box-shadow: none; border: 1px solid #e2e8f0; page-break-inside: avoid; }
      .card-body { padding: 16px; }
      a { color: #0f172a; text-decoration: none; }
    }
    @media (max-width: 640px) {
      .hero-grid { grid-template-columns: 1fr; }
      .posture-gauge { margin: 0 auto; }
    }
  </style>
</head>
<body>
  <!-- Toolbar (hidden when printing) -->
  <div class="toolbar">
    <div class="toolbar-brand">
      <span class="dot"></span>
      GuardianX VAPT Report
      <span style="color: #64748b; font-weight: 400;">|</span>
      <span style="color: #94a3b8;">${esc(d.reportId)}</span>
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-primary" onclick="window.print()">
        Print / Save as PDF
      </button>
      <a class="btn btn-ghost" href="/">Back to Dashboard</a>
    </div>
  </div>

  <div class="page">

    <!-- Hero / Cover -->
    <div class="card">
      <div class="hero">
        <div class="hero-grid">
          <div>
            <h1>VAPT Report</h1>
            <div class="subtitle">Prepared for <strong style="color: #fff;">${esc(d.clientName)}</strong></div>
            <div class="meta">
              <div>Target: <strong>${esc(d.target.name)}</strong> (${esc(d.target.baseUrl)})</div>
              <div>Engagement: <strong>${esc(d.engagement.id)}</strong></div>
              <div>Engagement status: <strong style="text-transform: capitalize;">${esc(d.engagement.status)}</strong></div>
              <div>Started: <strong>${esc(fmtDate(d.engagement.startedAt))}</strong>${d.engagement.completedAt ? ` | Completed: <strong>${esc(fmtDate(d.engagement.completedAt))}</strong>` : ""}</div>
              ${d.clientUrl ? `<div>Client URL: <strong>${esc(d.clientUrl)}</strong></div>` : ""}
              ${d.frameworks.length ? `<div>Compliance frameworks: <strong>${d.frameworks.map(esc).join(", ")}</strong></div>` : ""}
            </div>
          </div>
          <div class="posture-gauge" aria-label="Posture score ${d.postureScore}">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="6" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="${postureColor}" stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray="${2 * Math.PI * 42}"
                stroke-dashoffset="${2 * Math.PI * 42 - (d.postureScore / 100) * 2 * Math.PI * 42}" />
            </svg>
            <div class="pct">
              <span class="num" style="color: ${postureColor};">${d.postureScore}</span>
              <span class="lbl">Posture</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Executive Summary</span>
        <span class="risk-badge" style="background: ${sevColor(d.riskLevel.toLowerCase() === "critical" ? "critical" : d.riskLevel.toLowerCase() === "elevated" ? "high" : d.riskLevel.toLowerCase() === "moderate" ? "medium" : "low")};">Risk: ${esc(d.riskLevel)}</span>
      </div>
      <div class="card-body">
        <div class="summary-text">${execSummary}</div>
        <div class="stats-grid" style="margin-top: 20px;">
          <div class="stat"><div class="num" style="color: #dc2626;">${d.stats.criticalFindings}</div><div class="lbl">Critical findings</div></div>
          <div class="stat"><div class="num" style="color: #ea580c;">${d.stats.highFindings}</div><div class="lbl">High findings</div></div>
          <div class="stat"><div class="num" style="color: #ca8a04;">${d.stats.mediumFindings}</div><div class="lbl">Medium findings</div></div>
          <div class="stat"><div class="num" style="color: #0284c7;">${d.stats.lowFindings}</div><div class="lbl">Low findings</div></div>
          <div class="stat"><div class="num" style="color: #10b981;">${d.stats.approvedPatches}</div><div class="lbl">Approved patches</div></div>
          <div class="stat"><div class="num" style="color: #b45309;">${d.stats.pendingPatches}</div><div class="lbl">Pending patches</div></div>
        </div>
      </div>
    </div>

    <!-- Findings Table -->
    <div class="card page-break">
      <div class="card-header">
        <span class="card-title">Vulnerability Findings (${d.findings.length})</span>
        <span style="font-size: 11px; color: #94a3b8;">Source: DAST VAPT</span>
      </div>
      <div class="card-body" style="padding: 0; overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Severity</th>
              <th>Title</th>
              <th>Category</th>
              <th>OWASP</th>
              <th>Endpoint</th>
              <th>Description</th>
              <th>Remediation</th>
            </tr>
          </thead>
          <tbody>${findingsRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Patches Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">AI-Generated Patches (${d.patches.length})</span>
        <span style="font-size: 11px; color: #94a3b8;">Source: SAST</span>
      </div>
      <div class="card-body" style="padding: 0; overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Patch ID</th>
              <th>Title</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Affected File</th>
            </tr>
          </thead>
          <tbody>${patchRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Compliance Mapping -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Compliance Mapping</span>
        <span style="font-size: 11px; color: #94a3b8;">DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2</span>
      </div>
      <div class="card-body" style="padding: 0; overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Severity</th>
              <th>DPDPA 2023</th>
              <th>GDPR</th>
              <th>HIPAA</th>
              <th>PCI-DSS</th>
              <th>ISO 27001</th>
            </tr>
          </thead>
          <tbody>${complianceRowsHtml}</tbody>
        </table>
      </div>
    </div>

    <!-- Cleanup Certificate -->
    <div class="card">
      <div class="cert">
        <div class="cert-seal">G</div>
        <h2>Engagement Completion Certificate</h2>
        ${cleanupCert}
        <div class="signature">
          Issued by <span class="name">GuardianX Autonomous Security Operations</span><br>
          Report ID: <strong>${esc(d.reportId)}</strong> | Generated: ${esc(d.generatedAtStr)} (IST)<br>
          ISO 27001:2022 aligned | OWASP Top 10 (2021) methodology
        </div>
      </div>
    </div>

    <div class="footer-note">
      This report was generated automatically by GuardianX. Findings and patches reflect the engagement state at the time of generation.
      <br>Report hash (ISO timestamp): <code>${esc(d.generatedAtIso)}</code>
    </div>

  </div>
  <script>
    // Trigger print dialog automatically after a short delay so users can save
    // the report to PDF without clicking. They can cancel and read on-screen.
    // Comment out the next line if auto-print is undesired.
    // window.addEventListener('load', function(){ setTimeout(function(){ try { window.print(); } catch(e){} }, 500); });
  </script>
</body>
</html>`;
}

function buildExecSummary(d: RenderInput): string {
  const parts: string[] = [];
  parts.push(
    `<p>This report summarizes the Vulnerability Assessment and Penetration Testing (VAPT) engagement conducted by <strong>GuardianX</strong> for <strong>${esc(d.clientName)}</strong> against the target <strong>${esc(d.target.name)}</strong> (${esc(d.target.baseUrl)}).</p>`
  );
  if (d.clientDescription) {
    parts.push(`<p><strong>Client profile:</strong> ${esc(d.clientDescription)}</p>`);
  }
  parts.push(
    `<p>The engagement identified <strong>${d.stats.totalFindings}</strong> runtime finding(s) via DAST and tracked <strong>${d.stats.totalPatches}</strong> SAST-generated patch(es). Of these, <strong>${d.stats.criticalFindings}</strong> critical and <strong>${d.stats.highFindings}</strong> high severity issues require immediate remediation. <strong>${d.stats.approvedPatches}</strong> patch(es) have been approved and ${d.stats.pendingPatches} remain pending review.</p>`
  );
  parts.push(
    `<p>Overall security posture is rated <strong style="color: ${sevColor(d.riskLevel.toLowerCase() === "critical" ? "critical" : d.riskLevel.toLowerCase() === "elevated" ? "high" : d.riskLevel.toLowerCase() === "moderate" ? "medium" : "low")};">${esc(d.riskLevel)}</strong> with a PostureScore of <strong>${d.postureScore}/100</strong>. GuardianX recommends prioritizing critical findings for remediation within 7 days and conducting a follow-up assessment after fixes are deployed.</p>`
  );
  return parts.join("");
}

function buildCleanupCertificate(d: RenderInput): string {
  const allResolved = d.stats.criticalFindings === 0 && d.stats.highFindings === 0 && d.stats.pendingPatches === 0;
  if (allResolved) {
    return `<p>This certifies that the VAPT engagement for <strong>${esc(d.clientName)}</strong> has been completed with all identified critical and high severity findings remediated and all generated patches reviewed. The target <strong>${esc(d.target.name)}</strong> has been assessed against the OWASP Top 10 (2021) methodology and no outstanding critical issues remain at the time of issuance.</p>`;
  }
  return `<p>This acknowledges that the VAPT engagement for <strong>${esc(d.clientName)}</strong> has reached its current reporting milestone. <strong>${d.stats.criticalFindings}</strong> critical and <strong>${d.stats.highFindings}</strong> high severity issues remain open and require remediation. GuardianX will re-assess the target after the recommended fixes are deployed and issue an updated certificate upon successful closure of all critical findings.</p>`;
}
