# LLM Setup — How to enable real AI features on Vercel

## The problem

The GuardianX web app uses the `z-ai-web-dev-sdk` for LLM features (Agent X, Predictive Forecast, Research Agent, Auto-Remediation, WAF rule generation, Virtual Patch). **This SDK only works inside the Z.ai Code sandbox** because it calls `internal-api.z.ai` — a hostname that's not reachable from Vercel's AWS serverless functions.

On Vercel, every Z.AI call fails with one of:
- `fetch failed`
- `Configuration file not found or invalid`
- `API request failed with status 404`

## The solution

A universal LLM router at `src/lib/llm.ts` that picks the best available provider at runtime based on which env var is set. Set **ONE** of these env vars on Vercel and all LLM features light up:

| Env var | Provider | Cost | Speed | Quality |
|---|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI | $0.15 / 1M tokens (gpt-4o-mini) | Fast | Excellent |
| `ANTHROPIC_API_KEY` | Anthropic | $3 / 1M tokens (Claude 3.5 Sonnet) | Fast | Excellent |
| `OPENROUTER_API_KEY` | OpenRouter | varies by model | Fast | varies |
| `GROQ_API_KEY` | Groq | **FREE** (30 req/min, 14k req/day) | Ultra-fast (500 tok/s) | Good (Llama 3.3 70B) |
| `ZAI_CONFIG` | Z.AI (sandbox only) | Free | Fast | Good |

## Recommended: Groq (free tier)

Groq is the fastest LLM inference engine on the planet (500+ tokens/sec on Llama 3.3 70B) and has a generous free tier. This is the cheapest way to get Agent X + Predictive Forecast working on Vercel.

1. **Sign up** at https://console.groq.com
2. **Create an API key** at https://console.groq.com/keys
3. **Add to Vercel**:
   ```bash
   # Via Vercel CLI
   vercel env add GROQ_API_KEY production
   # Paste: gsk_your_key_here
   ```
   Or via the Vercel dashboard: Project Settings → Environment Variables → Add `GROQ_API_KEY` with your key.

4. **Redeploy** — push any commit to `main` to trigger a new Vercel build.

5. **Verify** — call any LLM-using endpoint:
   ```bash
   curl -X POST https://guardianx-two.vercel.app/api/agent-x/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"message":"hello agent x"}'
   ```
   The response will now be LLM-generated (not heuristic).

## Alternative: OpenAI (most reliable)

1. **Sign up** at https://platform.openai.com
2. **Create an API key** at https://platform.openai.com/api-keys (add $5 credit minimum)
3. **Add to Vercel**:
   ```bash
   vercel env add OPENAI_API_KEY production
   # Paste: sk-proj-...
   ```
4. Optional — override the model (default `gpt-4o-mini`):
   ```bash
   vercel env add OPENAI_MODEL production
   # e.g. gpt-4o, gpt-4-turbo, gpt-3.5-turbo
   ```
5. Redeploy + verify (same as above).

## Alternative: Anthropic (best quality)

1. **Sign up** at https://console.anthropic.com
2. **Create an API key** (add $5 credit minimum)
3. **Add to Vercel**:
   ```bash
   vercel env add ANTHROPIC_API_KEY production
   # Paste: sk-ant-...
   ```
4. Optional — override the model (default `claude-3-5-sonnet-20241022`):
   ```bash
   vercel env add ANTHROPIC_MODEL production
   # e.g. claude-3-5-haiku-20241022 (cheaper, faster)
   ```
5. Redeploy + verify.

## Alternative: OpenRouter (100+ models, one key)

1. **Sign up** at https://openrouter.ai
2. **Create an API key** at https://openrouter.ai/keys (add credits)
3. **Add to Vercel**:
   ```bash
   vercel env add OPENROUTER_API_KEY production
   # Paste: sk-or-...
   ```
4. Optional — pick a model (default `anthropic/claude-3.5-sonnet`):
   ```bash
   vercel env add OPENROUTER_MODEL production
   # e.g. openai/gpt-4o-mini, meta-llama/llama-3.3-70b-instruct, google/gemini-flash-1.5
   ```
5. Redeploy + verify.

## Without any LLM (heuristic mode)

If you don't set any of the above env vars, the app still works — every LLM-using endpoint has a heuristic fallback:

- **Agent X chat** — intent parser (regex) + templated responses referencing real DB data
- **Predictive Forecast** — regex-based finding-category scoring (no prose summary)
- **Research Agent** — templated research output
- **Auto-Remediation** — rule-based patch suggestions

This is how the app runs RIGHT NOW on Vercel. Setting any LLM key upgrades the responses to LLM-generated prose.

## How to verify which provider is active

The `/api/agent-x/chat` response includes the provider in a header (if you want to check):

```bash
curl -X POST https://guardianx-two.vercel.app/api/agent-x/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"what provider are you using?"}' -i
```

Or check the Vercel runtime logs for `[llm]` warnings.

## Files using the LLM router

Routes that already use `src/lib/llm.ts` (or should be migrated to it):

- `src/app/api/agent-x/chat/route.ts` — Agent X conversational AI
- `src/app/api/predictive-forecast/route.ts` — Predictive Threat Forecast
- `src/app/api/guardian-chat/route.ts` — Guardian AI assistant (legacy)
- `src/app/api/research-agent/route.ts` — Autonomous Research Agent
- `src/app/api/auto-remediation/route.ts` — Auto-Remediation
- `src/app/api/waf-rules/route.ts` — WAF rule generation
- `src/app/api/virtual-patch/route.ts` — Virtual patch generation
- `src/app/api/public-scan/scan/route.ts` — Public website scanner summary

To migrate an existing Z.AI call to the router:

```ts
// BEFORE (sandbox-only):
import ZAI from "z-ai-web-dev-sdk";
import { ensureZaiConfig } from "@/lib/zai-config";

ensureZaiConfig();
const z = await ZAI.create();
const response = await z.chat.completions.create({
  messages: [{ role: "user", content: message }],
  thinking: { type: "disabled" },
});
const reply = response.choices[0]?.message?.content;

// AFTER (works everywhere):
import { chatWithFallback } from "@/lib/llm";

const result = await chatWithFallback({
  system: "You are GuardianX...",
  messages: [{ role: "user", content: message }],
  fallback: () => heuristicResponse(),
});
const reply = result.content;
```

## Troubleshooting

**"Configuration file not found"** — you're still using `ZAI.create()` directly. Migrate to `chatWithFallback()` from `src/lib/llm.ts`.

**"fetch failed"** — the Z.AI API isn't reachable from your deployment region. Switch to OpenAI/Groq/Anthropic.

**"API request failed with status 401"** — your API key is invalid or expired. Regenerate it.

**"API request failed with status 429"** — rate limit hit. Groq free tier: 30 req/min. OpenAI: depends on your tier. Wait 60s + retry.

**LLM is slow** — Groq is the fastest (500 tok/s). OpenAI gpt-4o-mini is fast (~50 tok/s). Anthropic Claude is fast. OpenRouter adds ~100ms latency.

**Want to test locally?** Create a `.env.local` in `/home/z/GuardianX-web`:
```
OPENAI_API_KEY=sk-...
# or
GROQ_API_KEY=gsk_...
```
Then `bun run dev` — the router will pick up the env var.

## Cost estimates (per 1000 Agent X conversations)

Assuming ~500 tokens per conversation (system prompt + user message + reply):

| Provider | Model | Cost per 1000 convos |
|---|---|---|
| Groq | Llama 3.3 70B | **$0.00** (free tier) |
| OpenAI | gpt-4o-mini | ~$0.08 |
| OpenAI | gpt-4o | ~$1.50 |
| Anthropic | Claude 3.5 Sonnet | ~$2.25 |
| Anthropic | Claude 3.5 Haiku | ~$0.30 |
| OpenRouter | varies | varies |

**Recommendation**: Start with Groq (free). Upgrade to OpenAI gpt-4o-mini if you need better quality. Use Anthropic Claude 3.5 Sonnet for the best quality.
