# GuardianX Engine — multi-runtime Docker image
# Bun (for the HTTP server + sandbox test execution) + Python3 (for PDF + scraper)
#
# Uses Debian-based image (not slim) so bash + curl are available for HEALTHCHECK.

FROM oven/bun:1.3-debian

WORKDIR /app

# ── Install Python3 + system deps (curl already in debian image) ────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a virtualenv so pip installs are isolated and on PATH
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# ── Copy package.json + install Bun deps ─────────────────────────────────────
COPY package.json ./
RUN bun install

# ── Copy Python requirements + install ───────────────────────────────────────
COPY scripts/requirements.txt /tmp/scripts-req.txt
COPY audit-scraper/requirements.txt /tmp/scraper-req.txt
RUN pip install --no-cache-dir -r /tmp/scripts-req.txt -r /tmp/scraper-req.txt

# ── Copy source code ─────────────────────────────────────────────────────────
COPY tsconfig.json ./
COPY index.ts ./
COPY src ./src
COPY scripts ./scripts
COPY audit-scraper ./audit-scraper
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# ── Runtime config ───────────────────────────────────────────────────────────
ENV NODE_ENV=production
# Railway sets PORT automatically — don't hardcode it
EXPOSE 3003

# Health check (curl is installed above)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD curl -f http://localhost:${PORT:-3003}/healthz || exit 1

# Start the engine (startup script generates .z-ai-config from env vars)
CMD ["sh", "./start.sh"]
