// GuardianX Import Connectors - 8 vulnerability scanner parsers.
//
// Each connector takes a raw scanner output (XML/JSON/string) and produces
// a normalized list of Finding records that we can persist via the
// existing db.finding.create API. The importFindings() entry point is
// the public contract used by POST /api/imports.
//
// Parsers are deliberately defensive: they never throw on malformed
// input, they return { imported: 0, errors: [...] } instead. This keeps
// the UI usable even when a customer uploads a malformed report.

import { db } from "@/lib/db";
import type { ConnectorSchema } from "./engine";

export interface ImportedFinding {
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: string;
  owasp?: string;
  endpoint: string;
  method?: string;
  description: string;
  proofRequest?: string;
  proofResponse?: string;
  payload?: string;
  confidence?: number;
  remediation?: string;
}

export interface ImportResult {
  tool: string;
  engagementId?: string;
  imported: number;
  skipped: number;
  errors: string[];
  findings: ImportedFinding[];
}

export interface ImportConnector extends ConnectorSchema {
  direction: "import";
  parse: (rawData: unknown, config?: Record<string, unknown>) => ImportedFinding[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function sev(v: unknown): ImportedFinding["severity"] {
  const s = String(v || "").toLowerCase();
  if (["critical", "very high", "4"].includes(s)) return "critical";
  if (["high", "3"].includes(s)) return "high";
  if (["medium", "moderate", "2", "warning"].includes(s)) return "medium";
  if (["low", "1", "info", "informational", "information"].includes(s)) return "low" as ImportedFinding["severity"];
  if (s === "low" || s === "informational" || s === "info") return "low";
  return "medium";
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

// ── Parsers ────────────────────────────────────────────────────────────────

// 1. Burp Suite (XML)
function parseBurp(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const issues = asArr(data?.issues?.issue || data?.issue);
  for (const issue of issues) {
    const i: any = issue;
    out.push({
      title: str(i.name) || "Burp finding",
      severity: sev(i.severity),
      category: str(i.type) || "web",
      owasp: str(i.owasp) || undefined,
      endpoint: str(i.host?.[0]?.ip || i.host || i.url) || str(i.path) || "unknown",
      method: str(i.method) || undefined,
      description: str(i.issueDetail) || str(i.name),
      proofRequest: str(i.request?.[0]) || undefined,
      proofResponse: str(i.response?.[0]) || undefined,
      remediation: str(i.remediation) || undefined,
      confidence: 0.85,
    });
  }
  return out;
}

// 2. OWASP ZAP (JSON)
function parseZap(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const arr = asArr(data?.site?.[0]?.alerts?.alert || data?.alerts);
  for (const a of arr) {
    const al: any = a;
    out.push({
      title: str(al.alert) || "ZAP alert",
      severity: sev(al.riskdesc || al.riskcode),
      category: str(al.pluginid) || "web",
      owasp: str(al.wascid) || undefined,
      endpoint: str(al.instance?.[0]?.uri || al.uri) || "unknown",
      method: str(al.instance?.[0]?.method || al.method) || undefined,
      description: str(al.desc),
      proofRequest: str(al.instance?.[0]?.requestHeader) || undefined,
      proofResponse: str(al.instance?.[0]?.responseHeader) || undefined,
      remediation: str(al.solution) || undefined,
      confidence: 0.8,
    });
  }
  return out;
}

// 3. Nessus (XML .nessus v2)
function parseNessus(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const hosts = asArr(data?.Report?.ReportHost);
  for (const h of hosts) {
    const host: any = h;
    const hostName = str(host.name);
    const items = asArr(host.ReportItem);
    for (const it of items) {
      const item: any = it;
      out.push({
        title: str(item.plugin_name) || `Nessus plugin ${str(item.pluginID)}`,
        severity: sev(item.severity === "0" ? "info" : item.severity === "1" ? "low" : item.severity === "2" ? "medium" : item.severity === "3" ? "high" : item.severity === "4" ? "critical" : item.severity),
        category: str(item.plugin_type) || "host",
        endpoint: hostName || str(host.HOST_PROPERTY?.[0]?.hostip) || "unknown",
        description: str(item.description) || str(item.synopsis) || str(item.plugin_name),
        remediation: str(item.solution) || undefined,
        proofResponse: str(item.plugin_output) || undefined,
        confidence: 0.7,
      });
    }
  }
  return out;
}

// 4. Nuclei (JSONL / array)
function parseNuclei(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    arr = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } else {
    arr = asArr(raw);
  }
  for (const n of arr) {
    const r: any = n;
    if (!r || typeof r !== "object") continue;
    out.push({
      title: str(r["template-id"] || r.info?.name) || "Nuclei finding",
      severity: sev(r.info?.severity),
      category: str(r.type) || "nuclei",
      endpoint: str(r["matched-at"] || r.url) || "unknown",
      method: str(r.request?.method) || "GET",
      description: str(r.info?.description) || str(r["template-id"]),
      proofRequest: str(r.request?.raw) || undefined,
      proofResponse: str(r.response) || undefined,
      payload: str(r.extracted_results?.[0]) || undefined,
      remediation: str(r.info?.remediation) || undefined,
      confidence: 0.85,
    });
  }
  return out;
}

// 5. Qualys (XML)
function parseQualys(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const hosts = asArr(data?.HOST_LIST?.HOST);
  for (const h of hosts) {
    const host: any = h;
    const ip = str(host.IP);
    const vulns = asArr(host.VULN_INFO_LIST?.VULN_INFO);
    for (const v of vulns) {
      const vuln: any = v;
      out.push({
        title: str(vuln.TITLE) || `Qualys QID ${str(vuln.QID)}`,
        severity: sev(vuln.SEVERITY),
        category: str(vuln.CATEGORY) || "host",
        endpoint: ip || "unknown",
        description: str(vuln.THIRDPARTY_CONSEQUENCE) || str(vuln.TITLE),
        remediation: str(vuln.SOLUTION) || undefined,
        proofResponse: str(vuln.RESULT) || undefined,
        confidence: 0.75,
      });
    }
  }
  return out;
}

// 6. SonarQube (issues API JSON)
function parseSonarQube(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const arr = asArr(data?.issues);
  for (const i of arr) {
    const issue: any = i;
    const sevMap: Record<string, ImportedFinding["severity"]> = {
      BLOCKER: "critical", CRITICAL: "critical", MAJOR: "high", MINOR: "low", INFO: "info",
    };
    out.push({
      title: str(issue.message) || str(issue.rule) || "SonarQube issue",
      severity: sevMap[str(issue.severity).toUpperCase()] || "medium",
      category: str(issue.type) || "code-quality",
      owasp: str(issue.rule) || undefined,
      endpoint: str(issue.component) || "unknown",
      method: "SAST",
      description: str(issue.message),
      remediation: str(issue.message),
      confidence: 0.7,
    });
  }
  return out;
}

// 7. Snyk (JSON)
function parseSnyk(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const arr = asArr(data?.vulnerabilities);
  for (const v of arr) {
    const vuln: any = v;
    out.push({
      title: str(vuln.title) || str(vuln.id) || "Snyk vuln",
      severity: sev(vuln.severity),
      category: "dependency",
      owasp: str(vuln.CVE) || undefined,
      endpoint: str(vuln.packageName) || str(vuln.name) || "unknown",
      method: "SCA",
      description: str(vuln.description) || str(vuln.title),
      payload: str(vuln.version) || undefined,
      remediation: str(vuln.fixedIn?.[0]) ? `Upgrade to ${str(vuln.fixedIn?.[0])}` : undefined,
      confidence: 0.9,
    });
  }
  return out;
}

// 8. Dependabot (JSON)
function parseDependabot(raw: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];
  const data = raw as any;
  const arr = asArr(data?.alerts || raw);
  for (const a of arr) {
    const alert: any = a;
    const adv = alert.security_advisory;
    const vuln = alert.security_vulnerability;
    const pkg = vuln?.package;
    out.push({
      title: str(adv?.summary) || str(adv?.ghsa_id) || "Dependabot alert",
      severity: sev(adv?.severity),
      category: "dependency",
      owasp: str(adv?.cve_id) || undefined,
      endpoint: str(pkg?.name) || "unknown",
      method: "SCA",
      description: str(adv?.description) || str(adv?.summary),
      payload: str(vuln?.vulnerable_version_range) || undefined,
      remediation: str(vuln?.first_patched_version?.identifier) ? `Upgrade to ${str(vuln?.first_patched_version?.identifier)}` : undefined,
      confidence: 0.9,
    });
  }
  return out;
}

// ── Registry ───────────────────────────────────────────────────────────────
export const importConnectors: ImportConnector[] = [
  {
    id: "burp",
    name: "Burp Suite",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse Burp Suite XML export.",
    icon: "Bug",
    configFields: [],
    parse: parseBurp,
  },
  {
    id: "zap",
    name: "OWASP ZAP",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse OWASP ZAP JSON report.",
    icon: "Bug",
    configFields: [],
    parse: parseZap,
  },
  {
    id: "nessus",
    name: "Nessus",
    category: "Cloud & Infrastructure",
    direction: "import",
    description: "Parse Nessus .nessus XML.",
    icon: "Server",
    configFields: [],
    parse: parseNessus,
  },
  {
    id: "nuclei",
    name: "Nuclei",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse Nuclei JSON/JSONL output.",
    icon: "Atom",
    configFields: [],
    parse: parseNuclei,
  },
  {
    id: "qualys",
    name: "Qualys",
    category: "Cloud & Infrastructure",
    direction: "import",
    description: "Parse Qualys host-list XML.",
    icon: "Server",
    configFields: [],
    parse: parseQualys,
  },
  {
    id: "sonarqube",
    name: "SonarQube",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse SonarQube issues API JSON.",
    icon: "Code",
    configFields: [],
    parse: parseSonarQube,
  },
  {
    id: "snyk",
    name: "Snyk",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse Snyk JSON report.",
    icon: "Package",
    configFields: [],
    parse: parseSnyk,
  },
  {
    id: "dependabot",
    name: "GitHub Dependabot",
    category: "DevOps & CI/CD",
    direction: "import",
    description: "Parse Dependabot alerts JSON.",
    icon: "Github",
    configFields: [],
    parse: parseDependabot,
  },
];

export function getImportConnector(id: string): ImportConnector | undefined {
  return importConnectors.find((c) => c.id === id);
}

// ── importFindings entry point ─────────────────────────────────────────────
/**
 * Parse a raw scanner report, then persist each normalized finding to
 * the Finding table (linked to the supplied engagementId if any). When
 * no engagementId is provided we still return the parsed findings so
 * the UI can preview them.
 *
 * Always resolves - never throws. Errors are collected per-finding so
 * a single bad row doesn't abort the whole import.
 */
export async function importFindings(
  tool: string,
  rawData: unknown,
  engagementId?: string,
  config?: Record<string, unknown>
): Promise<ImportResult> {
  const connector = getImportConnector(tool);
  if (!connector) {
    return {
      tool,
      engagementId,
      imported: 0,
      skipped: 0,
      errors: [`Unknown import tool: ${tool}. Supported: ${importConnectors.map((c) => c.id).join(", ")}`],
      findings: [],
    };
  }

  let parsed: ImportedFinding[] = [];
  try {
    parsed = connector.parse(rawData, config);
  } catch (err) {
    return {
      tool,
      engagementId,
      imported: 0,
      skipped: 0,
      errors: [`Parse failed: ${err instanceof Error ? err.message : String(err)}`],
      findings: [],
    };
  }

  if (!engagementId) {
    return {
      tool,
      engagementId,
      imported: 0,
      skipped: parsed.length,
      errors: ["No engagementId supplied; findings parsed but not persisted."],
      findings: parsed,
    };
  }

  // Verify engagement exists before bulk insert.
  try {
    const eng = await db.engagement.findUnique({ where: { id: engagementId } });
    if (!eng) {
      return {
        tool,
        engagementId,
        imported: 0,
        skipped: parsed.length,
        errors: [`Engagement ${engagementId} not found.`],
        findings: parsed,
      };
    }
  } catch (err) {
    return {
      tool,
      engagementId,
      imported: 0,
      skipped: parsed.length,
      errors: [`Could not verify engagement: ${err instanceof Error ? err.message : String(err)}`],
      findings: parsed,
    };
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const f of parsed) {
    try {
      await db.finding.create({
        data: {
          engagementId,
          title: f.title,
          severity: f.severity,
          category: f.category,
          owasp: f.owasp || null,
          endpoint: f.endpoint,
          method: f.method || "IMPORT",
          description: f.description,
          proofRequest: f.proofRequest || "",
          proofResponse: f.proofResponse || "",
          payload: f.payload || null,
          confidence: f.confidence ?? 0.7,
          remediation: f.remediation || null,
        },
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push(`Could not persist finding "${f.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    tool,
    engagementId,
    imported,
    skipped,
    errors,
    findings: parsed,
  };
}
