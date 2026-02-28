# Stremio AI Subtitles

> LLM-powered subtitle translation SaaS platform + Stremio add-on

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd stremio-translations-ai

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
cd infra
docker-compose up -d
cd ..

# Run migrations
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/001_init.sql

# Seed demo user
pnpm run demo

# Start all services
pnpm run dev
```

Services will be available at:

- **Web**: http://localhost:3000
- **API**: http://localhost:3001
- **Stremio Addon**: http://localhost:7000
- **MinIO Console**: http://localhost:9001

### Demo User

- Email: `demo@stremio-ai.com`
- Initial credits: 100

## 📦 Monorepo Structure

```
stremio-translations-ai/
├── packages/
│   ├── shared/        # Shared types, schemas, utilities
│   ├── api/           # Fastify REST API
│   ├── workers/       # BullMQ translation workers
│   ├── addon/         # Stremio add-on
│   ├── web/           # Next.js web app
│   └── e2e/           # Playwright E2E tests
├── infra/             # Docker Compose, migrations
└── docs/              # Architecture & runbooks
```

## 🧪 Testing

```bash
# Run all tests
pnpm run test

# Run E2E tests
pnpm run test:e2e

# Type checking
pnpm run typecheck

# Linting
pnpm run lint
```

## 🔧 Development

```bash
# Start development mode (all services)
pnpm run dev

# Build all packages
pnpm run build

# Format code
pnpm run format
```

## 🎬 Using the Stremio Add-on

1. Open Stremio
2. Go to Add-ons
3. Install from URL: `http://localhost:7000/manifest.json`
4. Watch content with translated subtitles!

## 📖 Documentation

See [docs/](./docs) for:

- [Architecture Overview](./docs/ARCHITECTURE.md)
- Getting Started Guide (this file)
- API Documentation
- Deployment Guide

## 🌟 Features

- ✅ Credit-based wallet system
- ✅ Multi-LLM support (GPT-4, Gemini, DeepL)
- ✅ Global translation cache
- ✅ Configurable charging policies
- ✅ WebVTT validation & post-processing
- ✅ S3-compatible storage
- ✅ Stremio integration
- ✅ Lighthouse-optimized web app
- ✅ Comprehensive E2E tests

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Fastify, TypeScript
- **Workers**: BullMQ, Redis
- **Database**: PostgreSQL
- **Storage**: S3-compatible (MinIO)
- **Testing**: Playwright, Axe
- **CI/CD**: GitHub Actions

## � Further Reading

- [Architecture Overview](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Server Infrastructure](./INFRASTRUCTURE.md)
- [Package Communication](./PACKAGE_COMMUNICATION.md)
- [Lighthouse Optimization](./LIGHTHOUSE_OPTIMIZATION.md)

## �📝 License

MIT
