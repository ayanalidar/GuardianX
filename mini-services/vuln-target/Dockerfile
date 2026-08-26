# GuardianX vuln-target — deliberately vulnerable app for VAPT demos
#
# WARNING: this image is INTENTIONALLY INSECURE. The bundled app has
# SQLi, XSS, IDOR, .env leak, path traversal, and open-redirect endpoints
# by design. Do NOT deploy this anywhere reachable from the public
# internet — it exists so GuardianX's SAST/DAST engines have something
# to attack during demos + sandbox runs.
#
# In docker-compose.yml it's bound to 127.0.0.1:3004 and gated behind the
# `vuln-target` profile so it never starts by default in production.

# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-debian AS base

WORKDIR /app

# tini for clean SIGTERM handling (matches the main app's Dockerfile).
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
# vuln-target has zero runtime deps — `bun install` is effectively a no-op
# but keeps the build hermetic if deps are added later.
RUN bun install --frozen-lockfile || bun install

COPY index.ts ./

# Non-root user (matches the main app's UID/GID for consistency).
RUN groupadd --system --gid 1001 vuln \
  && useradd --system --uid 1001 --gid vuln \
       --home-dir /app --no-create-home --shell /usr/sbin/nologin vuln \
  && chown -R root:vuln /app \
  && chmod -R g+rX /app
USER vuln

ENV NODE_ENV=production
ENV PORT=3004

EXPOSE 3004

# Vuln-target has no /healthz endpoint — use the homepage for liveness.
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=2 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3004}/" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "index.ts"]
