# GuardianX Production Dockerfile
# Multi-stage build: deps → build → runtime
# Final image is ~400MB, runs as non-root user

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Install bun
RUN npm install -g bun@1.3.4

# Copy package files
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# ── Stage 2: Build the application ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

RUN npm install -g bun@1.3.4

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time env vars
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js app
RUN bun run build

# ── Stage 3: Production runtime ────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Install only what's needed at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r guardianx && useradd -r -g guardianx -s /bin/false guardianx

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy prisma schema for db:push
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy package.json for scripts
COPY --from=builder /app/package.json ./package.json

# Set ownership
RUN chown -R guardianx:guardianx /app

USER guardianx

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
