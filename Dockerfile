# ── Stage 1: Install dependencies ──────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build the application ────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ── Stage 3: Production image ─────────────────────────────────────────
FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g @openai/codex

WORKDIR /app

ENV NODE_ENV=production

# Copy build output and dependencies
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy worker and source files needed at runtime
COPY --from=builder /app/jobs ./jobs
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Copy migrations if they exist (created by pnpm db:generate)
# Use a shell form so it doesn't fail if the directory is missing
RUN --mount=from=builder,source=/app,target=/build \
    if [ -d /build/drizzle ]; then cp -r /build/drizzle ./drizzle; fi

EXPOSE 3000

# Default: run the web server (override via docker-compose command)
CMD ["node", ".output/server/index.mjs"]
