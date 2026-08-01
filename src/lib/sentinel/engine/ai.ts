// AI core for the GuardianX engine.
// Wraps z-ai-web-dev-sdk to: analyze code for vulnerabilities, generate
// patches with diffs + tests, and chat with humans about a patch.
//
// All functions return structured data. The LLM is instructed to emit strict
// JSON so we can parse it reliably.

import ZAI from "z-ai-web-dev-sdk";

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
}

export interface GeneratedPatch {
  patchedCode: string;
  diff: string;
  testCode: string;
  explanation: string;
  reasoning: string;
  confidence: number;
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
}

export interface DefenderIteration {
  patchedCode: string;
  reasoning: string;
  technique: string; // e.g. "added allowlist validation"
}

export interface ScanResult {
  vulnerabilities: DetectedVulnerability[];
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

  const system = [
    "You are GuardianX, an elite application security engineer.",
    "You analyze source code for real, exploitable security vulnerabilities.",
    "You are precise: only report vulnerabilities you are confident actually exist in the provided code.",
    "Do NOT report style issues, theoretical problems, or things that require external context not present.",
    "For each finding, classify severity: critical (RCE / auth bypass / data leak), high (injection / XSS / authn weakness), medium (info leak / weak crypto), low (hardening).",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    `File: ${filename}`,
    "",
    "```js",
    sourceCode,
    "```",
    "",
    `Find up to ${maxFindings} genuine vulnerabilities in this file.`,
    "Respond with JSON in this exact shape:",
    '{"vulnerabilities":[{"title":string,"severity":"critical|high|medium|low","cve":string|null,"affectedFile":string,"explanation":string,"reasoning":string,"confidence":number,"vulnerableSnippet":string}]}',
    "Rules:",
    "- confidence is a number between 0 and 1 reflecting how certain you are the vulnerability is real.",
    "- vulnerableSnippet is the exact lines of vulnerable code (1-4 lines).",
    "- cve is a real CVE id if you can identify it, otherwise null.",
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
    .map((v) => ({
      title: String(v.title),
      severity: (["critical", "high", "medium", "low"].includes(v.severity)
        ? v.severity
        : "medium") as Severity,
      cve: v.cve ? String(v.cve) : null,
      affectedFile: v.affectedFile || filename,
      explanation: String(v.explanation ?? ""),
      reasoning: String(v.reasoning ?? ""),
      confidence: clamp01(Number(v.confidence) || 0.5),
      vulnerableSnippet: String(v.vulnerableSnippet ?? ""),
    }));

  return { vulnerabilities: vulns };
}

/**
 * Generate a patch for a single vulnerability: patched source, unified diff,
 * and a self-contained test file that validates the fix.
 */
export async function generatePatch(
  filename: string,
  sourceCode: string,
  vuln: DetectedVulnerability
): Promise<GeneratedPatch> {
  const z = await sdk();

  const system = [
    "You are GuardianX, an elite security engineer that writes correct, minimal patches.",
    "You produce: (1) the FULL patched file, (2) a unified diff, (3) a FULLY SELF-CONTAINED Node.js test file.",
    "",
    "CRITICAL TEST REQUIREMENTS (the sandbox runs the test in an EMPTY temp dir with only the test file):",
    "- The test file MUST be 100% self-contained. Do NOT require('./source.js') or any external file.",
    "- INLINE the patched functions directly inside the test file (copy the fixed function bodies in).",
    "- Stub ALL external modules the source used (e.g. 'express', './db', database clients) with inline fakes.",
    "- Use ONLY Node.js built-ins: 'node:assert', 'node:crypto', 'node:path', 'node:fs'. NO third-party packages.",
    "- The test MUST run with `node test.js` and exit 0 if all assertions pass, non-zero otherwise.",
    "- Always call process.exit(0) at the end on success, and process.exit(1) on failure.",
    "- Wrap async tests in an async main() and await them; catch errors and exit(1).",
    "- Tests must prove the vulnerability is no longer exploitable (e.g. an injection payload is rejected).",
    "",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join(" ");

  const user = [
    `File: ${filename}`,
    "",
    "Vulnerable source:",
    "```js",
    sourceCode,
    "```",
    "",
    "Vulnerability to fix:",
    `- Title: ${vuln.title}`,
    `- Severity: ${vuln.severity}`,
    `- Explanation: ${vuln.explanation}`,
    `- Vulnerable snippet: ${vuln.vulnerableSnippet}`,
    "",
    "Generate a patch. Respond with JSON in this exact shape:",
    '{"patchedCode":string,"diff":string,"testCode":string,"explanation":string,"reasoning":string,"confidence":number}',
    "Rules:",
    "- patchedCode is the COMPLETE patched file (not a fragment).",
    "- diff is a unified diff (--- /+++ /@@ lines) of original -> patched.",
    "- testCode is a COMPLETE runnable .js test file that is 100% self-contained (inline the patched functions, stub external deps, use only node: built-ins).",
    "- confidence is 0..1 reflecting how confident you are the patch fully fixes the vulnerability without regressions.",
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
  const parsed = safeParse<GeneratedPatch>(raw, {
    patchedCode: sourceCode,
    diff: "",
    testCode: "",
    explanation: vuln.explanation,
    reasoning: vuln.reasoning,
    confidence: vuln.confidence,
  });

  return {
    patchedCode: String(parsed.patchedCode ?? sourceCode),
    diff: String(parsed.diff ?? ""),
    testCode: String(parsed.testCode ?? ""),
    explanation: String(parsed.explanation ?? vuln.explanation),
    reasoning: String(parsed.reasoning ?? vuln.reasoning),
    confidence: clamp01(Number(parsed.confidence) ?? vuln.confidence),
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

  const system = [
    "You are GuardianX's Red Team module. You write minimal, self-contained proof-of-concept exploits that DEMONSTRATE a vulnerability is real and exploitable.",
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
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "Target source:",
    "```js",
    sourceCode,
    "```",
    "",
    "Vulnerability to exploit:",
    `- Title: ${vuln.title}`,
    `- Severity: ${vuln.severity}`,
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
 */
export async function generateBypass(
  filename: string,
  patchedCode: string,
  vuln: DetectedVulnerability,
  originalExploitCode: string,
  previousAttempts: { technique: string; outcome: string }[]
): Promise<AttackerBypass> {
  const z = await sdk();

  const system = [
    "You are GuardianX's ADVERSARIAL ATTACKER. Your job is to break the defender's patch.",
    "You are given the PATCHED source and the original vulnerability. Find a REAL input payload that STILL triggers the vulnerability despite the patch.",
    "Do NOT invent theoretical issues. Only report a bypass if you can construct a concrete payload that demonstrably re-exploits the vuln.",
    "If the patch genuinely blocks all attack vectors you can think of, concede honestly (bypassFound=false).",
    "",
    "BYPASS EXPLOIT REQUIREMENTS (same format as a PoC exploit):",
    "- require the target by filename, stub external deps first, use only node built-ins.",
    "- Print `EXPLOIT_SUCCESS: <detail>` if the bypass works, `EXPLOIT_BLOCKED: <detail>` if it doesn't.",
    "- exit(0) on success, exit(2) on blocked.",
    "",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "PATCHED source:",
    "```js",
    patchedCode,
    "```",
    "",
    "Original vulnerability:",
    `- Title: ${vuln.title}`,
    `- Explanation: ${vuln.explanation}`,
    `- Vulnerable snippet: ${vuln.vulnerableSnippet}`,
    "",
    "Original exploit (for reference, you must find a DIFFERENT bypass):",
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

  const system = [
    "You are GuardianX's ADVERSARIAL DEFENDER. The attacker found a bypass of your patch. Iterate.",
    "Produce a NEW full patched file that blocks the original vulnerability AND the attacker's new bypass, while preserving all legitimate behavior of the original code.",
    "Be surgical, change as little as possible while closing the bypass.",
    "",
    "Respond with STRICT JSON only, no prose, no markdown fences.",
  ].join("\n");

  const user = [
    `Target file: ${filename}`,
    "",
    "ORIGINAL (vulnerable) source:",
    "```js",
    originalCode,
    "```",
    "",
    "CURRENT patched code (was bypassed):",
    "```js",
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
