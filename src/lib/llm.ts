// Universal LLM router — makes the app work outside the Z.ai Code sandbox.
//
// PROBLEM:
//   The z-ai-web-dev-sdk only works inside the Z.ai Code sandbox because
//   `internal-api.z.ai` is not reachable from Vercel's AWS serverless
//   functions. Every route that calls `ZAI.create()` fails on Vercel
//   with "fetch failed" or "Configuration file not found".
//
// SOLUTION:
//   This router picks the best available LLM provider at runtime:
//     1. OPENAI_API_KEY env var → OpenAI Chat Completions (gpt-4o-mini)
//     2. ANTHROPIC_API_KEY env var → Anthropic Messages API (claude-3-5-sonnet)
//     3. OPENROUTER_API_KEY env var → OpenRouter (any model)
//     4. GROQ_API_KEY env var → Groq (llama-3.3-70b, very fast + free tier)
//     5. ZAI_CONFIG env var → Z.AI SDK (only works in the Z.ai sandbox)
//     6. None of the above → returns null (caller uses heuristic fallback)
//
// All providers expose the same interface: `chatCompletion({system, messages})`
// returns `{content}` or throws.
//
// ENV VARS (set ONE of these on Vercel to enable LLM features in prod):
//   OPENAI_API_KEY=sk-...        (recommended — cheapest, most reliable)
//   ANTHROPIC_API_KEY=sk-ant-...
//   OPENROUTER_API_KEY=sk-or-...
//   GROQ_API_KEY=gsk_...         (free tier — 30 req/min, 14000 req/day)
//   ZAI_CONFIG={"baseUrl":"...","apiKey":"..."}  (only in Z.ai sandbox)
//
// See LLM_SETUP.md in the project root for full setup instructions.

import { ensureZaiConfig } from "./zai-config";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: "openai" | "anthropic" | "openrouter" | "groq" | "zai" | "heuristic";
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export type LLMProvider = "openai" | "anthropic" | "openrouter" | "groq" | "zai";

/**
 * Detect which LLM provider is available based on env vars.
 * Returns null if none configured (caller should use heuristic fallback).
 */
export function detectProvider(): LLMProvider | null {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ZAI_CONFIG) return "zai";
  return null;
}

/**
 * Get the configured provider's display name for logging / UI badges.
 */
export function getProviderName(): string {
  const p = detectProvider();
  if (p === "openai") return "OpenAI";
  if (p === "anthropic") return "Anthropic";
  if (p === "openrouter") return "OpenRouter";
  if (p === "groq") return "Groq";
  if (p === "zai") return "Z.AI (sandbox)";
  return "Heuristic (no LLM)";
}

/**
 * Default model per provider. Override via env var (e.g. OPENAI_MODEL).
 */
function getModel(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_MODEL || "gpt-4o-mini";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    case "openrouter":
      return process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
    case "groq":
      return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    case "zai":
      return "glm-4-plus";
  }
}

/**
 * Universal chat completion. Returns {content} or throws.
 *
 * Usage:
 *   import { chatCompletion, detectProvider } from "@/lib/llm";
 *
 *   const provider = detectProvider();
 *   if (!provider) {
 *     // Use heuristic fallback
 *     return heuristicResponse();
 *   }
 *   const result = await chatCompletion({
 *     system: "You are GuardianX...",
 *     messages: [{ role: "user", content: userMessage }],
 *   });
 *   return result.content;
 */
export async function chatCompletion(opts: {
  system?: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<LLMResponse> {
  const provider = detectProvider();
  if (!provider) {
    throw new Error(
      "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, or ZAI_CONFIG env var. Falling back to heuristic."
    );
  }

  const model = getModel(provider);
  const messages: LLMMessage[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];

  switch (provider) {
    case "openai":
      return callOpenAI(messages, model, opts);
    case "anthropic":
      return callAnthropic(messages, model, opts);
    case "openrouter":
      return callOpenRouter(messages, model, opts);
    case "groq":
      return callGroq(messages, model, opts);
    case "zai":
      return callZai(opts.system || "", opts.messages, model);
  }
}

// ── OpenAI ─────────────────────────────────────────────────────────────────
// Uses the official `openai` npm package. Compatible with any OpenAI-API-
// compatible endpoint (Azure OpenAI, Together, Anyscale, etc.) — just set
// OPENAI_BASE_URL to override the default api.openai.com.
async function callOpenAI(
  messages: LLMMessage[],
  model: string,
  opts: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens,
  });
  return {
    content: response.choices[0]?.message?.content || "",
    provider: "openai",
    model,
    usage: response.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
  };
}

// ── Anthropic ──────────────────────────────────────────────────────────────
// Uses the Anthropic Messages API via fetch (no SDK needed — Anthropic has
// a simple REST API). System prompt is a top-level field, not a message.
async function callAnthropic(
  messages: LLMMessage[],
  model: string,
  opts: { system?: string; temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemMsg,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.7,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    content: data.content?.[0]?.text || "",
    provider: "anthropic",
    model,
    usage: data.usage,
  };
}

// ── OpenRouter ─────────────────────────────────────────────────────────────
// OpenRouter is OpenAI-compatible — same API shape, different base URL.
// Supports 100+ models from OpenAI/Anthropic/Google/Meta/Mistral/etc.
async function callOpenRouter(
  messages: LLMMessage[],
  model: string,
  opts: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://guardianx-two.vercel.app",
      "X-Title": "GuardianX",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    provider: "openrouter",
    model,
    usage: data.usage,
  };
}

// ── Groq ───────────────────────────────────────────────────────────────────
// Groq is OpenAI-compatible + has a generous free tier (30 req/min,
// 14000 req/day). Ultra-fast inference (500+ tokens/sec on Llama 3.3 70B).
async function callGroq(
  messages: LLMMessage[],
  model: string,
  opts: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    provider: "groq",
    model,
    usage: data.usage,
  };
}

// ── Z.AI (sandbox-only) ────────────────────────────────────────────────────
// The Z.AI SDK only works inside the Z.ai Code sandbox. Kept for local dev.
async function callZai(
  system: string,
  messages: LLMMessage[],
  model: string
): Promise<LLMResponse> {
  ensureZaiConfig();
  const ZAIModule = await import("z-ai-web-dev-sdk");
  const ZAI = ZAIModule.default;
  const z = await ZAI.create();
  const response = await z.chat.completions.create({
    messages: [
      { role: "system", content: system },
      ...messages,
    ],
    thinking: { type: "disabled" },
  });
  return {
    content: response.choices[0]?.message?.content || "",
    provider: "zai",
    model,
    usage: response.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
  };
}

/**
 * Convenience wrapper: try LLM, fall back to a heuristic if it fails.
 * Returns {content, provider, usedFallback}.
 *
 * Usage:
 *   const result = await chatWithFallback({
 *     system: "You are GuardianX...",
 *     messages: [{ role: "user", content: message }],
 *     fallback: () => "Heuristic response: ...",
 *   });
 *   // result.content, result.provider, result.usedFallback
 */
export async function chatWithFallback(opts: {
  system?: string;
  messages: LLMMessage[];
  fallback: () => string | Promise<string>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; provider: string; usedFallback: boolean; error?: string }> {
  const provider = detectProvider();
  if (!provider) {
    return {
      content: await opts.fallback(),
      provider: "heuristic",
      usedFallback: true,
    };
  }
  try {
    const result = await chatCompletion({
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    return { content: result.content, provider: result.provider, usedFallback: false };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[llm] ${provider} call failed, using heuristic:`, errorMsg);
    return {
      content: await opts.fallback(),
      provider: "heuristic",
      usedFallback: true,
      error: errorMsg,
    };
  }
}

// ── Web search with fallback ──────────────────────────────────────────────
// Tries ZAI web_search (only available in Z.ai sandbox), then falls back to
// an empty array if unavailable. Callers should handle the empty array
// gracefully (show "no results" in the UI).
export async function webSearchWithFallback(
  query: string,
  num: number = 10,
): Promise<Array<{ url: string; name: string; snippet: string; host_name: string; date: string }>> {
  try {
    // Only attempt ZAI web search if ZAI_CONFIG is set — otherwise it will
    // throw and waste latency. On Vercel, ZAI_CONFIG is typically not set
    // (Groq is used for chat instead), so we return empty + let the UI
    // show "no results".
    if (!process.env.ZAI_CONFIG) return [];
    ensureZaiConfig();
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;
    const z = await ZAI.create();
    const results = await z.functions.invoke("web_search", {
      query,
      num,
      recency_days: 30,
    });
    return (results as Array<{ url: string; name: string; snippet: string; host_name: string; date: string }>) || [];
  } catch (err) {
    console.warn("[llm] web_search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
