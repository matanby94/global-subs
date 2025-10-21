# Architecture Overview

## System Design

Stremio AI Subtitles is a cloud-agnostic SaaS platform for translating subtitles using LLM technology.

### High-Level Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│             │      │              │      │             │
│  Next.js    │─────▶│   Fastify    │─────▶│  PostgreSQL │
│  Web App    │      │   REST API   │      │   Database  │
│             │      │              │      │             │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    Redis     │
                     │   + BullMQ   │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐      ┌─────────────┐
                     │   Workers    │─────▶│  S3/MinIO   │
                     │  (Translate) │      │   Storage   │
                     └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   OpenAI /   │
                     │   Gemini /   │
                     │    DeepL     │
                     └──────────────┘

                     ┌──────────────┐
                     │   Stremio    │
                     │    Addon     │
                     └──────────────┘
```

## Core Components

### 1. Web Application (Next.js)

- **Purpose**: User-facing interface for account management and translations
- **Features**:
  - Marketing pages (SEO-optimized)
  - User dashboard
  - Credit wallet management
  - Translation history
  - Lighthouse 100/100 optimized

### 2. REST API (Fastify)

- **Purpose**: Backend business logic and data management
- **Endpoints**:
  - `/api/auth/*` - Authentication (email OTP)
  - `/api/credits/*` - Wallet & transactions
  - `/api/translations/*` - Translation requests
  - `/api/sign/*` - S3 signed URLs
  - `/api/me` - User profile

### 3. Workers (BullMQ)

- **Purpose**: Asynchronous translation pipeline
- **Jobs**:
  - `ingest` - Download/normalize subtitles
  - `translate` - LLM translation
  - `postcheck` - Quality validation

### 4. Stremio Add-on

- **Purpose**: Native Stremio integration
- **Features**:
  - Subtitles resource handler
  - IMDB/TMDB content matching
  - Signed URL generation

### 5. Storage Layer

- **PostgreSQL**: Relational data (users, wallets, artifacts, events)
- **Redis**: Queue management & caching
- **S3/MinIO**: Object storage for subtitle files

## Data Flow

### Translation Request Flow

```
1. User requests translation via Web UI
   ↓
2. API checks cache (artifact hash lookup)
   ↓
3a. CACHE HIT:
    - Generate signed URL
    - Debit credits
    - Log serve event
   ↓
3b. CACHE MISS:
    - Enqueue translation job
    - Debit credits
    - Return pending status
   ↓
4. Worker processes job:
    - Ingest source subtitle
    - Translate via LLM
    - Validate output (CPS, chars/line)
    - Store in S3
    - Save artifact to DB
   ↓
5. User polls status or receives webhook
   ↓
6. User downloads/streams translated subtitle
```

## Caching & Deduplication

### Artifact Hash

```
SHA256(
  source_registry |
  source_sub_id |
  source_lang |
  target_lang |
  model_version |
  normalization |
  seg_policy
)
```

### Charging Policy

- **always**: Charge on every serve
- **first_only**: Charge only first time per user
- **within_time_window**: Charge if served within X ms

## Security

- **Authentication**: JWT with short TTL
- **Rate Limiting**: Per-IP and per-user
- **Input Validation**: Zod schemas
- **Secrets Management**: Environment variables
- **Audit Logging**: All credit transactions logged

## Scalability

### Horizontal Scaling

- **Web**: Stateless Next.js instances behind load balancer
- **API**: Stateless Fastify instances
- **Workers**: Multiple BullMQ workers (scale by job type)

### Database

- **Read Replicas**: For reporting/analytics
- **Connection Pooling**: PgBouncer
- **Indexes**: Optimized for common queries

### Storage

- **CDN**: CloudFront/Cloudflare in front of S3
- **Multipart Upload**: For large files
- **Lifecycle Policies**: Auto-delete old artifacts

## Deployment

### Development

```bash
docker-compose up -d
pnpm run dev
```

### Production (Single Node)

```bash
# VM with Docker
docker-compose -f docker-compose.prod.yml up -d
```

### Production (Kubernetes)

- Helm charts available in `infra/k8s/`
- Horizontal Pod Autoscaling
- Persistent volumes for databases

## Monitoring & Observability

- **Logs**: Pino JSON logs → Loki/Elasticsearch
- **Traces**: OpenTelemetry → Jaeger/Tempo
- **Metrics**: Prometheus + Grafana
- **Alerts**: PagerDuty/Opsgenie

## SLOs

- **API Latency**: p99 < 500ms
- **Translation Time**: p95 < 30s
- **Uptime**: 99.9%
- **Error Rate**: < 0.1%

## Cost Optimization

- **Cache First**: Serve cached translations when possible
- **Batch Translation**: Group subtitle cues
- **LLM Selection**: Cheaper models for simple translations
- **Storage Tiering**: Archive old translations to Glacier

## Future Enhancements

- [ ] Webhook notifications
- [ ] Batch upload API
- [ ] OpenSubtitles integration
- [ ] TMDB metadata enrichment
- [ ] Quality voting system
- [ ] Custom LLM fine-tuning
- [ ] Multi-region deployment
