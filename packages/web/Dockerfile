# ─────────────────────────────────────────────────────────
# Dockerfile for @stremio-ai-subs/web (Next.js frontend)
# Build context: repository root
#   docker build -f packages/web/Dockerfile -t globalsubs-web .
# ─────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm@8.15.0
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

# Build shared first, then Next.js
RUN pnpm --filter @stremio-ai-subs/shared build

# Next.js build needs NEXT_PUBLIC_ env vars at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_ADDON_MANIFEST_URL
ARG NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
ARG NEXT_PUBLIC_UMAMI_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}
ENV NEXT_PUBLIC_ADDON_MANIFEST_URL=${NEXT_PUBLIC_ADDON_MANIFEST_URL}
ENV NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID}
ENV NEXT_PUBLIC_UMAMI_URL=${NEXT_PUBLIC_UMAMI_URL}
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID}

RUN pnpm --filter @stremio-ai-subs/web build

# Ensure public dir exists (may be empty)
RUN mkdir -p /app/packages/web/public

# ── Stage 3: Production image ────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

# Next.js standalone output (if configured) or standard build
COPY --from=build /app/packages/web/.next packages/web/.next
COPY --from=build /app/packages/web/public packages/web/public
COPY --from=build /app/packages/web/next.config.js packages/web/next.config.js
COPY --from=build /app/packages/web/package.json packages/web/package.json

# Need next binary to run
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/web/node_modules packages/web/node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/package.json package.json
COPY --from=build /app/pnpm-workspace.yaml pnpm-workspace.yaml

USER appuser

EXPOSE 3000
ENV NODE_ENV=production
ENV WEB_PORT=3000

WORKDIR /app/packages/web
CMD ["npx", "next", "start", "-p", "3000"]
