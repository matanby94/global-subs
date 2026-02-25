# ─────────────────────────────────────────────────────────
# Dockerfile for @stremio-ai-subs/api (Fastify REST API)
# Multi-stage build for pnpm monorepo.
# Build context: repository root
#   docker build -f packages/api/Dockerfile -t globalsubs-api .
# ─────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Copy lockfile + workspace config first (better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

# Install only production + build deps
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

# Build shared first, then api
RUN pnpm --filter @stremio-ai-subs/shared build && \
    pnpm --filter @stremio-ai-subs/api build

# ── Stage 3: Production image ────────────────────────────
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api/dist packages/api/dist

USER appuser

EXPOSE 3011
ENV NODE_ENV=production
ENV API_PORT=3011

CMD ["node", "packages/api/dist/index.js"]
