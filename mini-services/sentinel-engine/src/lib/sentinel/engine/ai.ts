// AI core for the GuardianX engine.
// Wraps z-ai-web-dev-sdk to: analyze code for vulnerabilities, generate
// patches with diffs + tests, and chat with humans about a patch.
//
// All functions return structured data. The LLM is instructed to emit strict
// JSON so we can parse it reliably.
//
// ─── Enhanced (auto-remediation-enhance) ────────────────────────────────────
//  • Multi-language support: JS/TS/Python/Go/Java/PHP/Ruby/C#/C++/Rust, each
//    with OWASP-recommended secure-coding patterns injected into the prompt.
//  • Confidence scoring: a deterministic 0..100 formula that combines the
//    sandbox result, the adversarial red-team outcome, OWASP-pattern adoption,
//    and a "no new vulnerabilities" check. See `computeConfidence`.
//  • Patch explanation: every patch now carries a structured explanation with
//    CWE-ID, fix strategy, and expected behavior change.
//  • Adversarial strategy library: known bypass payloads per vulnerability
//    class (SQLi/XSS/path traversal), used deterministically across rounds.

import ZAI from "z-ai-web-dev-sdk";
import {
  LANGUAGE_PATTERNS,
  detectLanguage,
  renderLanguageGuidance,
  owaspPatternScore,
  type SupportedLanguage,
} from "./language-patterns";

export type Severity = "critical" | "high" | "medium" | "low";

export interface DetectedVulnerability {
  title: string;
  severity: Severity;
  cve: string | null;
  affectedFile: string;
  explanation: string;
  reasoning: string;
  confidence: number; // 0..1
  vulnerableSnippet: string;
  // NEW (auto-remediation-enhance): vulnerability class → strategy library key.
  cweId?: string | null;
  vulnClass?: VulnClass;
}

// Vulnerability classes the strategy library + multi-vector sandbox know how
// to handle. Anything else falls back to "other" (the AI still generates
// patches, but the deterministic attack library is skipped).
export type VulnClass =
  | "sqli"
  | "xss"
  | "path-traversal"
  | "command-injection"
  | "ssrf"
  | "auth-bypass"
  | "crypto-weakness"
  | "xxe"
  | "deserialization"
  | "other";

export interface PatchExplanation {
  cweId: string | null; // e.g. "CWE-89"
  vulnClass: VulnClass;
  fixStrategy: string; // e.g. "parameterized query replaces string concatenation"
  behaviorChange: string; // e.g. "user input is now treated as data, not code"
}

export interface GeneratedPatch {
  patchedCode: string;
  diff: string;
  testCode: string;
  explanation: string;
  reasoning: string;
  confidence: number; // 0..1 — final computed score (see computeConfidence)
  // NEW (auto-remediation-enhance)
  language: SupportedLanguage;
  patchExplanation: PatchExplanation;
  // Confidence sub-scores (0..1 each) for transparency / UI breakdown.
  confidenceBreakdown?: ConfidenceBreakdown;
}

export interface GeneratedExploit {
  exploitCode: string;
  description: string;
  expectedBehavior: string; // what success looks like
}

export interface AttackerBypass {
  bypassFound: boolean;
  bypassCode: string; // empty if not found
  reasoning: string;
  technique: string; // e.g. "unicode normalization bypass"
  // NEW: which library strategy was used (if any), for outcome classification.
  strategyId?: string;
}

export interface DefenderIteration {
  patchedCode: string;
  reasoning: string;
  technique: string; // e.g. "added allowlist validation"
}

export interface ScanResult {
  vulnerabilities: DetectedVulnerability[];
}

// ── Confidence scoring ────────────────────────────────────────────────────
// Deterministic 0..100 formula. The breakdown is also returned so the UI can
// show why a patch scored what it did.
//
//   sandbox passed            → +40
//   red-team attack blocked   → +30
//   OWASP patterns adopted    → +15
//   no new vulnerabilities    → +15
//
// "no new vulnerabilities" is a heuristic: the patcher is asked to NOT
// introduce patterns from NEW_VULN_INDICATORS (eval, Function, child_process
// shell strings, etc.). The scorer checks both the original and patched code;
// if the patched code has MORE such indicators than the original, we deduct.

export interface ConfidenceBreakdown {
  sandboxPassed: number; // 0 or 40
  redTeamBlocked: number; // 0 or 30
  owaspPatterns: number; // 0..15 (scaled from owaspPatternScore)
  noNewVulns: number; // 0 or 15
  total: number; // 0..100
}

export interface ConfidenceInput {
  sandboxPassed: boolean;
  redTeamBlocked: boolean; // adversarial arena: defender won (no bypass)
  patchedCode: string;
  originalCode: string;
  language: SupportedLanguage;
}

export function computeConfidence(input: ConfidenceInput): {
  score: number; // 0..1
  breakdown: ConfidenceBreakdown;
} {
  const sandboxPassed = input.sandboxPassed ? 40 : 0;
  const redTeamBlocked = input.redTeamBlocked ? 30 : 0;
  const owaspScore = owaspPatternScore(input.patchedCode, input.language);
  const owaspPatterns = Math.round(owaspScore * 15);

  // "No new vulns" heuristic: count risky patterns in original vs patched.
  const before = countNewVulnIndicators(input.originalCode);
  const after = countNewVulnIndicators(input.patchedCode);
  // Patch must not increase risky-pattern count (small tolerance for reformatting).
  const noNewVulns = after <= before ? 15 : 0;

  const total = Math.min(100, sandboxPassed + redTeamBlocked + owaspPatterns + noNewVulns);
  return {
    score: total / 100,
    breakdown: { sandboxPassed, redTeamBlocked, owaspPatterns, noNewVulns, total },
  };
}

// Patterns that, if introduced by a patch, suggest it might be opening a NEW
// vulnerability. Conservative — false positives only cost 15 confidence points.
const NEW_VULN_INDICATORS: RegExp[] = [
  /\beval\s*\(/,
  /\bnew Function\s*\(/,
  /child_process\.exec\s*\(/,
  /child_process\.execSync\s*\(/,
  /\bexec\s*\(\s*[`'"]/i,
  /dangerouslySetInnerHTML/,
  /innerHTML\s*=/,
  /document\.write\s*\(/,
  /\b__proto__\b/,
  /\bshell\s*=\s*True\b/,
  /\bos\.system\s*\(/,
  /subprocess\.call\([^)]*shell\s*=\s*True/,
  /Runtime\.getRuntime\(\)\.exec\s*\(\s*[^,)]*\+/,
];

function countNewVulnIndicators(code: string): number {
  if (!code) return 0;
  let n = 0;
  for (const re of NEW_VULN_INDICATORS) {
    const matches = code.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    if (matches) n += matches.length;
  }
  return n;
}

// ── Adversarial strategy library ──────────────────────────────────────────
// Known bypass techniques per vulnerability class. The attacker persona still
// uses the LLM to craft a concrete exploit, but the strategy library gives it
// a deterministic prompt for each round + concrete payload examples, which:
//   1. guarantees coverage of canonical bypass techniques (no more "the LLM
//      forgot to try encoding"),
//   2. keeps the arena honest across runs (reproducible strategy ordering),
//   3. gives the confidence scorer something to anchor on.

export interface AttackStrategy {
  id: string;
  vulnClass: VulnClass;
  technique: string; // human-readable name
  description: string; // prompt hint for the LLM attacker
  examplePayloads: string[]; // concrete payloads to try
}

export const ATTACK_STRATEGIES: AttackStrategy[] = [
  // ── SQLi ──────────────────────────────────────────────────────────────
  {
    id: "sqli-url-encoding",
    vulnClass: "sqli",
    technique: "URL-encoded quote bypass",
    description:
      "Try URL-encoding the SQL meta-characters so any naive `replace(\"'\", \"''\")` sanitizer fails to catch them. The decoded form must reach the SQL layer.",
    examplePayloads: ["%27", "%27%20OR%201%3D1--", "1%27%20OR%20%271%27=%271"],
  },
  {
    id: "sqli-case-variation",
    vulnClass: "sqli",
    technique: "Case-variation keyword bypass",
    description:
      "If the patch uses a case-sensitive keyword blocklist (e.g. /select|union|or/), try mixed-case keywords that bypass it but are still valid SQL.",
    examplePayloads: ["' Or '1'='1", "' UnIoN SeLeCt 1,2--", "' oR 1=1#"],
  },
  {
    id: "sqli-comment-based",
    vulnClass: "sqli",
    technique: "Comment-based truncation bypass",
    description:
      "Use SQL comments (--, #, /**/) to truncate the rest of the query so a trailing quote doesn't break syntax.",
    examplePayloads: ["admin'--", "admin'#", "1'/**/OR/**/1=1--", "' OR 1=1;--"],
  },
  {
    id: "sqli-nested-quotes",
    vulnClass: "sqli",
    technique: "Nested quote / escaped-quote bypass",
    description:
      "If the patch escapes quotes by doubling them, try payloads that already contain doubled quotes or backslash-escaped quotes that confuse the escaper.",
    examplePayloads: ["' OR '1'='1' --", "\\' OR 1=1--", "1' OR ''1''='1"],
  },
  // ── XSS ──────────────────────────────────────────────────────────────
  {
    id: "xss-html-entity-encoding",
    vulnClass: "xss",
    technique: "HTML-entity-encoded payload",
    description:
      "HTML-entity-encode the dangerous characters of your payload so a naive regex strip of <script> misses them; the browser decodes the entities at render time.",
    examplePayloads: ["&lt;script&gt;alert(1)&lt;/script&gt;", "&#60;script&#62;alert(1)&#60;/script&#62;"],
  },
  {
    id: "xss-nested-tag",
    vulnClass: "xss",
    technique: "Nested-tag bypass",
    description:
      "If the patch strips <script> once, nest it: <scr<script>ipt> → after one strip becomes <script>.",
    examplePayloads: ["<scr<script>ipt>alert(1)</scr</script>ipt>", "<img<img src=x onerror=alert(1)>"],
  },
  {
    id: "xss-event-handler",
    vulnClass: "xss",
    technique: "Event-handler attribute bypass",
    description:
      "Bypass a <script> blocklist by using event handlers on otherwise-benign tags (onerror, onload, onfocus, ontoggle).",
    examplePayloads: ["<img src=x onerror=alert(1)>", "<svg onload=alert(1)>", "<body onload=alert(1)>", "<input onfocus=alert(1) autofocus>"],
  },
  {
    id: "xss-data-uri",
    vulnClass: "xss",
    technique: "data: URI / javascript: URI bypass",
    description:
      "If <script> tags are blocked, deliver JS via a data: or javascript: URI on an href/src attribute.",
    examplePayloads: ["<a href=\"javascript:alert(1)\">x</a>", "<iframe src=\"data:text/html,<script>alert(1)</script>\">", "<object data=\"javascript:alert(1)\">"],
  },
  // ── Path traversal ─────────────────────────────────────────────────────
  {
    id: "pathtr-double-encoding",
    vulnClass: "path-traversal",
    technique: "Double-encoding bypass",
    description:
      "Double-encode ../ (e.g. %252e%252e%252f) so a single URL-decode pass still leaves encoded output that the filesystem then decodes.",
    examplePayloads: ["%252e%252e%252f%252e%252e%252fetc%252fpasswd", "..%252f..%252f..%252fetc%252fpasswd"],
  },
  {
    id: "pathtr-null-byte",
    vulnClass: "path-traversal",
    technique: "Null-byte truncation bypass",
    description:
      "If the patch checks the extension after a traversal, try injecting a null byte to truncate the filename before the extension check.",
    examplePayloads: ["../../../etc/passwd%00.txt", "../../../../etc/passwd%00.png"],
  },
  {
    id: "pathtr-unicode",
    vulnClass: "path-traversal",
    technique: "Unicode normalization bypass",
    description:
      "Use Unicode-encoded dot-dot-slash variants (e.g. ..%c0%af, ..%ef%bc%8f) that normalize back to ../ after canonicalization.",
    examplePayloads: ["..%c0%af..%c0%afetc/passwd", "..%ef%bc%8f..%ef%bc%8fetc/passwd"],
  },
  // ── Command injection ──────────────────────────────────────────────────
  {
    id: "cmdi-shell-meta",
    vulnClass: "command-injection",
    technique: "Shell metacharacter bypass",
    description:
      "If the patch uses a blocklist of shell metacharacters, try less-common ones that may be missed: ;, |, ||, &&, $(), ``, \\n, \\x0a.",
    examplePayloads: ["; ls", "| cat /etc/passwd", "$(whoami)", "`id`", "&& whoami", "%0aid"],
  },
  {
    id: "cmdi-ifs-split",
    vulnClass: "command-injection",
    technique: "IFS / argument splitting bypass",
    description:
      "If spaces are blocked, use ${IFS} or tab characters as argument separators.",
    examplePayloads: ["cat${IFS}/etc/passwd", "ls\\t-la"],
  },
  // ── Auth bypass ─────────────────────────────────────────────────────────
  {
    id: "auth-type-juggling",
    vulnClass: "auth-bypass",
    technique: "Type juggling / truthy comparison bypass",
    description:
      "If the patch compares tokens with == (loose), craft a payload that juggles to true: arrays, true, 0, '0', empty string.",
    examplePayloads: ["[]", "true", "0", ""],
  },
  {
    id: "auth-timing-attack",
    vulnClass: "auth-bypass",
    technique: "Timing-attack on token comparison",
    description:
      "If the patch uses non-constant-time comparison, time-attack the token character by character (note this in reasoning; the exploit may not be observable in the sandbox but it's a real vuln class).",
    examplePayloads: [],
  },
];

// Pick the next deterministic strategy for a round, given the vuln class and
// already-tried strategy ids. Returns null if the library is exhausted for
// that class (the LLM attacker then free-forms).
export function pickStrategy(
  vulnClass: VulnClass,
  triedIds: string[]
): AttackStrategy | null {
  const pool = ATTACK_STRATEGIES.filter(
    (s) => s.vulnClass === vulnClass && !triedIds.includes(s.id)
  );
  if (pool.length === 0) return null;
  // Stable order: by id. Makes runs reproducible.
  pool.sort((a, b) => a.id.localeCompare(b.id));
  return pool[0];
}

// Classify a vulnerability from its title + explanation + snippet.
// Used to pick the right strategy bucket. Falls back to "other".
export function classifyVulnerability(vuln: {
  title: string;
  explanation: string;
  vulnerableSnippet: string;
  cweId?: string | null;
}): VulnClass {
  const text = `${vuln.title} ${vuln.explanation} ${vuln.vulnerableSnippet}`.toLowerCase();
  if (vuln.cweId) {
    const m = vuln.cweId.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n === 89) return "sqli";
      if (n === 79) return "xss";
      if (n === 22 || n === 23) return "path-traversal";
      if (n === 78) return "command-injection";
      if (n === 918) return "ssrf";
      if (n === 287 || n === 306 || n === 862) return "auth-bypass";
      if (n === 327 || n === 328 || n === 916) return "crypto-weakness";
      if (n === 611) return "xxe";
      if (n === 502) return "deserialization";
    }
  }
  if (/sql\s*injection|sqli|\bor\s+1=1\b|union\s+select/.test(text)) return "sqli";
  if (/xss|cross[- ]?site\s*script|<script|onerror|onload/.test(text)) return "xss";
  if (/path\s*traversal|directory\s*traversal|\.\.\//.test(text)) return "path-traversal";
  if (/command\s*injection|os\s*command|shell\s*injection|\brce\b/.test(text)) return "command-injection";
  if (/ssrf|server[- ]?side\s*request/.test(text)) return "ssrf";
  if (/auth(?:entication|orization)\s*(bypass|weak|missing)|privilege\s*escal/.test(text)) return "auth-bypass";
  if (/weak\s*crypto|md5|sha1|hardcoded\s*(secret|password)|insecure\s*random/.test(text)) return "crypto-weakness";
  if (/xxe|xml\s*external\s*entity/.test(text)) return "xxe";
  if (/deserializ|insecure\s*deserializ/.test(text)) return "deserialization";
  return "other";
}

let zaiPromise: Promise<ZAI> | null = null;
async function sdk(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// Strip code fences and leading/trailing prose so we can JSON.parse reliably.
function extractJson(raw: string): string {
  let s = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Find first { and last } to trim prose around a JSON object/array.
  const first = s.search(/[[{]/);
  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const last = Math.max(lastBrace, lastBracket);
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}

/**
 * Analyze a codebase for security vulnerabilities.
 * Returns up to `maxFindings` structured vulnerabilities.
 */
export async function analyzeCodebase(
  filename: string,
  sourceCode: string,
  maxFindings = 4
): Promise<ScanResult> {
  const z = await sdk();
  const language = detectLanguage(filename, sourceCode);

  const system = [
    "You are GuardianX, an elite application security engineer.",
    "You analyze source code for real, exploitable security vulnerabilities.",
    "You are precise: only report vulnerabilities you are confident actually exist in the provided code.",
    "Do NOT report style issues, theoretical problems, or things that require external context not present.",
    "For each finding, classify severity: critical (RCE / auth bypass / data leak), high (injection / XSS / authn weakness), medium (info leak / weak crypto), low (hardening).",
    `The target language is ${language}. Tailor your analysis to language-specific vulnerability patterns.`,
    "Respond with STRICT JSON only — no prose, no markdown fences.",
  ].join(" ");

  const user = [
    `File: ${filename}`,
    "",
    "```" + language,
    sourceCode,
    "```",
    "",
    `Find up to ${maxFindings} genuine vulnerabilities in this file.`,
    "Respond with JSON in this exact shape:",
    '{"vulnerabilities":[{"title":string,"severity":"critical|high|medium|low","cve":string|null,"cweId":string|null,"affectedFile":string,"explanation":string,"reasoning":string,"confidence":number,"vulnerableSnippet":string}]}',
    "Rules:",
    "- confidence is a number between 0 and 1 reflecting how certain you are the vulnerability is real.",
    "- vulnerableSnippet is the exact lines of vulnerable code (1-4 lines).",
    "- cve is a real CVE id if you can identify it, otherwise null.",
    "- cweId is the CWE id (e.g. 'CWE-89' for SQLi, 'CWE-79' for XSS, 'CWE-22' for path traversal).",
    "- Keep explanation under 80 words, reasoning under 120 words.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<ScanResult>(raw, { vulnerabilities: [] });

  // Normalize + cap findings.
  const vulns = (parsed.vulnerabilities ?? [])
    .filter((v) => v && v.title)
    .slice(0, maxFindings)
    .map((v) => {
      const vulnClass = classifyVulnerability({
        title: String(v.title),
        explanation: String(v.explanation ?? ""),
        vulnerableSnippet: String(v.vulnerableSnippet ?? ""),
        cweId: v.cweId ?? null,
      });
      return {
        title: String(v.title),
        severity: (["critical", "high", "medium", "low"].includes(v.severity)
          ? v.severity
          : "medium") as Severity,
        cve: v.cve ? String(v.cve) : null,
        cweId: v.cweId ? String(v.cweId) : null,
        vulnClass,
        affectedFile: v.affectedFile || filename,
        explanation: String(v.explanation ?? ""),
        reasoning: String(v.reasoning ?? ""),
        confidence: clamp01(Number(v.confidence) || 0.5),
        vulnerableSnippet: String(v.vulnerableSnippet ?? ""),
      };
    });

  return { vulnerabilities: vulns };
}

/**
 * Generate a patch for a single vulnerability: patched source, unified diff,
 * a self-contained test file that validates the fix, and a structured
 * explanation of WHY the patch works (CWE, strategy, behavior change).
 */
export async function generatePatch(
  filename: string,
  sourceCode: string,
  vuln: DetectedVulnerability
): Promise<GeneratedPatch> {
  const z = await sdk();
  const language = detectLanguage(filename, sourceCode);
  const guidance = renderLanguageGuidance(language);
  const vulnClass = vuln.vulnClass ?? classifyVulnerability(vuln);

  const system = [
    "You are GuardianX, an elite security engineer that writes correct, minimal patches.",
    "You produce: (1) the FULL patched file, (2) a unified diff, (3) a FULLY SELF-CONTAINED Node.js test file, (4) a structured patch explanation.",
    "",
    guidance,
    "",
    "CRITICAL TEST REQUIREMENTS (the sandbox runs the test in an EMPTY temp dir with only the test file):",
    "- The test file MUST be 100% self-contained. Do NOT require('./source.js') or any external file.",
    "- INLINE the patched functions directly inside the test file (copy the fixed function bodies in).",
    "- Stub ALL external modules the source used (e.g. 'express', './db', database clients) with inline fakes.",
    "- Use ONLY Node.js built-ins: 'node:assert', 'node:crypto', 'node:path', 'node:fs'. NO third-party packages.",
    "- The test MUST run with `node test.js` and exit 0 if all assertions pass, non-zero otherwise.",
    "- Always call process.exit(0) at the end on success, and process.exit(1) on failure.",
    "- Wrap async tests in an async main() and await them; catch errors and exit(1).",
    "- Tests must include THREE categories:",
    "  1. ATTACK PAYLOAD TEST: the original exploit payload MUST be rejected/blocked by the patched code.",
    "  2. LEGITIMATE INPUT TEST: a normal, valid input MUST still work (no false positive / broken functionality).",
    "  3. REGRESSION TEST: an assertion that the patched code uses the recommended secure pattern (e.g. parameterized query, escape function) — fails if someone removes the fix.",
    "",
    "Respond with STRICT JSON only — no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `File: ${filename} (language: ${language})`,
    "",
    "Vulnerable source:",
    "```" + language,
    sourceCode,
    "```",
    "",
    "Vulnerability to fix:",
    `- Title: ${vuln.title}`,
    `- Severity: ${vuln.severity}`,
    `- CWE: ${vuln.cweId ?? "unknown"}`,
    `- Vulnerability class: ${vulnClass}`,
    `- Explanation: ${vuln.explanation}`,
    `- Vulnerable snippet: ${vuln.vulnerableSnippet}`,
    "",
    "Generate a patch. Respond with JSON in this exact shape:",
    '{"patchedCode":string,"diff":string,"testCode":string,"explanation":string,"reasoning":string,"confidence":number,"patchExplanation":{"cweId":string|null,"vulnClass":string,"fixStrategy":string,"behaviorChange":string}}',
    "Rules:",
    "- patchedCode is the COMPLETE patched file (not a fragment).",
    "- diff is a unified diff (--- /+++ /@@ lines) of original -> patched.",
    "- testCode is a COMPLETE runnable .js test file that is 100% self-contained (inline the patched functions, stub external deps, use only node: built-ins).",
    "- confidence is 0..1 reflecting how confident you are the patch fully fixes the vulnerability without regressions.",
    "- patchExplanation.cweId: the CWE this patch addresses (e.g. 'CWE-89').",
    "- patchExplanation.vulnClass: one of sqli|xss|path-traversal|command-injection|ssrf|auth-bypass|crypto-weakness|xxe|deserialization|other.",
    "- patchExplanation.fixStrategy: one sentence naming the defensive technique (e.g. 'parameterized query replaces string concatenation').",
    "- patchExplanation.behaviorChange: one sentence describing what the user-observable behavior change is (e.g. 'user input is now treated as data, not code').",
    "- explanation under 80 words, reasoning under 140 words.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<Partial<GeneratedPatch>>(raw, {
    patchedCode: sourceCode,
    diff: "",
    testCode: "",
    explanation: vuln.explanation,
    reasoning: vuln.reasoning,
    confidence: vuln.confidence,
  });

  // Normalize the patch explanation.
  const rawExpl = (parsed.patchExplanation ?? {}) as Partial<PatchExplanation>;
  const patchExplanation: PatchExplanation = {
    cweId: rawExpl.cweId ? String(rawExpl.cweId) : (vuln.cweId ?? null),
    vulnClass: (rawExpl.vulnClass as VulnClass) ?? vulnClass,
    fixStrategy: String(rawExpl.fixStrategy ?? "applied input validation + output encoding"),
    behaviorChange: String(rawExpl.behaviorChange ?? "user input is no longer interpreted as code"),
  };

  // Initial confidence — the pipeline will recompute after sandbox + adversarial.
  const init = computeConfidence({
    sandboxPassed: false,
    redTeamBlocked: false,
    patchedCode: String(parsed.patchedCode ?? sourceCode),
    originalCode: sourceCode,
    language,
  });

  return {
    patchedCode: String(parsed.patchedCode ?? sourceCode),
    diff: String(parsed.diff ?? ""),
    testCode: String(parsed.testCode ?? ""),
    explanation: String(parsed.explanation ?? vuln.explanation),
    reasoning: String(parsed.reasoning ?? vuln.reasoning),
    confidence: clamp01(Number(parsed.confidence) ?? init.score),
    language,
    patchExplanation,
    confidenceBreakdown: init.breakdown,
  };
}

/**
 * Generate a self-contained proof-of-concept exploit that demonstrates the
 * vulnerability is genuinely exploitable in the ORIGINAL code.
 *
 * The exploit must:
 *   - stub all external deps the target uses (e.g. './db', 'express')
 *   - require the target source file by its filename
 *   - invoke the vulnerable function with a crafted attack payload
 *   - print EXACTLY one marker: `EXPLOIT_SUCCESS: <detail>` (vuln confirmed)
 *     or `EXPLOIT_BLOCKED: <detail>` (vuln not exploitable)
 *   - exit 0 on success, exit 2 if blocked
 *
 * We later run the SAME exploit against the patched code to prove the fix.
 */
export async function generateExploit(
  filename: string,
  sourceCode: string,
  vuln: DetectedVulnerability
): Promise<GeneratedExploit> {
  const z = await sdk();
  const language = detectLanguage(filename, sourceCode);
  const vulnClass = vuln.vulnClass ?? classifyVulnerability(vuln);

  const system = [
    "You are GuardianX's Red Team module. You write minimal, self-contained proof-of-concept exploits that DEMONSTRATE a vulnerability is real and exploitable.",
    "",
    `Target language: ${language}.`,
    `Vulnerability class: ${vulnClass}.`,
    "",
    "EXPLOIT REQUIREMENTS (runs in an isolated temp dir with ONLY the exploit file + the target source file):",
    "- The exploit MUST require the target source file by its exact filename (e.g. require('./" + filename + "')).",
    "- BEFORE requiring the target, stub ALL its external dependencies by writing fake module files to __dirname (e.g. write a ./db.js stub that captures queries; write a minimal ./node_modules placeholder if needed).",
    "- Use ONLY Node.js built-ins (fs, path, crypto, etc.). NO third-party packages.",
    "- Invoke the vulnerable function with a crafted attack payload that demonstrates exploitation.",
    "- Detect whether exploitation succeeded (e.g. the raw query string contains your payload unescaped; a file outside the allowlist was read; an error leaked internals).",
    "- Print EXACTLY one marker line: `EXPLOIT_SUCCESS: <short detail>` if the vuln is confirmed, or `EXPLOIT_BLOCKED: <short detail>` if it isn't.",
    "- Call process.exit(0) on EXPLOIT_SUCCESS, process.exit(2) on EXPLOIT_BLOCKED.",
    "- Wrap async logic in an async main() with try/catch; on error print `EXPLOIT_ERROR: <msg>` and exit(1).",
    "",
    "Respond with STRICT JSON only — no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "Target source:",
    "```" + language,
    sourceCode,
    "```",
    "",
    "Vulnerability to exploit:",
    `- Title: ${vuln.title}`,
    `- Severity: ${vuln.severity}`,
    `- CWE: ${vuln.cweId ?? "unknown"}`,
    `- Explanation: ${vuln.explanation}`,
    `- Vulnerable snippet: ${vuln.vulnerableSnippet}`,
    "",
    "Write a PoC exploit. Respond with JSON in this exact shape:",
    '{"exploitCode":string,"description":string,"expectedBehavior":string}',
    "- description: one sentence naming the attack technique (e.g. \"SQLi auth bypass via OR 1=1\").",
    "- expectedBehavior: what the exploit observes to confirm success.",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<GeneratedExploit>(raw, {
    exploitCode: "",
    description: vuln.title,
    expectedBehavior: "exploit demonstrates the vulnerability",
  });

  return {
    exploitCode: String(parsed.exploitCode ?? ""),
    description: String(parsed.description ?? vuln.title),
    expectedBehavior: String(parsed.expectedBehavior ?? ""),
  };
}

/**
 * Attacker persona: given the PATCHED code + the original vuln + the original
 * exploit, try to craft a NEW payload that bypasses the patch and re-exploits
 * the vulnerability.
 *
 * If no bypass is possible, the attacker concedes (bypassFound = false).
 *
 * Enhanced (auto-remediation-enhance): the caller may pass a `strategyId`
 * from the ATTACK_STRATEGIES library; the attacker is then asked to construct
 * a concrete exploit using that specific technique. This guarantees coverage
 * of canonical bypass techniques across rounds.
 */
export async function generateBypass(
  filename: string,
  patchedCode: string,
  vuln: DetectedVulnerability,
  originalExploitCode: string,
  previousAttempts: { technique: string; outcome: string }[],
  strategy?: AttackStrategy | null
): Promise<AttackerBypass> {
  const z = await sdk();
  const language = detectLanguage(filename, patchedCode);
  const vulnClass = vuln.vulnClass ?? classifyVulnerability(vuln);

  const strategyBlock = strategy
    ? [
        `DETERMINISTIC STRATEGY (round ${previousAttempts.length + 1}):`,
        `- Technique: ${strategy.technique}`,
        `- Description: ${strategy.description}`,
        `- Example payloads to adapt: ${JSON.stringify(strategy.examplePayloads)}`,
        "You MUST construct your bypass using this technique. If the patched code genuinely blocks this specific technique, set bypassFound=false and explain why.",
      ].join("\n")
    : "No deterministic strategy assigned for this round — pick your best remaining bypass technique.";

  const system = [
    "You are GuardianX's ADVERSARIAL ATTACKER. Your job is to break the defender's patch.",
    "You are given the PATCHED source and the original vulnerability. Find a REAL input payload that STILL triggers the vulnerability despite the patch.",
    "Do NOT invent theoretical issues. Only report a bypass if you can construct a concrete payload that demonstrably re-exploits the vuln.",
    "If the patch genuinely blocks all attack vectors you can think of, concede honestly (bypassFound=false).",
    "",
    `Target language: ${language}.`,
    `Vulnerability class: ${vulnClass}.`,
    "",
    "BYPASS EXPLOIT REQUIREMENTS (same format as a PoC exploit):",
    "- require the target by filename, stub external deps first, use only node built-ins.",
    "- Print `EXPLOIT_SUCCESS: <detail>` if the bypass works, `EXPLOIT_BLOCKED: <detail>` if it doesn't.",
    "- exit(0) on success, exit(2) on blocked.",
    "",
    "Respond with STRICT JSON only — no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "PATCHED source:",
    "```" + language,
    patchedCode,
    "```",
    "",
    "Original vulnerability:",
    `- Title: ${vuln.title}`,
    `- Explanation: ${vuln.explanation}`,
    `- Vulnerable snippet: ${vuln.vulnerableSnippet}`,
    "",
    "Original exploit (for reference — you must find a DIFFERENT bypass):",
    "```js",
    originalExploitCode,
    "```",
    "",
    previousAttempts.length
      ? "Previous bypass attempts (do NOT repeat these):\n" +
        previousAttempts
          .map((a, i) => `  ${i + 1}. ${a.technique} → ${a.outcome}`)
          .join("\n")
      : "No previous attempts.",
    "",
    strategyBlock,
    "",
    "Find a bypass OR concede. Respond with JSON in this exact shape:",
    '{"bypassFound":boolean,"bypassCode":string,"reasoning":string,"technique":string}',
    "- If bypassFound is false, leave bypassCode empty and explain in reasoning why the patch holds.",
    "- technique: short name for the attack (e.g. \"double-encoded path traversal\", \"comment-based SQLi\").",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<AttackerBypass>(raw, {
    bypassFound: false,
    bypassCode: "",
    reasoning: "Attacker conceded.",
    technique: "none",
  });

  return {
    bypassFound: Boolean(parsed.bypassFound),
    bypassCode: String(parsed.bypassCode ?? ""),
    reasoning: String(parsed.reasoning ?? ""),
    technique: String(parsed.technique ?? "unknown"),
    strategyId: strategy?.id,
  };
}

/**
 * Defender persona: given the current patched code + the vuln + the attacker's
 * successful bypass, produce an IMPROVED patch that blocks BOTH the original
 * exploit AND the new bypass, without breaking legitimate functionality.
 */
export async function generateImprovedPatch(
  filename: string,
  originalCode: string,
  currentPatchedCode: string,
  vuln: DetectedVulnerability,
  bypassCode: string,
  attackerTechnique: string
): Promise<DefenderIteration> {
  const z = await sdk();
  const language = detectLanguage(filename, currentPatchedCode);
  const guidance = renderLanguageGuidance(language);
  const vulnClass = vuln.vulnClass ?? classifyVulnerability(vuln);

  const system = [
    "You are GuardianX's ADVERSARIAL DEFENDER. The attacker found a bypass of your patch. Iterate.",
    "Produce a NEW full patched file that blocks the original vulnerability AND the attacker's new bypass, while preserving all legitimate behavior of the original code.",
    "Be surgical — change as little as possible while closing the bypass.",
    "",
    `Target language: ${language}.`,
    `Vulnerability class: ${vulnClass}.`,
    guidance,
    "",
    "Respond with STRICT JSON only — no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "ORIGINAL (vulnerable) source:",
    "```" + language,
    originalCode,
    "```",
    "",
    "CURRENT patched code (was bypassed):",
    "```" + language,
    currentPatchedCode,
    "```",
    "",
    "Vulnerability:",
    `- Title: ${vuln.title}`,
    `- Explanation: ${vuln.explanation}`,
    "",
    "Attacker's bypass technique: " + attackerTechnique,
    "",
    "Attacker's bypass exploit (your new patch MUST block this):",
    "```js",
    bypassCode,
    "```",
    "",
    "Produce an improved patch. Respond with JSON in this exact shape:",
    '{"patchedCode":string,"reasoning":string,"technique":string}',
    "- patchedCode is the COMPLETE improved file.",
    "- technique: short name for your defensive change (e.g. \"switched to allowlist validation\").",
  ].join("\n");

  const completion = await z.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParse<DefenderIteration>(raw, {
    patchedCode: currentPatchedCode,
    reasoning: "Defender kept the current patch.",
    technique: "no change",
  });

  return {
    patchedCode: String(parsed.patchedCode ?? currentPatchedCode),
    reasoning: String(parsed.reasoning ?? ""),
    technique: String(parsed.technique ?? "unknown"),
  };
}

/**
 * Chat with the AI about a specific patch. History is passed in.
 */
export async function chatAboutPatch(
  systemContext: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string
): Promise<string> {
  const z = await sdk();

  const messages: { role: "assistant" | "user"; content: string }[] = [
    {
      role: "assistant",
      content: [
        "You are GuardianX, an elite security engineer.",
        "You are discussing a specific security patch with a human reviewer.",
        "Be concise, technical, and honest. If the patch has limitations, say so.",
        "Context about the patch:",
        systemContext,
      ].join("\n"),
    },
    ...history.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const completion = await z.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });

  return completion.choices[0]?.message?.content ?? "(no response)";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

// Re-export language utilities for callers that want them.
export { LANGUAGE_PATTERNS, detectLanguage, renderLanguageGuidance, owaspPatternScore };
export type { SupportedLanguage };
