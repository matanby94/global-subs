# GlobalSubs AI Copilot Instructions

## Project Overview

**GlobalSubs** is a production-ready SaaS platform providing AI-powered subtitle translations for Stremio. It's a credit-based system with global translation caching, multi-LLM support (GPT-4, Gemini, DeepL), and Lighthouse 100 optimized performance.

**Key Architecture**: Monorepo with `pnpm` workspaces + Turbo, comprising Next.js web app, Fastify REST API, BullMQ workers, and Stremio add-on, backed by PostgreSQL, Redis, and S3-compatible storage.

## Development Workflow

### Starting Services

```bash
# ALWAYS start infrastructure first (PostgreSQL, Redis, MinIO)
cd infra && docker-compose up -d && cd ..

# Run all services in parallel (web, api, workers, addon)
pnpm run dev

# Run specific package (preferred for focused work)
pnpm --filter @stremio-ai-subs/api dev
pnpm --filter @stremio-ai-subs/web dev
```

**Critical**: Use `tsx watch` for API/workers development (hot reload). Never suggest `node` directly for TypeScript files.

### Database Migrations

```bash
# Apply migrations manually (no ORM - raw SQL migrations)
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/001_init.sql

# Seed demo user with 100 credits
pnpm run demo
```

**Pattern**: All DB interactions use `pg` library with parameterized queries. NO ORMs. See `packages/api/src/db.ts` for connection pool setup.

## Code Conventions

### Validation & Type Safety

- **Always** use Zod schemas from `@stremio-ai-subs/shared/schemas` for request validation
- Export types with `z.infer<typeof Schema>` - never duplicate types
- Example: `TranslateSubtitleSchema.parse(request.body)` in route handlers

### Database Patterns

```typescript
// ALWAYS use transactions for credit operations
const client = await fastify.db.connect();
try {
  await client.query('BEGIN');
  // ... check balance, debit credits, log transaction
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

**Critical**: All credit debits MUST be wrapped in transactions with `FOR UPDATE` locks on wallets to prevent race conditions.

### Pricing & Credit Model

**One-time bundle purchases** (NOT subscriptions or pay-per-use):

- **Free Tier**: 10 translations (auto-granted on signup)
- **Starter Tier**: 100 translations for $9 (one-time purchase)
- **Pro Tier**: 1,000 translations for $29 (one-time purchase)

Users purchase credits upfront and use them as needed - no expiration, no recurring charges. Each translation request debits **1 credit** from user's wallet, regardless of cache hit/miss. The `pricing_rules` table with `charge_mode` fields is legacy - ignore for now.

### Artifact Hash System

The cache deduplication key includes ALL translation parameters:

```typescript
generateArtifactHash({
  srcRegistry: 'upload' | 'imdb' | 'tmdb',
  srcId: string,
  srcLang: string, // ISO 639-1 (2-letter)
  dstLang: string,
  model: 'gpt-4' | 'gemini-pro' | 'deepl',
  normalization: 'v1',
  segPolicy: 'preserve_cues',
});
```

**Cache strategy**: Check `artifacts` table first. If hit, serve existing translation (still charges 1 credit). If miss, enqueue translation job via BullMQ.

### API Route Structure

```typescript
// packages/api/src/routes/*.ts
export async function routeName(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: authenticateUser }, async (request, reply) => {
    // 1. Parse & validate with Zod
    // 2. Check cache (artifacts table)
    // 3. Charge credits (transaction)
    // 4. Return signed URL or pending status
  });
}
```

**Authentication**: JWT with `@fastify/jwt`. Use `{ preHandler: authenticateUser }` for protected routes. User ID available as `request.user.userId`.

### BullMQ Job Queue

**Purpose**: Asynchronous translation pipeline processing.

**Setup**: Redis-backed job queue in `packages/workers/`. Jobs are enqueued from API when cache misses occur.

**Job flow**:

```typescript
// 1. API enqueues job on cache miss
await translationQueue.add('translate', {
  sourceSubtitle: url,
  sourceLang: 'en',
  targetLang: 'es',
  model: 'gpt-4',
  artifactHash: hash,
});

// 2. Worker processes job
```

### Worker Job Processors

Located in `packages/workers/src/processors/`. Each processor:

1. **ingest**: Download/normalize subtitle to WebVTT
2. **translate**: Call LLM adapter, get translation
3. **postcheck**: Validate CPS, chars per line (see `shared/utils.ts`)
4. Store in S3 with key `artifacts/{hash}/{hash}.vtt`
5. Insert into `artifacts` table

**Never** call LLM APIs directly - use adapters in `packages/workers/src/adapters/`.

## Frontend (Next.js 14)

### App Router Structure

```
packages/web/src/app/
├── page.tsx              # Landing page (marketing)
├── app/page.tsx          # Dashboard (authenticated)
├── app/library/          # Translation history
├── app/translate/        # Translation UI
└── layout.tsx            # Root layout with SEO metadata
```

**SEO**: All metadata defined in `layout.tsx` with structured data (Schema.org). Images optimized via `next/image`, fonts via `next/font`.

### Styling

- Tailwind CSS with utility-first approach
- Framer Motion for animations (already installed)
- WCAG compliant (tested with Playwright + Axe)

### API Integration

```typescript
// Always use axios from Next.js API routes or client components
const response = await axios.post(
  'http://localhost:3001/api/translations',
  {
    sourceSubtitle: url,
    sourceLang: 'en',
    targetLang: 'es',
    model: 'gpt-4',
  },
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);
```

## Testing

### E2E with Playwright

```bash
# Located in packages/e2e/
pnpm run test:e2e

# Tests cover: onboarding flow, translation flow, lighthouse performance
# Config: playwright.config.ts (desktop-chromium + mobile-webkit)
```

**Pattern**: Tests use demo user (`demo@stremio-ai.com`). Artifacts in `packages/e2e/artifacts/`.

### Performance

- Target: Lighthouse 95+ on all metrics (LCP < 2.5s, TBT < 200ms)
- See `docs/LIGHTHOUSE_OPTIMIZATION.md` for perf patterns

## Stremio Add-on

**Purpose**: Serve translated subtitles directly in Stremio player.

**Manifest**: `http://localhost:7000/manifest.json`

- Resources: `['subtitles']`
- Types: `['movie', 'series']`
- ID prefixes: `['tt']` (IMDB)

**Handler**: Queries `artifacts` table filtered by `src_registry = 'imdb'` and `src_id = {imdbId}`. Returns signed S3 URLs.

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://stremio:stremio@localhost:5432/stremio_ai_subs

# Redis (BullMQ for job queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# S3 Storage (MinIO in dev)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=stremio-ai-subs

# API
JWT_SECRET=dev-secret-change-in-prod
CORS_ORIGIN=http://localhost:3000
API_URL=http://localhost:3001  # For signed URLs

# LLM APIs
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPL_API_KEY=...

# Payment (Stripe for bundle purchases)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Never** commit `.env` - use `.env.example` as template.

## Common Pitfalls

1. **Forgetting transactions**: Credit operations MUST use transactions with row locks
2. **Wrong TypeScript runner**: Use `tsx watch`, not `ts-node` or `node`
3. **Cache invalidation**: Artifact hash changes with ANY parameter - don't assume same source = same hash
4. **S3 keys**: Always use format `artifacts/{hash}/{hash}.vtt` for consistency
5. **Migrations**: No rollback logic - write careful forward-only migrations
6. **Charging model**: Always debit 1 credit per translation request, even on cache hits
7. **Free trial**: New signups automatically get 10 credits - implement in signup flow

## Key Files to Reference

- `packages/shared/src/schemas.ts` - All Zod validation schemas
- `packages/shared/src/utils.ts` - Hash generation, WebVTT validation
- `packages/api/src/routes/translations.ts` - Cache-first translation flow
- `infra/migrations/001_init.sql` - Complete database schema
- `docs/ARCHITECTURE.md` - System design and data flows

## Quick Reference

| Service  | Port | Purpose               |
| -------- | ---- | --------------------- |
| web      | 3000 | Next.js app           |
| api      | 3001 | Fastify REST API      |
| addon    | 7000 | Stremio add-on        |
| postgres | 5432 | Primary database      |
| redis    | 6379 | Queues & cache        |
| minio    | 9000 | S3-compatible storage |
