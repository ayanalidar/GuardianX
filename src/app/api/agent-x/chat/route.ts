// Agent X — Chat Route
// ─────────────────────────────────────────────────────────────────────────
// POST /api/agent-x/chat
//
// Auth required. The main conversational endpoint: takes a user message,
// parses the intent, gathers platform state, optionally calls the LLM
// (with a sophisticated heuristic fallback), and returns a structured
// reply with optional `actions` the frontend can execute (navigate,
// scan, approve, search, war_room).
//
// Body: { message: string, context?: { currentTab?: string, history?: {role, content}[] } }
// Returns: { reply, actions, suggestions, intent, context }

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";
import {
  GENESIS_PREV_HASH,
  computeAttestationHash,
} from "@/lib/sentinel/attestation";
import { onUserMessage, onAssistantReply, onPatchApproved } from "@/lib/memory-vault/memory-writer";
import {
  parseIntent,
  buildKnowledgeContext,
  resolveTab,
  findSecurityTopic,
  getTimeOfDay,
  greetingPrefix,
  TABS,
  type ParsedIntent,
  type TimeOfDay,
} from "@/lib/agent-x/knowledge";
import { gatherPlatformState, relativeTime, type PlatformState } from "@/lib/agent-x/state";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Response shape ──────────────────────────────────────────────────────

interface AgentAction {
  type: "navigate" | "scan" | "approve" | "search" | "war_room" | "status";
  target?: string;
  query?: string;
}

interface ChatResponse {
  reply: string;
  actions: AgentAction[];
  suggestions: string[];
  intent: ParsedIntent["intent"];
  context: {
    postureScore: number;
    postureGrade: string;
    pendingPatches: number;
    pendingCritical: number;
    criticalFindings: number;
    activeScans: number;
  };
}

// ─── LLM enhancement layer (try first, fall back to heuristic) ───────────

interface LLMHistoryTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

async function llmChat(
  systemPrompt: string,
  message: string,
  history: LLMHistoryTurn[],
): Promise<string | null> {
  try {
    // Use the universal LLM router — works with OpenAI / Anthropic / Groq /
    // OpenRouter / Z.AI (sandbox). Falls back to null on any failure, which
    // the caller handles by using the heuristic response generator.
    const { chatWithFallback } = await import("@/lib/llm");
    const result = await chatWithFallback({
      system: systemPrompt,
      messages: [
        ...history.slice(-6).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: message },
      ],
      fallback: () => "", // empty string signals "use heuristic" to the caller
    });
    const text = result.content;
    return text && text.trim().length > 0 ? text.trim() : null;
  } catch (err) {
    console.warn("[agent-x] LLM call failed, using heuristic:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── POST handler ────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId } = auth.user;

  const body = await req.json().catch(() => ({})) as {
    message?: string;
    context?: { currentTab?: string; history?: LLMHistoryTurn[] };
  };

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "message required" },
      { status: 400 },
    );
  }

  // Persist the user message as a memory (fire-and-forget).
  onUserMessage(userId, message);

  // ── Gather platform state in parallel with intent parsing ──────────────
  const [state, intent] = await Promise.all([
    gatherPlatformState(userId),
    Promise.resolve(parseIntent(message)),
  ]);

  // ── Build the heuristic reply + actions first (so the LLM, if it works,
  //    can override only the prose; the actions always come from the parser) ─
  const heuristic = buildHeuristicReply(intent, state, body.context?.currentTab);

  // ── Try LLM enhancement only for `unknown` + `explain` intents where the
  //    LLM genuinely adds value. For intents like `greet`, `navigate`,
  //    `scan`, `approve`, `status`, `suggest`, `search`, `war_room`, the
  //    heuristic is already excellent + the user wants a fast response with
  //    real actions attached. ─────────────────────────────────────────────
  let reply = heuristic.reply;
  if (intent.intent === "unknown" || intent.intent === "explain") {
    const systemPrompt = buildLLMSystemPrompt(state, body.context?.currentTab);
    const llmReply = await llmChat(systemPrompt, message, body.context?.history ?? []);
    if (llmReply) {
      // Use LLM prose but keep the heuristic actions (the LLM doesn't
      // emit reliable action JSON).
      reply = llmReply;
    }
  }

  // Persist the assistant reply (fire-and-forget).
  onAssistantReply(userId, reply);

  // ── Execute side-effects for actionable intents ─────────────────────────
  // For `scan` and `approve`, we actually kick off the work server-side
  // (so the action survives a page refresh + writes the same DB rows as
  // the keyboard-driven UI). For `navigate` and `search`, the frontend
  // handles the action locally — we just return the action object.
  const actions: AgentAction[] = [...heuristic.actions];
  if (intent.intent === "scan" && intent.target) {
    const scanResult = await maybeStartScan(intent.target);
    if (scanResult.started) {
      // Augment the reply with the actual scan outcome.
      reply = `${reply}\n\n${scanResult.message}`;
    } else if (scanResult.message) {
      reply = `${reply}\n\n${scanResult.message}`;
    }
  } else if (intent.intent === "approve" && intent.target) {
    const approveResult = await maybeApprovePatch(userId, intent.target);
    if (approveResult.message) {
      reply = `${reply}\n\n${approveResult.message}`;
    }
  }

  const response: ChatResponse = {
    reply: reply.trim(),
    actions,
    suggestions: heuristic.suggestions,
    intent: intent.intent,
    context: {
      postureScore: state.postureScore,
      postureGrade: state.postureGrade,
      pendingPatches: state.pendingPatchCount,
      pendingCritical: state.pendingCriticalCount,
      criticalFindings: state.criticalFindingCount,
      activeScans: state.activeScanCount,
    },
  };

  return NextResponse.json(response);
}

// ─── Heuristic reply builder ─────────────────────────────────────────────
//
// This is the critical piece. It must produce genuinely useful,
// conversational, data-driven responses WITHOUT an LLM.

interface HeuristicResult {
  reply: string;
  actions: AgentAction[];
  suggestions: string[];
}

function buildHeuristicReply(
  intent: ParsedIntent,
  state: PlatformState,
  currentTab?: string,
): HeuristicResult {
  const name = state.user?.name?.split(" ")[0] ?? "there";
  const tod: TimeOfDay = getTimeOfDay();

  switch (intent.intent) {
    case "greet": {
      const parts: string[] = [`${greetingPrefix(tod)}, ${name}.`];
      if (state.lastLoginAt) {
        const days = Math.floor((Date.now() - state.lastLoginAt.getTime()) / 86_400_000);
        if (days >= 1) parts.push(`Welcome back — it's been ${days} ${days === 1 ? "day" : "days"} since your last visit.`);
      }
      if (state.pendingPatchCount > 0) {
        parts.push(
          state.pendingCriticalCount > 0
            ? `You have ${state.pendingPatchCount} pending patches (${state.pendingCriticalCount} critical). The most urgent is "${state.topPatch?.title ?? "—"}" in ${state.topPatch?.codebaseName ?? "—"}.`
            : `You have ${state.pendingPatchCount} pending patches waiting for review.`
        );
      } else {
        parts.push("Your patch queue is clear — no pending patches right now.");
      }
      if (state.criticalFindingCount > 0) {
        parts.push(`${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding needs" : "findings need"} attention.`);
      }
      parts.push("Would you like me to brief you on your security posture?");
      return {
        reply: parts.join(" "),
        actions: [],
        suggestions: [
          "What's our security posture?",
          "Show me pending patches",
          "Suggest what to do next",
        ],
      };
    }

    case "navigate": {
      const target = intent.target ?? "";
      const tabKey = resolveTab(target) ?? target;
      const tab = TABS.find((t) => t.key === tabKey);
      const label = tab?.label ?? target;
      const reply = tab
        ? `Taking you to ${label}. ${tab.canDo}`
        : `Taking you to ${target}. Let me know what you'd like to do there.`;
      return {
        reply,
        actions: [{ type: "navigate", target: tabKey }],
        suggestions: buildNavigateSuggestions(tabKey, state),
      };
    }

    case "scan": {
      const target = intent.target ?? "";
      if (!target) {
        return {
          reply: `Which codebase would you like me to scan, ${name}? You have ${state.codebaseCount} codebases${state.codebaseWithMostFindings ? ` — ${state.codebaseWithMostFindings.name} has the most findings (${state.codebaseWithMostFindings.findingCount})` : ""}.`,
          actions: [],
          suggestions: [
            state.codebaseWithMostFindings ? `Scan ${state.codebaseWithMostFindings.name}` : "Show me codebases",
            "What's our security posture?",
          ],
        };
      }
      return {
        reply: `I'll start a SAST scan on "${target}". Looking it up now…`,
        actions: [{ type: "scan", target }],
        suggestions: [
          "What's our security posture?",
          "Show me pending patches",
        ],
      };
    }

    case "approve": {
      const target = intent.target ?? "";
      if (!target || target === "all") {
        if (target === "all") {
          return {
            reply: state.pendingPatchCount > 0
              ? `You have ${state.pendingPatchCount} pending patches. For safety, I can only approve them one at a time — but I'll show you the queue. Approve the critical ones first (${state.pendingCriticalCount} critical, ${state.pendingHighCount} high).`
              : `Your patch queue is empty — nothing to approve.`,
            actions: [{ type: "navigate", target: "patches" }],
            suggestions: [
              state.topPatch ? `Approve patch ${state.topPatch.patchId}` : "Show me patches",
              "What's our security posture?",
            ],
          };
        }
        return {
          reply: `Which patch would you like me to approve, ${name}? You have ${state.pendingPatchCount} pending${state.topPatch ? ` — the most urgent is ${state.topPatch.patchId} (${state.topPatch.severity}, "${state.topPatch.title.slice(0, 60)}")` : ""}.`,
          actions: [{ type: "navigate", target: "patches" }],
          suggestions: [
            state.topPatch ? `Approve patch ${state.topPatch.patchId}` : "Show me patches",
            "What's our security posture?",
          ],
        };
      }
      if (target === "last") {
        if (!state.topPatch) {
          return {
            reply: "There's no pending patch to approve — your queue is empty.",
            actions: [{ type: "navigate", target: "patches" }],
            suggestions: ["Show me codebases", "What's our security posture?"],
          };
        }
        return {
          reply: `Approving the most urgent pending patch — ${state.topPatch.patchId} (${state.topPatch.severity}, "${state.topPatch.title}") in ${state.topPatch.codebaseName}.`,
          actions: [{ type: "approve", target: state.topPatch.patchId }],
          suggestions: ["Show me patches", "What's our security posture?"],
        };
      }
      return {
        reply: `Approving patch ${target}. Verifying it's pending and signing off with a cryptographic attestation…`,
        actions: [{ type: "approve", target }],
        suggestions: ["Show me patches", "What's our security posture?"],
      };
    }

    case "status": {
      const grade = state.postureGrade;
      const score = state.postureScore;
      const verdict =
        score >= 90 ? "excellent — you're in great shape"
        : score >= 75 ? "healthy — minor cleanup needed"
        : score >= 60 ? "fair — several pending issues to address"
        : score >= 40 ? "weak — significant work required"
        : "critical — immediate action needed";
      const parts: string[] = [
        `${name}, your security posture is ${verdict}. Score: ${score}/100 (grade ${grade}).`,
        `Across ${state.clientCount} ${state.clientCount === 1 ? "client" : "clients"} and ${state.codebaseCount} ${state.codebaseCount === 1 ? "codebase" : "codebases"}:`,
      ];
      if (state.pendingPatchCount > 0) {
        parts.push(
          `• ${state.pendingPatchCount} pending patches (${state.pendingCriticalCount} critical, ${state.pendingHighCount} high).`
        );
      }
      if (state.criticalFindingCount > 0) {
        parts.push(
          `• ${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding" : "findings"} from DAST engagements.`
        );
      }
      if (state.activeScanCount > 0) {
        parts.push(`• ${state.activeScanCount} ${state.activeScanCount === 1 ? "scan is" : "scans are"} currently running.`);
      }
      if (state.topPatch) {
        parts.push(`Top priority: approve ${state.topPatch.patchId} — ${state.topPatch.title} in ${state.topPatch.codebaseName}.`);
      } else if (state.topFinding) {
        parts.push(`Top finding: ${state.topFinding.title} on ${state.topFinding.targetName}.`);
      }
      return {
        reply: parts.join(" "),
        actions: [],
        suggestions: [
          state.topPatch ? `Approve patch ${state.topPatch.patchId}` : "Show me patches",
          "Suggest what to do next",
          state.codebaseWithMostFindings ? `Scan ${state.codebaseWithMostFindings.name}` : "Show me codebases",
        ],
      };
    }

    case "explain": {
      const topic = intent.target ?? "";
      const found = findSecurityTopic(topic);
      if (found) {
        return {
          reply: `${found.title}${found.cwe ? ` (${found.cwe})` : ""}: ${found.explanation}\n\nRemediation: ${found.remediation}`,
          actions: [],
          suggestions: [
            "Show me patches",
            "Search findings for sqli",
            "What's our security posture?",
          ],
        };
      }
      // Try tab explanation instead — maybe they said "explain the patches tab".
      const tabKey = resolveTab(topic);
      if (tabKey) {
        const tab = TABS.find((t) => t.key === tabKey);
        if (tab) {
          return {
            reply: `${tab.label}: ${tab.description} ${tab.canDo}`,
            actions: [{ type: "navigate", target: tabKey }],
            suggestions: [
              `Take me to ${tab.label}`,
              "What's our security posture?",
              "Help",
            ],
          };
        }
      }
      // Generic fallback — sound knowledgeable + offer to search findings.
      return {
        reply: `I can explain that, ${name}. Quick summary: ${topic} is a security concept relevant to your platform. Want me to search your findings for related issues, or navigate to a specific tab?`,
        actions: [],
        suggestions: [
          `Search findings for ${topic.slice(0, 30)}`,
          "Explain SQL injection",
          "Explain XSS",
        ],
      };
    }

    case "suggest": {
      const recs: string[] = [];
      if (state.pendingCriticalCount > 0 && state.topPatch) {
        recs.push(`Approve the ${state.pendingCriticalCount} critical ${state.pendingCriticalCount === 1 ? "patch" : "patches"} pending — top is ${state.topPatch.patchId} (${state.topPatch.title.slice(0, 60)}…) in ${state.topPatch.codebaseName}.`);
      } else if (state.pendingPatchCount > 0 && state.topPatch) {
        recs.push(`Approve ${state.pendingPatchCount} pending ${state.pendingPatchCount === 1 ? "patch" : "patches"} — top is ${state.topPatch.patchId}.`);
      }
      if (state.codebaseWithMostFindings) {
        recs.push(`Run a fresh scan on ${state.codebaseWithMostFindings.name} — it has ${state.codebaseWithMostFindings.findingCount} ${state.codebaseWithMostFindings.findingCount === 1 ? "finding" : "findings"}, the most of any codebase.`);
      } else if (state.codebaseCount === 0) {
        recs.push("Add your first codebase so I can start scanning for vulnerabilities.");
      }
      if (state.criticalFindingCount > 0 && state.topFinding) {
        recs.push(`Review the ${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding" : "findings"} from DAST — top is "${state.topFinding.title}" on ${state.topFinding.targetName}.`);
      }
      if (state.postureScore < 70 && state.postureScore > 0) {
        recs.push(`Your posture score is ${state.postureScore}/100 — focus on closing critical findings to push it above 75.`);
      } else if (state.postureScore >= 90) {
        recs.push(`Posture is strong (${state.postureScore}/100) — consider running an adversarial DAST engagement to test runtime defenses.`);
      }
      if (recs.length === 0) {
        recs.push("Everything looks clean. Add a new codebase or start a DAST engagement against an authorized target.");
      }
      return {
        reply: `Based on your current state, ${name}, here's what I recommend:\n${recs.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
        actions: [],
        suggestions: [
          state.topPatch ? `Approve patch ${state.topPatch.patchId}` : "Show me patches",
          state.codebaseWithMostFindings ? `Scan ${state.codebaseWithMostFindings.name}` : "Show me codebases",
          "What's our security posture?",
        ],
      };
    }

    case "search": {
      const query = intent.query ?? "";
      if (!query) {
        return {
          reply: `What would you like me to search findings for, ${name}? Try "search findings for sqli" or "find critical vulnerabilities".`,
          actions: [],
          suggestions: ["Find critical findings", "Find high findings", "Search findings for xss"],
        };
      }
      return {
        reply: `Searching your findings for "${query}" across titles, categories, and endpoints…`,
        actions: [{ type: "search", query }],
        suggestions: [
          "What's our security posture?",
          "Show me patches",
          "Explain SQL injection",
        ],
      };
    }

    case "war_room": {
      return {
        reply: `Opening the War Room, ${name}. Gesture control + voice command are armed — say "scan <codebase>" or "approve patch <id>" hands-free. Pinch to click, swipe to navigate tabs, open palm to scroll.`,
        actions: [{ type: "war_room" }],
        suggestions: [
          "What's our security posture?",
          "Show me pending patches",
          "Activate gesture control",
        ],
      };
    }

    case "help": {
      return {
        reply: [
          `I'm Agent X, ${name} — your autonomous security operations assistant. I have full knowledge of every GuardianX module and tab, and I can act on real platform data.`,
          "",
          "Here's what I can do:",
          "• Navigate to any tab — try \"show me patches\", \"open the quantum scanner\", or \"go to billing\"",
          "• Start a SAST scan — \"scan payment-handler.js\" or \"scan the auth codebase\"",
          "• Approve patches — \"approve patch SP-2026-001\" or \"approve the last patch\"",
          "• Search findings — \"find critical vulnerabilities\" or \"search findings for sqli\"",
          "• Brief you on security posture — \"what's our security posture?\" or \"status report\"",
          "• Explain vulnerabilities — \"explain SQL injection\" or \"what is XSS?\"",
          "• Recommend next steps — \"what should I do next?\" or \"suggest what to prioritize\"",
          "• Open the War Room — \"open war room\" or \"activate gesture control\"",
          "",
          `Right now you have ${state.pendingPatchCount} pending patches and ${state.criticalFindingCount} critical findings. Your posture score is ${state.postureScore}/100.`,
        ].join("\n"),
        actions: [],
        suggestions: [
          "What's our security posture?",
          state.topPatch ? `Approve patch ${state.topPatch.patchId}` : "Show me patches",
          "Suggest what to do next",
        ],
      };
    }

    case "unknown":
    default: {
      // The LLM might handle this; if not, we offer a useful fallback.
      return {
        reply: `I didn't catch that, ${name}. I can navigate to any tab, start scans, approve patches, search findings, explain vulnerabilities, or give you a status report. What would you like to do?`,
        actions: [],
        suggestions: [
          "What's our security posture?",
          "Show me pending patches",
          "Help",
        ],
      };
    }
  }
}

// ─── Tab-specific suggestions after a navigate action ─────────────────────

function buildNavigateSuggestions(tabKey: string, state: PlatformState): string[] {
  switch (tabKey) {
    case "dashboard":
      return ["What's our security posture?", "Suggest what to do next", "Show me pending patches"];
    case "patches":
      return state.topPatch
        ? [`Approve patch ${state.topPatch.patchId}`, "What's our security posture?", "Show me codebases"]
        : ["Show me codebases", "What's our security posture?", "Help"];
    case "codebases":
      return state.codebaseWithMostFindings
        ? [`Scan ${state.codebaseWithMostFindings.name}`, "What's our security posture?", "Show me patches"]
        : ["What's our security posture?", "Show me patches", "Help"];
    case "redagent":
      return ["What's our security posture?", "Show me pending patches", "Explain SQL injection"];
    case "forecast":
      return ["What's our security posture?", "Suggest what to do next", "Show me patches"];
    case "quantum":
      return ["What's our security posture?", "Show me codebases", "Help"];
    case "constellation":
      return ["What's our security posture?", "Show me pending patches", "Show me codebases"];
    case "compliance":
      return ["What's our security posture?", "Show me patches", "Help"];
    case "dfir":
      return ["What's our security posture?", "Show me pending patches", "Help"];
    default:
      return ["What's our security posture?", "Show me pending patches", "Help"];
  }
}

// ─── Side-effect: actually start a scan (mirrors /api/voice-command) ──────

interface ScanResult {
  started: boolean;
  message: string;
}

async function maybeStartScan(target: string): Promise<ScanResult> {
  try {
    const codebases = await db.codebase.findMany({
      select: { id: true, name: true, language: true },
    });
    const lq = target.toLowerCase();
    const match = codebases.find((c) => c.name.toLowerCase().includes(lq));
    if (!match) {
      return {
        started: false,
        message: `I couldn't find a codebase matching "${target}". You have ${codebases.length} codebases — try the Codebases tab to see the full list.`,
      };
    }

    // Prevent concurrent scans on the same codebase.
    const running = await db.scan.findFirst({
      where: {
        codebaseId: match.id,
        status: { in: ["queued", "analyzing", "patching", "sandboxing", "running"] },
      },
      orderBy: { startedAt: "desc" },
    });
    if (running) {
      return {
        started: false,
        message: `A scan is already running on ${match.name} (started ${relativeTime(running.startedAt)}). I'll let you know when it completes.`,
      };
    }

    const scan = await db.scan.create({
      data: {
        codebaseId: match.id,
        status: "queued",
        stageLabel: "Queued by Agent X…",
      },
    });

    engineFireAndForget("/api/run-sast", { codebaseId: match.id, scanId: scan.id });

    return {
      started: true,
      message: `Scan started on ${match.name} (scan ID ${scan.id}). I'll surface the findings as they come in.`,
    };
  } catch (err) {
    return {
      started: false,
      message: `I hit an error starting the scan: ${err instanceof Error ? err.message : "unknown error"}. Try the Codebases tab to start it manually.`,
    };
  }
}

// ─── Side-effect: actually approve a patch (mirrors /api/patches/[id]/approve) ──

interface ApproveResult {
  message: string;
}

async function maybeApprovePatch(userId: string, target: string): Promise<ApproveResult> {
  try {
    // "last" → top pending patch
    let patch = null;
    if (target === "last") {
      patch = await db.patch.findFirst({
        where: { status: "pending" },
        include: { codebase: { select: { name: true } } },
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      });
      if (!patch) {
        return { message: "There's no pending patch to approve — your queue is empty." };
      }
    } else {
      patch = await db.patch.findFirst({
        where: { OR: [{ patchId: target }, { id: target }] },
        include: { codebase: { select: { name: true } } },
      });
      if (!patch) {
        return {
          message: `I couldn't find patch "${target}". Check the Patch Queue tab for the right ID.`,
        };
      }
      if (patch.status !== "pending") {
        return {
          message: `Patch ${patch.patchId} is already ${patch.status} — no action needed.`,
        };
      }
    }

    const updated = await db.patch.update({
      where: { id: patch.id },
      data: { status: "approved", approvedAt: new Date() },
    });

    // Apply the patched source to the codebase.
    if (patch.patchedCode) {
      await db.codebase.update({
        where: { id: patch.codebaseId },
        data: { sourceCode: patch.patchedCode },
      });
    }

    // Append to the tamper-evident attestation chain.
    const latestAtt = await db.attestation.findFirst({ orderBy: { createdAt: "desc" } });
    const prevHash = (latestAtt?.hash as string | undefined) ?? GENESIS_PREV_HASH;
    const approvedAt = (updated.approvedAt as Date).toISOString();
    const patchedCodeHash = createHash("sha256")
      .update((patch.patchedCode as string) || "")
      .digest("hex");
    const data = JSON.stringify({
      patchId: patch.patchId,
      codebase: (patch.codebase as { name: string } | null)?.name,
      title: patch.title,
      severity: patch.severity,
      cve: patch.cve ?? null,
      affectedFile: patch.affectedFile,
      approvedAt,
      patchedCodeHash,
      schemaVersion: 1,
    });
    const hash = computeAttestationHash(prevHash, patch.id as string, patchedCodeHash, approvedAt);
    const att = await db.attestation.create({
      data: { patchId: patch.id, prevHash, hash, data },
    });

    // Memory vault: fire-and-forget.
    try {
      onPatchApproved(userId, {
        id: patch.id as string,
        patchId: patch.patchId as string,
        title: patch.title as string,
        severity: patch.severity as string,
        affectedFile: patch.affectedFile as string | undefined,
        status: "approved",
        approvedAt: updated.approvedAt as Date,
      });
    } catch {
      /* swallow */
    }

    return {
      message: `Patch ${updated.patchId} approved. Source updated on ${(patch.codebase as { name: string } | null)?.name ?? "the codebase"} and a cryptographic attestation was added to the ledger (hash ${att.hash.slice(0, 12)}…).`,
    };
  } catch (err) {
    return {
      message: `I hit an error approving that patch: ${err instanceof Error ? err.message : "unknown error"}. Try the Patch Queue tab to approve manually.`,
    };
  }
}

// ─── LLM system prompt builder ────────────────────────────────────────────

function buildLLMSystemPrompt(state: PlatformState, currentTab?: string): string {
  const knowledge = buildKnowledgeContext();
  const features = state.pendingPatches.slice(0, 3).map(
    (p) => `  • ${p.patchId} [${p.severity}] ${p.title} (in ${p.codebaseName}, file ${p.affectedFile})`,
  ).join("\n");
  const findings = state.recentFindings.slice(0, 3).map(
    (f) => `  • [${f.severity}] ${f.title} on ${f.endpoint} (${f.targetName})`,
  ).join("\n");

  return [
    knowledge,
    "",
    "CURRENT PLATFORM STATE (use this real data to ground your answer):",
    `- User: ${state.user?.name ?? "unknown"} (${state.user?.email ?? "unknown"}) — role: ${state.user?.role ?? "viewer"}`,
    `- Posture score: ${state.postureScore}/100 (grade ${state.postureGrade})`,
    `- Clients: ${state.clientCount}, Codebases: ${state.codebaseCount}`,
    `- Pending patches: ${state.pendingPatchCount} (${state.pendingCriticalCount} critical, ${state.pendingHighCount} high)`,
    `- Critical findings: ${state.criticalFindingCount}`,
    `- Active scans: ${state.activeScanCount}`,
    currentTab ? `- Current tab: ${currentTab}` : "",
    state.topPatch ? `- Top priority patch: ${state.topPatch.patchId} — "${state.topPatch.title}" in ${state.topPatch.codebaseName}` : "",
    state.topFinding ? `- Top finding: ${state.topFinding.title} on ${state.topFinding.targetName}` : "",
    state.lastLoginAt ? `- Last login: ${relativeTime(state.lastLoginAt)}` : "",
    "",
    "Top 3 pending patches:",
    features || "  (none)",
    "",
    "Recent findings:",
    findings || "  (none)",
    "",
    "ANSWER RULES:",
    "- Always reference the real data above. Never invent IDs, names, or counts.",
    "- If the user asks about something outside your knowledge, offer to navigate to a relevant tab.",
    "- Never say 'I don't have access to that' — always either answer or offer to take the user to the right place.",
    "- Keep your reply under 4 sentences unless the user explicitly asks for detail.",
    "- Use the user's first name (" + (state.user?.name?.split(" ")[0] ?? "there") + ") sparingly, naturally.",
  ].filter(Boolean).join("\n");
}
