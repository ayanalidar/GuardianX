#!/bin/bash
# GuardianX Engine startup script.
# Generates the .z-ai-config file from env vars (if not already present)
# before starting the bun server.

set -e

# ── Generate Z.AI SDK config from env vars ──────────────────────────────────
# The z-ai-web-dev-sdk reads from .z-ai-config in cwd, home, or /etc/.
# On Railway, we pass ZAI_API_KEY and ZAI_BASE_URL as secrets and write
# the config file at startup.
if [ -n "$ZAI_API_KEY" ]; then
  cat > /etc/.z-ai-config << EOF
{
  "baseUrl": "${ZAI_BASE_URL:-https://internal-api.z.ai/v1}",
  "apiKey": "${ZAI_API_KEY}"
}
EOF
  echo "[startup] wrote /etc/.z-ai-config with ZAI_API_KEY from env"
else
  echo "[startup] WARNING: ZAI_API_KEY not set — AI features will fail"
fi

# ── Start the engine ────────────────────────────────────────────────────────
exec bun index.ts
