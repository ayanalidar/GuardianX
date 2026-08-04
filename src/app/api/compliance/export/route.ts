import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  DPDPA_FRAMEWORK,
  ISO27001_FRAMEWORK,
  SOC2_FRAMEWORK,
  collectFrameworkEvidence,
  computeGaps,
  getManualActivityCounts,
  getRemediationCounts,
  scoreFramework,
  type FrameworkId,
  type FrameworkDef,
  type GapItem,
  type SectionStatus,
} from "@/lib/compliance";

export const dynamic = "force-dynamic";

const FRAMEWORK_MAP: Record<FrameworkId, FrameworkDef> = {
  DPDPA: DPDPA_FRAMEWORK,
  ISO27001: ISO27001_FRAMEWORK,
  SOC2: SOC2_FRAMEWORK,
};

function isValidFramework(id: string | null): id is FrameworkId {
  return id === "DPDPA" || id === "ISO27001" || id === "SOC2";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusColor(status: string): string {
  switch (status) {
    case "pass":
      return "#10b981";
    case "fail":
      return "#ef4444";
    case "manual":
      return "#f59e0b";
    default:
      return "#71717a";
  }
}

function impactColor(impact: string): string {
  switch (impact) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    case "low":
      return "#10b981";
    default:
      return "#71717a";
  }
}

function renderSectionsHtml(sections: SectionStatus[]): string {
  return sections
    .map(
      (s) => `
    <section class="card">
      <header class="card-header">
        <div>
          <span class="section-ref">${escapeHtml(s.section)}</span>
          <h3>${escapeHtml(s.title)}</h3>
          <p class="muted">${escapeHtml(s.description)}</p>
        </div>
        <div class="section-score" style="border-color: ${statusColor(s.status)}; color: ${statusColor(s.status)};">
          <div class="score-num">${s.score}</div>
          <div class="score-label">${s.status.toUpperCase()}</div>
        </div>
      </header>
      <div class="controls">
        ${s.controls
          .map(
            (c) => `
          <div class="control">
            <div class="control-head">
              <span class="badge" style="background: ${statusColor(c.status)}20; color: ${statusColor(c.status)}; border-color: ${statusColor(c.status)}50;">
                ${c.status.toUpperCase()}
              </span>
              <strong>${escapeHtml(c.title)}</strong>
              <span class="muted">${escapeHtml(c.ref)}</span>
              <span class="muted">Score: ${c.score}/100</span>
            </div>
            <div class="evidence-list">
              ${c.evidence
                .map(
                  (e) => `
                <div class="evidence">
                  <span class="dot" style="background: ${statusColor(e.status)};"></span>
                  <div>
                    <div><strong>${escapeHtml(e.description)}</strong></div>
                    <div class="muted small">${escapeHtml(e.evidence)}</div>
                    <div class="muted small">checked: ${escapeHtml(e.collectedAt)} · type: ${escapeHtml(e.checkType)}</div>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
            ${
              c.requiredEvidence.length > 0
                ? `<div class="manual-evidence"><strong>Manual evidence required:</strong><ul>${c.requiredEvidence
                    .map((m) => `<li>${escapeHtml(m)}</li>`)
                    .join("")}</ul></div>`
                : ""
            }
            ${
              c.recommendations.length > 0
                ? `<div class="recs"><strong>Recommendations:</strong><ul>${c.recommendations
                    .map((r) => `<li>${escapeHtml(r)}</li>`)
                    .join("")}</ul></div>`
                : ""
            }
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `
    )
    .join("");
}

function renderGapsHtml(gaps: GapItem[]): string {
  if (gaps.length === 0) {
    return `<div class="card"><p class="ok">No gaps detected. All automated checks pass.</p></div>`;
  }
  return `
    <section class="card">
      <header class="card-header"><div><h3>Gap Analysis</h3><p class="muted">${gaps.length} gap(s) identified, sorted by impact (high first) then effort (low first = quick wins).</p></div></header>
      <table class="gap-table">
        <thead><tr><th>Section</th><th>Control</th><th>Gap</th><th>Impact</th><th>Effort</th><th>Recommendation</th></tr></thead>
        <tbody>
          ${gaps
            .map(
              (g) => `
            <tr>
              <td><strong>${escapeHtml(g.section)}</strong><br/><span class="muted small">${escapeHtml(g.sectionTitle)}</span></td>
              <td>${escapeHtml(g.controlTitle)}</td>
              <td>${escapeHtml(g.gap)}</td>
              <td><span class="badge" style="background: ${impactColor(g.impact)}20; color: ${impactColor(g.impact)}; border-color: ${impactColor(g.impact)}50;">${g.impact.toUpperCase()}</span></td>
              <td>${g.effort.toUpperCase()}</td>
              <td>${escapeHtml(g.recommendation)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderHtmlReport(opts: {
  frameworkName: string;
  frameworkFullName: string;
  frameworkDescription: string;
  score: number;
  level: string;
  breakdown: {
    automatedPassRate: number;
    manualScore: number;
    remediationScore: number;
    gaps: string[];
    recommendations: string[];
  };
  sections: SectionStatus[];
  gaps: GapItem[];
  generatedAt: string;
  auditEvidence?: unknown;
}): string {
  const {
    frameworkName,
    frameworkFullName,
    frameworkDescription,
    score,
    level,
    breakdown,
    sections,
    gaps,
    generatedAt,
    auditEvidence,
  } = opts;
  const levelColor = level === "compliant" ? "#10b981" : level === "at-risk" ? "#f59e0b" : "#ef4444";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>GuardianX Compliance Report — ${escapeHtml(frameworkName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 32px; background: #fafafa; color: #18181b; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 800; color: #10b981; letter-spacing: -0.5px; }
  .brand small { display: block; font-size: 11px; font-weight: 500; color: #71717a; letter-spacing: 0.5px; text-transform: uppercase; }
  .meta { text-align: right; font-size: 12px; color: #71717a; }
  .summary { display: grid; grid-template-columns: 200px 1fr; gap: 24px; margin-bottom: 32px; }
  .gauge { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; text-align: center; }
  .gauge .num { font-size: 48px; font-weight: 800; color: ${levelColor}; line-height: 1; }
  .gauge .label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .gauge .level { font-size: 14px; font-weight: 700; color: ${levelColor}; margin-top: 8px; text-transform: uppercase; }
  .breakdown { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; }
  .breakdown h3 { margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; color: #71717a; letter-spacing: 1px; }
  .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f4f4f5; font-size: 13px; }
  .breakdown-row:last-child { border-bottom: none; }
  .breakdown-row .pct { font-weight: 700; color: #18181b; }
  .formula { background: #f4f4f5; padding: 12px; border-radius: 6px; font-size: 12px; margin-top: 12px; color: #52525b; }
  .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f4f4f5; padding-bottom: 12px; margin-bottom: 16px; }
  .card-header h3 { margin: 0; font-size: 18px; }
  .section-ref { display: inline-block; background: #10b98115; color: #047857; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-right: 8px; }
  .section-score { border: 2px solid; border-radius: 8px; padding: 8px 16px; text-align: center; min-width: 80px; }
  .section-score .score-num { font-size: 24px; font-weight: 800; line-height: 1; }
  .section-score .score-label { font-size: 9px; letter-spacing: 1px; margin-top: 4px; }
  .controls { display: flex; flex-direction: column; gap: 16px; }
  .control { background: #fafafa; border: 1px solid #f4f4f5; border-radius: 8px; padding: 16px; }
  .control-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid; }
  .muted { color: #71717a; font-size: 12px; }
  .small { font-size: 11px; }
  .evidence-list { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
  .evidence { display: flex; gap: 8px; padding: 8px; background: #fff; border-radius: 6px; border: 1px solid #f4f4f5; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
  .manual-evidence, .recs { margin-top: 8px; padding: 8px; background: #fffbeb; border-radius: 6px; border: 1px solid #fde68a; font-size: 12px; }
  .recs { background: #f0fdf4; border-color: #bbf7d0; }
  .manual-evidence ul, .recs ul { margin: 4px 0 0 16px; padding: 0; }
  .gap-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .gap-table th, .gap-table td { padding: 8px; border: 1px solid #e4e4e7; text-align: left; vertical-align: top; }
  .gap-table th { background: #f4f4f5; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
  .ok { color: #10b981; font-weight: 700; padding: 16px; }
  .signoff { background: #fff; border: 2px dashed #e4e4e7; border-radius: 12px; padding: 24px; margin-top: 24px; }
  .signoff h3 { margin: 0 0 16px 0; }
  .signoff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .signoff-row { border-bottom: 1px solid #18181b; padding: 8px 0; min-height: 40px; }
  .signoff-label { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e4e4e7; font-size: 11px; color: #71717a; text-align: center; }
  pre { background: #18181b; color: #f4f4f5; padding: 12px; border-radius: 6px; font-size: 11px; overflow: auto; }
  @media print { body { padding: 16px; } .card, .gauge, .breakdown, .signoff { break-inside: avoid; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">GuardianX <small>Compliance Report</small></div>
      <h1 style="margin: 8px 0 4px 0; font-size: 28px;">${escapeHtml(frameworkName)}</h1>
      <div class="muted">${escapeHtml(frameworkFullName)}</div>
      <p class="muted" style="max-width: 600px; margin-top: 8px;">${escapeHtml(frameworkDescription)}</p>
    </div>
    <div class="meta">
      <div>Generated: ${escapeHtml(generatedAt)}</div>
      <div>Report version: 1.0</div>
      <div>Prepared by: GuardianX Compliance Engine</div>
    </div>
  </div>

  <div class="summary">
    <div class="gauge">
      <div class="num">${score}</div>
      <div class="label">Compliance Score</div>
      <div class="level">${level.toUpperCase()}</div>
    </div>
    <div class="breakdown">
      <h3>Score Breakdown</h3>
      <div class="breakdown-row"><span>Automated checks pass rate (60% weight)</span><span class="pct">${breakdown.automatedPassRate}%</span></div>
      <div class="breakdown-row"><span>Manual activity score (20% weight)</span><span class="pct">${breakdown.manualScore}%</span></div>
      <div class="breakdown-row"><span>Remediation score (20% weight)</span><span class="pct">${breakdown.remediationScore}%</span></div>
      <div class="breakdown-row"><span><strong>Final weighted score</strong></span><span class="pct"><strong>${score}/100</strong></span></div>
      <div class="formula">
        Formula: final = (automatedPass × 0.60) + (manualScore × 0.20) + (remediationScore × 0.20).<br/>
        Levels: ≥ 80 compliant, 50–79 at-risk, &lt; 50 non-compliant.
      </div>
    </div>
  </div>

  <h2 style="margin-top: 32px; font-size: 20px;">Section-by-Section Status</h2>
  ${renderSectionsHtml(sections)}

  <h2 style="margin-top: 32px; font-size: 20px;">Gap Analysis</h2>
  ${renderGapsHtml(gaps)}

  ${
    auditEvidence
      ? `<h2 style="margin-top: 32px; font-size: 20px;">Audit Evidence Pack</h2>
         <pre>${escapeHtml(JSON.stringify(auditEvidence, null, 2))}</pre>`
      : ""
  }

  <div class="signoff">
    <h3>Audit Sign-Off</h3>
    <div class="signoff-grid">
      <div>
        <div class="signoff-label">Reviewed by</div>
        <div class="signoff-row">&nbsp;</div>
      </div>
      <div>
        <div class="signoff-label">Role / Title</div>
        <div class="signoff-row">&nbsp;</div>
      </div>
      <div>
        <div class="signoff-label">Signature</div>
        <div class="signoff-row">&nbsp;</div>
      </div>
      <div>
        <div class="signoff-label">Date</div>
        <div class="signoff-row">&nbsp;</div>
      </div>
    </div>
    <p class="muted" style="margin-top: 16px;">This report was generated automatically by GuardianX from live system evidence. Manual evidence items must be supplied by the Data Fiduciary and signed off by the accountable officer before submission to the Data Protection Board.</p>
  </div>

  <div class="footer">
    GuardianX Compliance Engine · ${escapeHtml(generatedAt)} · ${escapeHtml(frameworkName)} · This report is suitable for sharing with auditors and regulators.
  </div>
</body>
</html>`;
}

// GET /api/compliance/export?framework=DPDPA&format=html|json
// Returns a complete audit-ready compliance report.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("framework");
  const format = (url.searchParams.get("format") || "html").toLowerCase();
  const frameworkId: FrameworkId = isValidFramework(requested) ? requested : "DPDPA";

  const frameworkDef = FRAMEWORK_MAP[frameworkId];
  const frameworkStatus = collectFrameworkEvidence(frameworkDef);
  const [manual, remediation] = await Promise.all([
    getManualActivityCounts(),
    getRemediationCounts(),
  ]);
  const scoreBreakdown = scoreFramework(frameworkStatus, manual, remediation);
  const gaps = computeGaps({ ...frameworkStatus, level: scoreBreakdown.level, score: scoreBreakdown.score });

  // Pull live audit evidence (scans, patches, findings, attestations, audit logs)
  let auditEvidence: {
    scans: number;
    patches: number;
    findings: number;
    attestations: number;
    audit_logs: number;
    sample?: unknown;
  } | null = null;
  try {
    const [scans, patches, findings, attestations, auditLogs] = await Promise.all([
      db.scan.count({}),
      db.patch.count({}),
      db.finding.count({}),
      db.attestation.count({}),
      db.auditLog.count({}),
    ]);
    auditEvidence = {
      scans,
      patches,
      findings,
      attestations,
      audit_logs: auditLogs,
    };
  } catch {
    // DB may not be initialised — continue without audit evidence.
  }

  const generatedAt = new Date().toISOString();

  if (format === "json") {
    return NextResponse.json({
      framework: {
        id: frameworkDef.id,
        name: frameworkDef.name,
        fullName: frameworkDef.fullName,
        description: frameworkDef.description,
      },
      generated_at: generatedAt,
      score: scoreBreakdown.score,
      level: scoreBreakdown.level,
      score_breakdown: {
        automated_pass_rate: scoreBreakdown.automatedPassRate,
        manual_score: scoreBreakdown.manualScore,
        remediation_score: scoreBreakdown.remediationScore,
        formula:
          "final = (automatedPassRate × 0.60) + (manualScore × 0.20) + (remediationScore × 0.20)",
        weights: { automated: 0.6, manual: 0.2, remediation: 0.2 },
        level_thresholds: { compliant: 80, "at-risk": 50, "non-compliant": 0 },
      },
      sections: frameworkStatus.sections,
      gaps,
      recommendations: scoreBreakdown.recommendations,
      audit_evidence: auditEvidence,
      signoff: {
        reviewed_by: null,
        role: null,
        signature: null,
        date: null,
        note:
          "Manual evidence items must be supplied by the Data Fiduciary and signed off by the accountable officer before submission to the Data Protection Board.",
      },
    });
  }

  // Default: HTML report
  const html = renderHtmlReport({
    frameworkName: frameworkDef.name,
    frameworkFullName: frameworkDef.fullName,
    frameworkDescription: frameworkDef.description,
    score: scoreBreakdown.score,
    level: scoreBreakdown.level,
    breakdown: scoreBreakdown,
    sections: frameworkStatus.sections,
    gaps,
    generatedAt,
    auditEvidence,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="guardianx-compliance-${frameworkId.toLowerCase()}-${Date.now()}.html"`,
    },
  });
}
