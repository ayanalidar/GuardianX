#!/bin/sh
# GuardianX Engine startup script.
# Uses /bin/sh (not bash) for maximum compatibility with slim Docker images.
# Generates the .z-ai-config file from env vars before starting the bun server.

set -e

# ── Generate Z.AI SDK config from env var ───────────────────────────────────
if [ -n "$ZAI_CONFIG" ]; then
  printf '%s' "$ZAI_CONFIG" > /etc/.z-ai-config
  echo "[startup] wrote /etc/.z-ai-config from ZAI_CONFIG env var"
elif [ -n "$ZAI_API_KEY" ]; then
  printf '{"baseUrl":"%s","apiKey":"%s"}' \
    "${ZAI_BASE_URL:-https://internal-api.z.ai/v1}" \
    "$ZAI_API_KEY" > /etc/.z-ai-config
  echo "[startup] wrote /etc/.z-ai-config with ZAI_API_KEY from env"
else
  echo "[startup] WARNING: ZAI_CONFIG not set — AI features (SAST, DAST) will fail"
fi

# ── Start the engine ────────────────────────────────────────────────────────
exec bun index.ts
