# ─────────────────────────────────────────────────────────
# Dockerfile for @stremio-ai-subs/workers (BullMQ workers)
# Build context: repository root
#   docker build -f packages/workers/Dockerfile -t globalsubs-workers .
# ─────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/workers/package.json packages/workers/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY packages/shared/ packages/shared/
COPY packages/workers/ packages/workers/

RUN pnpm --filter @stremio-ai-subs/shared build && \
    pnpm --filter @stremio-ai-subs/workers build

# ── Stage 3: Production image ────────────────────────────
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/workers/package.json packages/workers/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/workers/dist packages/workers/dist

USER appuser

ENV NODE_ENV=production

CMD ["node", "packages/workers/dist/index.js"]
