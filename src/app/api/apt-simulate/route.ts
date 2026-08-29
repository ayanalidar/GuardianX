// POST /api/apt-simulate
//
// APT Persona Engine — an AI role-plays as a specific threat actor group
// (Lazarus, APT29, FIN7, Anonymous Sudan, etc.) and simulates how THEY
// would attack the user's codebase, using their known TTPs, preferred
// vulnerability classes, and tooling.
//
// Body: { codebaseId: string, personaId: string }
// Auth-required (Bearer JWT).
//
// Builds a system prompt: "You are {persona.name}, a {persona.sophistication}
// threat actor group from {persona.origin}. Your known TTPs are
// {persona.ttps}. Your preferred vulnerability classes are
// {persona.preferredVulns}. You're known for {persona.knownFor}. Analyze
// this codebase and tell me how YOU would attack it, step by step, using
// your specific TTPs."
//
// Calls chatWithFallback from @/lib/llm. Returns:
//   { persona, attackPlan: [{step, ttp, target, vulnClass, exploit, likelihood}],
//     summary }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { chatWithFallback } from "@/lib/llm";
import { APT_PERSONAS, getPersonaById, type AptPersona } from "@/lib/apt-personas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AttackStep {
  step: number;
  phase: string;       // recon | initial_access | execution | persistence | exfiltration | impact
  ttp: string;         // "Spear-phishing with malicious Office docs"
  target: string;      // "External email gateway"
  vulnClass: string;   // "Phishing" | "SQLi" | "SSRF" | etc.
  exploit: string;     // 1-2 sentence concrete description
  likelihood: number;  // 0-100
}

interface AptSimulateResponse {
  persona: {
    id: string;
    name: string;
    alias: string;
    origin: string;
    flag: string;
    sophistication: AptPersona["sophistication"];
    color: AptPersona["color"];
    knownFor: string;
  };
  attackPlan: AttackStep[];
  summary: string;
  codebaseName: string;
  generatedAt: string;
  provider: string;
  usedFallback: boolean;
}

// ── JSON extraction (mirrors src/lib/sentinel/engine/ai.ts) ────────────────
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.search(/[[{]/);
  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const last = Math.max(lastBrace, lastBracket);
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ── Heuristic attack-plan generator (fallback when LLM is unavailable) ─────
// Walks the source code looking for the persona's preferred vuln classes
// and builds a plausible 5-step kill chain derived from the persona's TTPs.
// This means the simulator always returns a useful plan, even with no LLM.
const VULN_REGEXES: Array<{ vulnClass: string; pattern: RegExp }> = [
  { vulnClass: "SQLi", pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\b[^;]*\+\s*\w|db\.query\s*\(\s*['"][^'"]*\+\s*\w/i },
  { vulnClass: "XSS", pattern: /\.innerHTML\s*=|document\.write\s*\(|dangerouslySetInnerHTML/i },
  { vulnClass: "SSRF", pattern: /fetch\s*\(\s*req\.|axios\.(?:get|post)\s*\(\s*req\./i },
  { vulnClass: "Path Traversal", pattern: /fs\.read\w*\s*\(\s*req\.|path\.join\s*\([\s\S]*?req\./i },
  { vulnClass: "Command Injection", pattern: /(?:child_process|exec\(|spawn\()/i },
  { vulnClass: "Insecure Deserialization", pattern: /(?:pickle\.loads|unserialize|JSON\.parse)\s*\(\s*req\./i },
  { vulnClass: "Hardcoded Secrets", pattern: /(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { vulnClass: "Weak Crypto", pattern: /createHash\(['"](?:md5|sha1)['"]\)|Math\.random\s*\(\s*\)/i },
  { vulnClass: "Auth Bypass", pattern: /jwt\.verify\([^)]*algorithms[^)]*['"]none['"]/i },
  { vulnClass: "Open Redirect", pattern: /res\.redirect\s*\(\s*req\./i },
  { vulnClass: "Prototype Pollution", pattern: /function\s+merge\s*\([\s\S]*?for\s*\(\s*(?:const|let|var)?\s*\w+\s+in\b/i },
];

function heuristicAttackPlan(persona: AptPersona, sourceCode: string): {
  attackPlan: AttackStep[];
  summary: string;
} {
  // Detect which vuln classes are present in the code.
  const present: string[] = [];
  for (const { vulnClass, pattern } of VULN_REGEXES) {
    if (pattern.test(sourceCode)) present.push(vulnClass);
  }
  // Intersect with persona's preferred vulns (when possible), else use the
  // detected classes directly.
  const personaPrefers = persona.preferredVulns.map((v) => v.toLowerCase());
  const intersection = present.filter((v) =>
    personaPrefers.some((p) => p.toLowerCase().includes(v.toLowerCase()) || v.toLowerCase().includes(p.toLowerCase())),
  );
  const primaryVulns = intersection.length > 0 ? intersection : present;
  // If nothing matched, default to the persona's top 3 preferred vulns.
  const finalVulns = primaryVulns.length > 0 ? primaryVulns.slice(0, 4) : persona.preferredVulns.slice(0, 3);

  const ttpRecon = persona.ttps[0] ?? "Open-source intelligence gathering";
  const ttpInitial = persona.ttps[1] ?? persona.ttps[0] ?? "Spear-phishing";
  const ttpExec = persona.ttps[2] ?? persona.ttps[0] ?? "Living-off-the-land";
  const ttpPersist = persona.ttps[3] ?? persona.ttps[0] ?? "Credential theft";
  const ttpExfil = persona.ttps[4] ?? persona.ttps[0] ?? "Encrypted exfiltration over C2";

  const firstVuln = finalVulns[0] ?? "unspecified";
  const secondVuln = finalVulns[1] ?? firstVuln;
  const thirdVuln = finalVulns[2] ?? firstVuln;

  const attackPlan: AttackStep[] = [
    {
      step: 1,
      phase: "recon",
      ttp: ttpRecon,
      target: "Public-facing assets (GitHub, job posts, tech stack fingerprints)",
      vulnClass: "OSINT",
      exploit: `${persona.name} profiles the target via ${ttpRecon.toLowerCase()} to identify employee emails, deployed frameworks, and exposed endpoints — leveraging their typical reconnaissance playbook.`,
      likelihood: 95,
    },
    {
      step: 2,
      phase: "initial_access",
      ttp: ttpInitial,
      target: "Employee accounts / external-facing app",
      vulnClass: firstVuln,
      exploit: `Using ${ttpInitial.toLowerCase()}, ${persona.name} gains initial access by exploiting ${firstVuln} — a vulnerability class they are known to prefer based on past campaigns.`,
      likelihood: 80,
    },
    {
      step: 3,
      phase: "execution",
      ttp: ttpExec,
      target: "Application runtime / serverless function",
      vulnClass: secondVuln,
      exploit: `Once inside, ${persona.name} executes ${ttpExec.toLowerCase()} to run code in the target context, exploiting ${secondVuln} for code execution and lateral movement.`,
      likelihood: 72,
    },
    {
      step: 4,
      phase: "persistence",
      ttp: ttpPersist,
      target: "Identity provider / OAuth tokens / scheduled tasks",
      vulnClass: thirdVuln,
      exploit: `${persona.name} establishes persistence via ${ttpPersist.toLowerCase()} — stealing long-lived credentials and abusing ${thirdVuln}-class weaknesses in the identity layer to survive reboots and password resets.`,
      likelihood: 68,
    },
    {
      step: 5,
      phase: "exfiltration",
      ttp: ttpExfil,
      target: "Customer data / source code / secrets manager",
      vulnClass: "Excessive Permissions",
      exploit: `Finally, ${persona.name} exfiltrates data via ${ttpExfil.toLowerCase()}, consistent with their ${persona.motivation.toLowerCase()} motivation — as seen in their prior attacks: ${persona.knownFor}.`,
      likelihood: 60,
    },
  ];

  const summary = `If ${persona.name} (${persona.alias}) targeted this codebase, they would likely start with ${ttpRecon.toLowerCase()} to map your attack surface, then exploit ${finalVulns.slice(0, 2).join(" and ")} for initial access — consistent with their known TTPs and ${persona.sophistication} sophistication. Given their motivation (${persona.motivation.toLowerCase()}), the end goal would be ${persona.motivation.toLowerCase().includes("financial") ? "extortion and revenue extraction" : "long-dwell espionage + data exfiltration"}. Their track record (${persona.knownFor}) shows they have the capability to execute every phase of this plan.`;

  return { attackPlan, summary };
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { codebaseId?: string; personaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const codebaseId = typeof body?.codebaseId === "string" ? body.codebaseId : "";
  const personaId = typeof body?.personaId === "string" ? body.personaId : "";
  if (!codebaseId) {
    return NextResponse.json({ error: "codebaseId required." }, { status: 400 });
  }
  if (!personaId) {
    return NextResponse.json({ error: "personaId required." }, { status: 400 });
  }
  const persona = getPersonaById(personaId);
  if (!persona) {
    return NextResponse.json(
      { error: `Unknown personaId "${personaId}". Available: ${APT_PERSONAS.map((p) => p.id).join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const codebase = await db.codebase.findUnique({ where: { id: codebaseId } });
    if (!codebase) {
      return NextResponse.json({ error: "Codebase not found." }, { status: 404 });
    }

    // ── Build the persona prompt ──────────────────────────────────────────
    const system = [
      `You are ${persona.name}, a ${persona.sophistication}-sophistication threat actor group from ${persona.origin}.`,
      `Your aliases: ${persona.alias}.`,
      `Your motivation: ${persona.motivation}.`,
      `Your known TTPs: ${persona.ttps.join("; ")}.`,
      `Your preferred vulnerability classes: ${persona.preferredVulns.join("; ")}.`,
      `You are known for: ${persona.knownFor}.`,
      ``,
      `Analyze the provided codebase the way YOU would attack it — using your specific TTPs and targeting your preferred vulnerability classes.`,
      `Think like your group's lead operator. Walk the kill chain: recon → initial access → execution → persistence → exfiltration.`,
      `For each step, reference one of YOUR actual TTPs and explain how it specifically maps to a weakness in the code.`,
      `Return STRICT JSON only — no prose, no markdown fences.`,
    ].join("\n");

    // Truncate sourceCode to ~12k chars to stay within context limits.
    const truncated = codebase.sourceCode.length > 12000
      ? codebase.sourceCode.slice(0, 12000) + "\n/* ... truncated ... */"
      : codebase.sourceCode;

    const user = [
      `Codebase: ${codebase.name} (language: ${codebase.language})`,
      ``,
      "```" + codebase.language,
      truncated,
      "```",
      ``,
      `Return JSON in this EXACT shape:`,
      `{"summary":"<2-3 sentence prose summary in your persona's voice>","attackPlan":[{"step":1,"phase":"recon|initial_access|execution|persistence|exfiltration|impact","ttp":"<one of YOUR TTPs>","target":"<specific asset in the code>","vulnClass":"<vuln class>","exploit":"<1-2 sentence concrete description>","likelihood":0}]}`,
      `Rules:`,
      `- attackPlan must contain 5-7 steps covering recon → initial_access → execution → persistence → exfiltration.`,
      `- Each step.ttp MUST be one of YOUR actual TTPs from the list above.`,
      `- Each step.vulnClass should map to one of YOUR preferred vulnerability classes when possible.`,
      `- step.likelihood is 0-100 (your confidence this step succeeds against THIS codebase).`,
      `- summary should be 2-3 sentences in your persona's voice, e.g. "We would begin by..."`,
      `- No markdown fences. No prose outside the JSON.`,
    ].join("\n");

    const result = await chatWithFallback({
      system,
      messages: [{ role: "user", content: user }],
      fallback: () => "", // empty = use heuristic
      temperature: 0.6,
      maxTokens: 1800,
    });

    let attackPlan: AttackStep[] = [];
    let summary = "";
    let usedFallback = result.usedFallback;

    if (result.content && result.content.trim() !== "") {
      try {
        const parsed = JSON.parse(extractJson(result.content)) as {
          summary?: string;
          attackPlan?: Array<Partial<AttackStep>>;
        };
        if (Array.isArray(parsed.attackPlan) && parsed.attackPlan.length > 0) {
          attackPlan = parsed.attackPlan.slice(0, 8).map((p, i) => ({
            step: typeof p.step === "number" ? p.step : i + 1,
            phase: typeof p.phase === "string" ? p.phase.slice(0, 40) : "execution",
            ttp: typeof p.ttp === "string" ? p.ttp.slice(0, 240) : (persona.ttps[i % persona.ttps.length] ?? "Unknown"),
            target: typeof p.target === "string" ? p.target.slice(0, 200) : "unspecified",
            vulnClass: typeof p.vulnClass === "string" ? p.vulnClass.slice(0, 80) : "unspecified",
            exploit: typeof p.exploit === "string" ? p.exploit.slice(0, 600) : "Unspecified exploitation technique.",
            likelihood: clamp(Number(p.likelihood) || 50, 0, 100),
          }));
        }
        if (typeof parsed.summary === "string") {
          summary = parsed.summary.slice(0, 1200);
        }
      } catch {
        // Fall through to heuristic.
      }
    }

    // If LLM didn't produce a usable plan, use the heuristic generator.
    if (attackPlan.length === 0 || summary === "") {
      const heuristic = heuristicAttackPlan(persona, codebase.sourceCode);
      if (attackPlan.length === 0) attackPlan = heuristic.attackPlan;
      if (summary === "") summary = heuristic.summary;
      usedFallback = true;
    }

    const response: AptSimulateResponse = {
      persona: {
        id: persona.id,
        name: persona.name,
        alias: persona.alias,
        origin: persona.origin,
        flag: persona.flag,
        sophistication: persona.sophistication,
        color: persona.color,
        knownFor: persona.knownFor,
      },
      attackPlan,
      summary,
      codebaseName: codebase.name,
      generatedAt: new Date().toISOString(),
      provider: result.provider,
      usedFallback,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[apt-simulate] error:", err);
    return NextResponse.json(
      { error: "APT simulation failed. " + (err instanceof Error ? err.message : "Unknown error.") },
      { status: 500 },
    );
  }
}
