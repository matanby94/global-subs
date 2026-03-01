# Deployment Guide

GlobalSubs is deployed to a **Hetzner ARM64** server and uses **GitHub Actions** for continuous deployment.

## Overview

```
GitHub (push to main)
        │
        ▼
┌───────────────────┐
│  GitHub Actions    │
│  CI Pipeline       │
│  (build & test)    │
└────────┬──────────┘
         │ SSH
         ▼
┌───────────────────────────────────────────┐
│  Hetzner Server (178.104.8.231)           │
│                                           │
│  Nginx (reverse proxy + TLS)              │
│    ├── globalsubs-ai.com     → :3010 web  │
│    ├── api.globalsubs-ai.com → :3011 api  │
│    └── addon.globalsubs-ai.com → :3012    │
│                                           │
│  Docker Compose (7 services)              │
│    ├── globalsubs-web       :3010→3000    │
│    ├── globalsubs-api       :3011→3001    │
│    ├── globalsubs-addon     :3012→7000    │
│    ├── globalsubs-workers   (no port)     │
│    ├── globalsubs-scrapers  (no port)     │
│    ├── globalsubs-postgres  :5432         │
│    └── globalsubs-redis     :6379         │
└───────────────────────────────────────────┘
```

## CI/CD Pipeline

The pipeline is defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### Triggers

- **Push** to `main` or `develop`
- **Pull request** targeting `main` or `develop`

### Jobs

#### 1. `build-and-test`

Runs on `ubuntu-latest` with Postgres and Redis service containers:

1. Install pnpm + Node 20
2. Apply database migrations
3. Type check (`pnpm run typecheck`)
4. Lint (`pnpm run lint`)
5. Build all packages (`pnpm run build`)
6. Run unit tests (`pnpm run test`)
7. Install Playwright browsers
8. Start API + Web dev servers
9. Run E2E tests (continue-on-error)
10. Upload Playwright artifacts

#### 2. `deploy`

Runs **only** on push to `main` after `build-and-test` passes:

1. SSH into the Hetzner server using `appleboy/ssh-action@v1`
2. Pull latest code (`git reset --hard origin/main`)
3. Build Docker images in parallel
4. Apply database migrations
5. Start/restart all services
6. Prune old images
7. Verify all services are running

### GitHub Secrets

All secrets use the `GLOBAL_SUBS_` prefix:

| Secret                       | Description                    |
| ---------------------------- | ------------------------------ |
| `GLOBAL_SUBS_DEPLOY_USER`    | SSH username (`root`)          |
| `GLOBAL_SUBS_DEPLOY_SSH_KEY` | SSH private key for the server |

## Manual Deployment

If you need to deploy manually (bypassing CI):

```bash
# SSH into the server
ssh root@178.104.8.231

# Navigate to the app directory
cd /app

# Pull latest code
git fetch origin main && git reset --hard origin/main

# Build and restart
docker compose --env-file .env -f infra/docker-compose.prod.yml build --parallel
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d

# Check status
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
```

Or use the deploy script:

```bash
ssh root@178.104.8.231 "cd /app && bash scripts/deploy.sh"
```

## Docker Compose (Production)

The production compose file is at [`infra/docker-compose.prod.yml`](../infra/docker-compose.prod.yml).

### Services

| Service  | Image                        | Internal Port | Host Port | Notes                          |
| -------- | ---------------------------- | ------------- | --------- | ------------------------------ |
| postgres | postgres:16-alpine           | 5432          | 5432      | Persistent volume, healthcheck |
| redis    | redis:7-alpine               | 6379          | 6379      | Password-protected, 256MB max  |
| api      | packages/api/Dockerfile      | 3001          | 3011      | `API_PORT=3001` override       |
| workers  | packages/workers/Dockerfile  | —             | —         | No HTTP port                   |
| addon    | packages/addon/Dockerfile    | 7000          | 3012      | Stremio manifest               |
| scrapers | packages/scrapers/Dockerfile | —             | —         | No HTTP port                   |
| web      | packages/web/Dockerfile      | 3000          | 3010      | Next.js standalone             |

### Port Mapping Note

The API Dockerfile defaults to `ENV API_PORT=3011`, but the compose file maps `host:3011 → container:3001`. The compose environment overrides with `API_PORT: '3001'` so the Fastify process listens on port 3001 inside the container.

### Building Images

All Dockerfiles use multi-stage builds with `node:20-alpine`. Since the server is ARM64 (aarch64), images are built natively on the server (no cross-compilation needed). pnpm is installed via `npm install -g pnpm@8.15.0` (corepack has issues on ARM64).

## Environment Variables

The `.env` file on the server (`/app/.env`) contains all configuration. Key production values:

```bash
# Database
POSTGRES_USER=stremio
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=stremio_ai_subs
DATABASE_URL=postgresql://stremio:<password>@localhost:5432/stremio_ai_subs

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secure-password>

# URLs (production domains)
CORS_ORIGIN=https://globalsubs-ai.com
API_URL=https://api.globalsubs-ai.com
NEXT_PUBLIC_WEB_URL=https://globalsubs-ai.com
NEXT_PUBLIC_API_URL=https://api.globalsubs-ai.com
NEXT_PUBLIC_ADDON_MANIFEST_URL=https://addon.globalsubs-ai.com/manifest.json

# JWT
JWT_SECRET=<secure-secret>

# S3/MinIO
S3_ENDPOINT=<s3-endpoint>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=stremio-ai-subs

# LLM APIs
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPL_API_KEY=...

# Payments
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

> **Important**: `NEXT_PUBLIC_*` variables are baked into the web image at build time. If you change them, you must rebuild the web image.

## Database Migrations

Migrations are applied automatically during deployment. They are mounted into the Postgres container at `/docker-entrypoint-initdb.d/` and also applied explicitly during deploy:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml exec -T postgres sh -c \
  'for f in /docker-entrypoint-initdb.d/*.sql; do
    PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -f "$f" 2>&1 || true
  done'
```

Migrations are forward-only (no rollback). Files in `infra/migrations/`:

- `001_init.sql` — Core schema
- `002_seed_demo.sql` — Demo user
- `003_user_library_and_translation_requests.sql`
- `004_addon_installations.sql`
- `005_subtitle_sources_and_scrape_requests.sql`
- `006_negative_cache_and_priority.sql`
- `007_oauth_auth_provider.sql`

## Troubleshooting

### View container logs

```bash
ssh root@178.104.8.231 "docker logs globalsubs-api --tail 50"
ssh root@178.104.8.231 "docker logs globalsubs-web --tail 50"
ssh root@178.104.8.231 "docker logs globalsubs-addon --tail 50"
```

### Restart a single service

```bash
ssh root@178.104.8.231 "cd /app && docker compose --env-file .env -f infra/docker-compose.prod.yml restart api"
```

### Rebuild and restart a service

```bash
ssh root@178.104.8.231 "cd /app && docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --build web"
```

### Check disk usage

```bash
ssh root@178.104.8.231 "docker system df"
```

### Clean up Docker resources

```bash
ssh root@178.104.8.231 "docker system prune -af --volumes"
```
