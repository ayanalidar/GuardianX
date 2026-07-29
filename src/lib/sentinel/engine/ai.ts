// AI core for the SentinelPatch engine.
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
    "You are SentinelPatch, an elite application security engineer.",
    "You analyze source code for real, exploitable security vulnerabilities.",
    "You are precise: only report vulnerabilities you are confident actually exist in the provided code.",
    "Do NOT report style issues, theoretical problems, or things that require external context not present.",
    "For each finding, classify severity: critical (RCE / auth bypass / data leak), high (injection / XSS / authn weakness), medium (info leak / weak crypto), low (hardening).",
    "Respond with STRICT JSON only — no prose, no markdown fences.",
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
    "You are SentinelPatch, an elite security engineer that writes correct, minimal patches.",
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
    "Respond with STRICT JSON only — no prose, no markdown fences.",
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
        "You are SentinelPatch, an elite security engineer.",
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
