# ─────────────────────────────────────────────────────────
# Dockerfile for @stremio-ai-subs/addon (Stremio add-on)
# Build context: repository root
#   docker build -f packages/addon/Dockerfile -t globalsubs-addon .
# ─────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm@8.15.0
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/addon/package.json packages/addon/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY packages/shared/ packages/shared/
COPY packages/addon/ packages/addon/

RUN pnpm --filter @stremio-ai-subs/shared build && \
    pnpm --filter @stremio-ai-subs/addon build

# ── Stage 3: Production image ────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g pnpm@8.15.0

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/addon/package.json packages/addon/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/addon/dist packages/addon/dist

USER appuser

EXPOSE 7000
ENV NODE_ENV=production
ENV ADDON_PORT=7000

CMD ["node", "packages/addon/dist/index.js"]
