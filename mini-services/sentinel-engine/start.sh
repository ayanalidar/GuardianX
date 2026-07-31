#!/bin/bash
# GuardianX Engine startup script.
# Generates the .z-ai-config file from env vars before starting the bun server.
#
# Set ZAI_CONFIG on Railway to the full JSON config string, e.g.:
# ZAI_CONFIG='{"baseUrl":"https://internal-api.z.ai/v1","apiKey":"Z.ai","chatId":"chat-xxx","userId":"xxx","token":"eyJxxx"}'

set -e

# ── Generate Z.AI SDK config from env var ───────────────────────────────────
# The z-ai-web-dev-sdk reads from .z-ai-config in cwd, home, or /etc/.
# On Railway, we pass ZAI_CONFIG as a single JSON string secret.
if [ -n "$ZAI_CONFIG" ]; then
  echo "$ZAI_CONFIG" > /etc/.z-ai-config
  echo "[startup] wrote /etc/.z-ai-config from ZAI_CONFIG env var"
elif [ -n "$ZAI_API_KEY" ]; then
  # Fallback: build minimal config from individual vars
  cat > /etc/.z-ai-config << EOF
{
  "baseUrl": "${ZAI_BASE_URL:-https://internal-api.z.ai/v1}",
  "apiKey": "${ZAI_API_KEY}"
}
EOF
  echo "[startup] wrote /etc/.z-ai-config with ZAI_API_KEY from env"
else
  echo "[startup] WARNING: ZAI_CONFIG not set — AI features (SAST, DAST) will fail"
fi

# ── Start the engine ────────────────────────────────────────────────────────
exec bun index.ts
