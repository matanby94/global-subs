# ─────────────────────────────────────────────────────────
# Dockerfile for @stremio-ai-subs/scrapers
# Build context: repository root
#   docker build -f packages/scrapers/Dockerfile -t globalsubs-scrapers .
# ─────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm@8.15.0
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scrapers/package.json packages/scrapers/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY packages/shared/ packages/shared/
COPY packages/scrapers/ packages/scrapers/

RUN pnpm --filter @stremio-ai-subs/shared build && \
    pnpm --filter @stremio-ai-subs/scrapers build

# ── Stage 3: Production image ────────────────────────────
# Use full node image (not alpine) because scrapers may need Playwright/Chromium
FROM node:20-slim AS production
RUN npm install -g pnpm@8.15.0

# Install Playwright system dependencies for headless browser support
RUN apt-get update && \
    npx playwright install-deps chromium && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -m appuser
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scrapers/package.json packages/scrapers/

RUN pnpm install --frozen-lockfile --prod

# Install Playwright browsers
RUN npx playwright install chromium

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/scrapers/dist packages/scrapers/dist

USER appuser

ENV NODE_ENV=production

CMD ["node", "packages/scrapers/dist/index.js"]
