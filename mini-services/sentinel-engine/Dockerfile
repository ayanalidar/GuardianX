FROM oven/bun:1.3

WORKDIR /app

# Copy package.json and install deps
COPY package.json ./
RUN bun install

# Copy source
COPY . .

# Expose port (Railway sets PORT env var)
ENV PORT=3003
EXPOSE 3003

# Start the engine
CMD ["bun", "index.ts"]
