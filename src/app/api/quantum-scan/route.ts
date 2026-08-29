// POST /api/quantum-scan
//
// Quantum-Readiness Scanner. Regex-scans a codebase's sourceCode for
// cryptographic algorithms vulnerable to quantum attacks:
//   - Shor's algorithm  → breaks RSA, ECC, DH, ECDH (asymmetric)
//   - Grover's algorithm → weakens AES-128 (effectively 64-bit), SHA-1,
//                          SHA-256 (effectively 128-bit), MD5
//
// For each match, extract the file/line (best effort over sourceCode lines),
// the algorithm, severity, and a recommended post-quantum replacement.
// Computes a Quantum Readiness Score: start at 100, subtract by severity
// weight (Critical: -15, High: -8, Medium: -3), clamp to 0-100.
//
// This route is pure regex — no LLM call. Fast.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Severity = "Critical" | "High" | "Medium";

interface CategoryResult {
  algorithms: string[];
  count: number;
  risk: Severity | "Low";
  replacement: string;
}

interface Finding {
  file: string;
  line: number;
  algorithm: string;
  severity: Severity;
  replacement: string;
  snippet: string;
}

interface QuantumScanResponse {
  score: number;
  categories: {
    publicKey: CategoryResult;
    symmetric: CategoryResult;
    hashing: CategoryResult;
    keyExchange: CategoryResult;
  };
  findings: Finding[];
  scannedAt: string;
}

// Pattern catalog — keyed by canonical algorithm name.
interface PatternSpec {
  algorithm: string;
  category: "publicKey" | "symmetric" | "hashing" | "keyExchange";
  severity: Severity;
  replacement: string;
  pattern: RegExp;
}

const PATTERNS: PatternSpec[] = [
  // Public-key crypto (Critical — Shor's breaks these)
  {
    algorithm: "RSA",
    category: "publicKey",
    severity: "Critical",
    replacement: "CRYSTALS-Kyber (key encapsulation) + CRYSTALS-Dilithium (signatures)",
    pattern: /\bRSA\b|\brsa\b|crypto\.generateKeyPair\([^)]*rsa|createSign\([^)]*RSA/i,
  },
  {
    algorithm: "ECC / ECDSA",
    category: "publicKey",
    severity: "Critical",
    replacement: "CRYSTALS-Dilithium (signatures) + CRYSTALS-Kyber (key encapsulation)",
    pattern: /\bECC\b|\bECDSA\b|\bsecp256r1\b|\bsecp384r1\b|\bsecp521r1\b|\bnistp256\b|crypto\.generateKeyPair\([^)]*\bec\b/i,
  },
  // Symmetric crypto (High — Grover's halves security)
  {
    algorithm: "AES-128",
    category: "symmetric",
    severity: "High",
    replacement: "AES-256 (effectively 128-bit post-quantum) or ChaCha20 with 256-bit keys",
    pattern: /AES[\s-_]?128|aes-128|createCipher\w*\([^)]*aes-128|createDecipher\w*\([^)]*aes-128/i,
  },
  // Hashing (High / Medium — Grover's weakens collision resistance)
  {
    algorithm: "SHA-1",
    category: "hashing",
    severity: "High",
    replacement: "SHA-384 or SHA-512 (or SHAKE256 with ≥256-bit output)",
    pattern: /\bSHA-?1\b|createHash\([^)]*sha1/i,
  },
  {
    algorithm: "SHA-256",
    category: "hashing",
    severity: "Medium",
    replacement: "SHA-384 or SHA-512 (256-bit security level post-Grover)",
    pattern: /\bSHA-?256\b|createHash\([^)]*sha256/i,
  },
  {
    algorithm: "MD5",
    category: "hashing",
    severity: "High",
    replacement: "SHA-384 or SHA-512 (MD5 is broken even classically)",
    pattern: /\bMD5\b|createHash\([^)]*md5/i,
  },
  // Key exchange (Medium / Critical — Shor's breaks DH family)
  {
    algorithm: "Diffie-Hellman (DH)",
    category: "keyExchange",
    severity: "Critical",
    replacement: "CRYSTALS-Kyber (post-quantum key encapsulation)",
    pattern: /\bDiffie[\s-]?Hellman\b|\bDH\b|createDiffieHellman\w*\(/i,
  },
  {
    algorithm: "ECDH",
    category: "keyExchange",
    severity: "Critical",
    replacement: "CRYSTALS-Kyber (post-quantum key encapsulation)",
    pattern: /\bECDH\b|crypto\.createECDH\w*\(/i,
  },
];

const SEVERITY_WEIGHT: Record<Severity, number> = {
  Critical: 15,
  High: 8,
  Medium: 3,
};

function scanSource(
  sourceCode: string,
  filename: string,
): { findings: Finding[]; byCategory: Record<PatternSpec["category"], CategoryResult> } {
  const lines = sourceCode.split("\n");
  const findings: Finding[] = [];
  const algoCounts: Record<string, number> = {};
  const algoToCat: Record<string, { category: PatternSpec["category"]; severity: Severity; replacement: string }> = {};

  for (const spec of PATTERNS) {
    algoCounts[spec.algorithm] = 0;
    algoToCat[spec.algorithm] = {
      category: spec.category,
      severity: spec.severity,
      replacement: spec.replacement,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const spec of PATTERNS) {
      // Use exec to find matches — but we only need the first per line per spec
      // to avoid duplicate noise (e.g. RSA mentioned 5x on one line = 1 finding).
      const match = spec.pattern.exec(line);
      if (match) {
        algoCounts[spec.algorithm]++;
        const snippet = line.length > 120 ? line.slice(0, 117) + "..." : line;
        findings.push({
          file: filename,
          line: i + 1,
          algorithm: spec.algorithm,
          severity: spec.severity,
          replacement: spec.replacement,
          snippet: snippet.trim(),
        });
        break; // one finding per line max — avoids double-counting AES-128 + MD5 etc.
      }
    }
  }

  // Build category summaries.
  const empty: CategoryResult = { algorithms: [], count: 0, risk: "Low", replacement: "No post-quantum migration needed." };
  const byCategory: Record<PatternSpec["category"], CategoryResult> = {
    publicKey: { ...empty },
    symmetric: { ...empty },
    hashing: { ...empty },
    keyExchange: { ...empty },
  };

  for (const [algo, count] of Object.entries(algoCounts)) {
    if (count === 0) continue;
    const meta = algoToCat[algo];
    const cat = byCategory[meta.category];
    cat.algorithms.push(algo);
    cat.count += count;
    // Category risk = highest severity among its algorithms.
    if (meta.severity === "Critical") cat.risk = "Critical";
    else if (meta.severity === "High" && cat.risk !== "Critical") cat.risk = "High";
    else if (meta.severity === "Medium" && cat.risk === "Low") cat.risk = "Medium";
    if (cat.replacement === "No post-quantum migration needed.") {
      cat.replacement = meta.replacement;
    } else {
      // Concatenate unique replacements.
      cat.replacement = Array.from(new Set([...cat.replacement.split(" | "), meta.replacement])).join(" | ");
    }
  }

  return { findings, byCategory };
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { codebaseId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const codebaseId = typeof body?.codebaseId === "string" ? body.codebaseId : "";
  if (!codebaseId) {
    return NextResponse.json({ error: "codebaseId required." }, { status: 400 });
  }

  try {
    const codebase = await db.codebase.findUnique({ where: { id: codebaseId } });
    if (!codebase) {
      return NextResponse.json({ error: "Codebase not found." }, { status: 404 });
    }

    const filename = codebase.name || "source.js";
    const { findings, byCategory } = scanSource(codebase.sourceCode, filename);

    // Quantum Readiness Score: 100 - severity-weighted deductions, clamped.
    let score = 100;
    for (const f of findings) {
      score -= SEVERITY_WEIGHT[f.severity];
    }
    score = Math.max(0, Math.min(100, score));

    const response: QuantumScanResponse = {
      score,
      categories: {
        publicKey: byCategory.publicKey,
        symmetric: byCategory.symmetric,
        hashing: byCategory.hashing,
        keyExchange: byCategory.keyExchange,
      },
      findings,
      scannedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[quantum-scan] error:", err);
    return NextResponse.json(
      { error: "Quantum scan failed. " + (err instanceof Error ? err.message : "Unknown error.") },
      { status: 500 },
    );
  }
}
