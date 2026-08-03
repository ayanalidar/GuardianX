# GuardianX recon-tools — Docker image
#
# Wraps nmap, ffuf, sqlmap, nuclei behind a Bun HTTP server on port 3004.
# Base: ubuntu:22.04 (smaller than Kali, has all 4 tools in apt — except
# nuclei, which we install from the official GitHub release).
#
# Build:
#   docker build -t guardianx-recon-tools:latest \
#     -f mini-services/recon-tools/Dockerfile mini-services/recon-tools
#
# Run (note: many tools require root or CAP_NET_RAW for some scan types;
# we run as non-root for safety. nmap -sS SYN scan needs privileges —
# service scans (-sV -sC) and connect() scans work fine unprivileged):
#   docker run --rm -p 3004:3004 guardianx-recon-tools:latest
#
# Or with an X-Engine-Key for auth:
#   docker run --rm -p 3004:3004 -e RECON_TOOLS_KEY=secret \
#     guardianx-recon-tools:latest

FROM ubuntu:22.04

# Avoid apt interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# ── System packages: tools + wordlists + bun prerequisites ────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    git \
    nmap \
    ffuf \
    sqlmap \
    dirb \
    wordlists \
    seclists \
    && rm -rf /var/lib/apt/lists/*

# ── Install Bun ────────────────────────────────────────────────────────────────
# Install bun via the official install script. We pin to v1.3.x for stability.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.0" \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# ── Install nuclei ────────────────────────────────────────────────────────────
# nuclei is not in ubuntu:22.04 apt repos — install from GitHub releases.
# We pin to a known-good version. The release tarball contains a single
# static binary that we drop into /usr/local/bin.
ARG NUCLEI_VERSION=v3.3.7
RUN curl -fsSL -o /tmp/nuclei.zip \
      "https://github.com/projectdiscovery/nuclei/releases/download/${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION#v}_linux_amd64.zip" \
    && unzip -o /tmp/nuclei.zip -d /tmp/nuclei \
    && mv /tmp/nuclei/nuclei /usr/local/bin/nuclei \
    && chmod +x /usr/local/bin/nuclei \
    && rm -rf /tmp/nuclei /tmp/nuclei.zip

# ── Create non-root user ──────────────────────────────────────────────────────
RUN useradd --create-home --shell /bin/bash --uid 1001 recon

# ── App directory ─────────────────────────────────────────────────────────────
WORKDIR /app

# Copy package.json + install deps (none expected, but keep bun.lock if present)
COPY --chown=recon:recon package.json ./
RUN bun install --frozen-lockfile || bun install

# Pre-create nuclei config dir + download templates during build (so first
# request isn't slow). Templates go into the recon user's home dir.
USER recon
RUN mkdir -p /home/recon/.config/nuclei \
    && nuclei -update-templates 2>&1 | tail -5 \
    || echo "[build] nuclei template download skipped (network unavailable)"

USER root
# Make sure wordlists are readable by the recon user
RUN chmod -R a+rX /usr/share/wordlists /usr/share/seclists 2>/dev/null || true
USER recon

# ── Copy source ───────────────────────────────────────────────────────────────
COPY --chown=recon:recon tsconfig.json ./
COPY --chown=recon:recon index.ts ./
COPY --chown=recon:recon src ./src
COPY --chown=recon:recon start.sh ./start.sh
RUN chmod +x ./start.sh

# ── Runtime config ───────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3004
# Default wordlist path passed to ffuf
ENV FFUF_DEFAULT_WORDLIST=/usr/share/wordlists/dirb/common.txt

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD curl -fsS http://localhost:${PORT:-3004}/healthz || exit 1

# start.sh ensures nuclei templates are present (downloads if missing) and
# then exec's bun index.ts
CMD ["sh", "./start.sh"]
