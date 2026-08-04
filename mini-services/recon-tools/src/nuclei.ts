// Nuclei wrapper — runs nuclei against a target URL, parses the JSONL
// output (`-jsonl`) into structured findings.
//
// SECURITY: target URL is validated. Template categories and severity
// filters are validated against a safe charset. All values are passed as
// separate args to Bun.spawn.
//
// Templates: on first run in Docker, nuclei auto-downloads the public
// template repo into ~/.config/nuclei/templates. We also pass -update-template
// only if the env var NUCLEI_UPDATE_TEMPLATES=1 (to avoid 60s+ startup
// penalty on every call).

import {
  isSafeToken,
  isValidSeverity,
  isValidTemplateCategory,
  isValidUrl,
  runWithTimeout,
  type NucleiFinding,
  type NucleiInput,
  type NucleiResult,
} from "./types.js";

const TIMEOUT_MS = 120_000;

const DEFAULT_TEMPLATE_CATEGORIES = ["cves", "vulnerabilities", "misconfiguration", "exposures"];

export function validateNucleiInput(input: NucleiInput): void {
  const target = (input.target ?? "").trim();
  if (!isValidUrl(target)) {
    throw new Error(`Invalid target url: ${target}`);
  }
  if (input.severity) {
    for (const s of input.severity) {
      if (!isValidSeverity(s)) {
        throw new Error(`Invalid severity: ${s}`);
      }
    }
  }
  if (input.templates) {
    for (const t of input.templates) {
      if (!isValidTemplateCategory(t)) {
        throw new Error(`Invalid template category: ${t}`);
      }
    }
  }
}

export async function runNuclei(input: NucleiInput): Promise<NucleiResult> {
  validateNucleiInput(input);

  const target = (input.target ?? "").trim();
  const severity = (input.severity ?? []).filter(isValidSeverity);
  const templates = (input.templates ?? DEFAULT_TEMPLATE_CATEGORIES).filter(isValidTemplateCategory);
  if (templates.length === 0) {
    throw new Error("Invalid templates (no valid categories provided)");
  }

  const args: string[] = [
    "nuclei",
    "-u",
    target,
    "-jsonl", // one JSON object per line
    "-silent", // don't print the banner
    "-nc", // no color
    "-timeout",
    "10", // per-request timeout (nuclei-internal)
    "-rl",
    "30", // rate limit, 30 req/s
    "-c",
    "10", // 10 concurrent templates
  ];

  if (severity.length > 0) {
    args.push("-severity", severity.join(","));
  }

  // Template categories — nuclei accepts -t paths or -tags category names.
  // We pass them as -tags (nuclei's built-in tag filter), which is the
  // documented way to filter by category.
  if (templates.length > 0) {
    args.push("-tags", templates.join(","));
  }

  // Optionally update templates on each run if caller asks for it
  if (process.env.NUCLEI_UPDATE_TEMPLATES === "1") {
    args.push("-update-templates");
  }

  const { exitCode, stdout, stderr, timedOut, durationMs } = await runWithTimeout({
    args,
    timeoutMs: TIMEOUT_MS,
  });

  // nuclei exits 0 even when findings are present. Non-zero typically means
  // invalid args or template load failure.
  const findings = parseNucleiJsonl(stdout);

  if (exitCode !== 0 && findings.length === 0 && !timedOut) {
    throw new Error(`nuclei exited ${exitCode}: ${stderr || stdout || "(no output)"}`);
  }

  return {
    findings,
    total: findings.length,
    timedOut,
    durationMs,
  };
}

function parseNucleiJsonl(jsonl: string): NucleiFinding[] {
  const out: NucleiFinding[] = [];
  const lines = jsonl.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed);
      // nuclei JSONL fields (v3):
      //   "template-id", "info": { "name", "severity", "description", "reference", "tags", "classification": { "cvss-metrics", "cvss-score" } },
      //   "type", "matched-at", "matcher-name", "extracted-results"
      const info = obj.info ?? {};
      const classification = info.classification ?? {};
      const ref: string[] | undefined = Array.isArray(info.reference) ? info.reference : info.reference ? [info.reference] : undefined;

      out.push({
        templateId: obj["template-id"] ?? obj.templateID ?? obj.template_id ?? "",
        name: info.name ?? obj.name ?? "",
        severity: (info.severity ?? obj.severity ?? "info").toLowerCase(),
        type: obj.type ?? "http",
        url: obj["matched-at"] ?? obj.matched ?? obj.host ?? obj.url ?? "",
        matched: obj["matcher-name"] ?? obj.matcher_name ?? obj.matcherName ?? "",
        description: info.description,
        reference: ref,
        cvss: classification["cvss-score"] ?? classification.cvss_score ?? info.cvss,
        tags: Array.isArray(info.tags)
          ? info.tags
          : typeof info.tags === "object"
            ? Object.keys(info.tags as Record<string, unknown>)
            : undefined,
        matchedAt: obj["matched-at"],
        extractedResults: Array.isArray(obj["extracted-results"]) ? obj["extracted-results"] : undefined,
      });
    } catch {
      // Skip un-parseable lines (e.g. progress/log lines)
    }
  }
  return out;
}

export function mockNuclei(input: NucleiInput): NucleiResult {
  return {
    findings: [
      {
        templateId: "CVE-2021-44228",
        name: "Log4j RCE",
        severity: "critical",
        type: "http",
        url: input.target,
        matched: "jndi:ldap",
        description: "Apache Log4j2 JNDI features do not protect against attacker-controlled LDAP and other JNDI related endpoints.",
        reference: ["https://nvd.nist.gov/vuln/detail/CVE-2021-44228"],
        cvss: 10.0,
        tags: ["cve", "rce", "log4j"],
      },
      {
        templateId: "tech-detect",
        name: "Technology Detection",
        severity: "info",
        type: "http",
        url: input.target,
        matched: "nginx",
        tags: ["tech"],
      },
    ],
    total: 2,
    durationMs: 0,
  };
}
