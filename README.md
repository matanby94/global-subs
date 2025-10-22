# GlobalSubs ��🎬

> **Production-ready SaaS platform for AI-powered subtitle translations in 100+ languages**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-green)](https://www.fastify.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🌟 Features

- 💰 **Credit-based Wallet System** - Pay-as-you-go pricing model
- 🌍 **Multi-LLM Support** - GPT-4, Gemini Pro, DeepL
- ⚡ **Global Translation Cache** - Deduplication with smart charging policies
- 🎯 **Stremio Integration** - Native add-on for seamless streaming
- 📊 **Real-time Dashboard** - Track credits, history, and translations
- 🔒 **Enterprise Security** - JWT auth, rate limiting, input validation
- 🚀 **Lighthouse 100** - Optimized for performance and SEO
- ♿ **Accessibility** - WCAG compliant, tested with Axe
- 🐳 **Cloud Agnostic** - Docker-based, runs anywhere
- 🧪 **Fully Tested** - Playwright E2E tests via MCP

## 📦 Tech Stack

### Frontend

- **Next.js 14** - App Router, React Server Components
- **Tailwind CSS** - Utility-first styling
- **TypeScript** - Type-safe development

### Backend

- **Fastify** - High-performance REST API
- **BullMQ** - Background job processing
- **PostgreSQL** - Primary database
- **Redis** - Caching and queues
- **S3/MinIO** - Object storage for artifacts

### Infrastructure

- **Docker Compose** - Local development
- **pnpm** - Fast package management
- **Turbo** - Monorepo build system
- **Playwright** - E2E testing via MCP

## 🚀 Quick Start

### Prerequisites

```bash
node >= 20.0.0
pnpm >= 8.0.0
docker >= 20.0.0
docker-compose >= 2.0.0
```

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stremio-translations-ai.git
cd stremio-translations-ai

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
cd infra && docker-compose up -d && cd ..

# Run database migrations
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/001_init.sql
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/002_seed_demo.sql

# Start all services
pnpm run dev
```

### Services

Once started, access:

- 🌐 **Web App**: http://localhost:3000
- 🔌 **API**: http://localhost:3001
- 🎬 **Stremio Addon**: http://localhost:7000
- 🗄️ **MinIO Console**: http://localhost:9001

### Demo Credentials

```
Email: demo@globalsubs.net
Credits: 100 (pre-loaded)
```

## 📁 Project Structure

```
stremio-translations-ai/
├── packages/
│   ├── shared/          # Shared types, schemas, utilities
│   ├── api/             # Fastify REST API
│   ├── workers/         # BullMQ translation workers
│   ├── addon/           # Stremio add-on service
│   ├── web/             # Next.js web application
│   └── e2e/             # Playwright E2E tests
├── infra/
│   ├── docker-compose.yml
│   └── migrations/      # SQL migration files
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GETTING_STARTED.md
│   └── TEST_EXECUTION_SUMMARY.md
└── .github/
    └── workflows/
        └── ci.yml       # GitHub Actions CI pipeline
```

## 🧪 Testing

```bash
# Run all tests
pnpm run test

# Run E2E tests via Playwright MCP
pnpm run test:e2e

# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Format code
pnpm run format
```

## 📖 Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Getting Started Guide](./docs/GETTING_STARTED.md)
- [Test Execution Summary](./docs/TEST_EXECUTION_SUMMARY.md)

## 🎬 Using the Stremio Add-on

1. Open Stremio
2. Navigate to **Add-ons** → **Community Add-ons**
3. Click **Install from URL**
4. Enter: `http://localhost:7000/manifest.json`
5. Enjoy AI-translated subtitles! 🎉

## 🔧 Development Scripts

```bash
# Start all services in dev mode
pnpm run dev

# Build all packages
pnpm run build

# Seed demo user with credits
pnpm run demo

# Run individual services
pnpm --filter @stremio-ai-subs/web dev
pnpm --filter @stremio-ai-subs/api dev
pnpm --filter @stremio-ai-subs/addon dev
pnpm --filter @stremio-ai-subs/workers dev
```

## 🌐 Deployment

### Development

```bash
docker-compose up -d
pnpm run dev
```

### Production (Single Node)

```bash
# Set environment variables
cp .env.example .env
# Edit .env with production values

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
./scripts/migrate.sh
```

### Kubernetes

```bash
# Helm charts available in infra/k8s/
helm install stremio-ai-subs ./infra/k8s
```

## 🔐 Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/stremio_ai_subs

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# S3 Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin

# API
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:3000

# LLM APIs
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPL_API_KEY=...
```

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📊 Performance

- ⚡ **Lighthouse Score**: 95+ (targeting 100)
- 🚀 **API Latency**: p99 < 500ms
- ⏱️ **Translation Time**: p95 < 30s
- 📈 **Uptime SLO**: 99.9%

## 🛡️ Security

- ✅ JWT authentication with short TTL
- ✅ Rate limiting (100 req/min per IP)
- ✅ Input validation with Zod schemas
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Audit logging for all credit transactions

## 📈 Roadmap

- [ ] Webhook notifications
- [ ] Batch upload API
- [ ] OpenSubtitles integration
- [ ] TMDB metadata enrichment
- [ ] Quality voting system
- [ ] Custom LLM fine-tuning
- [ ] Multi-region deployment
- [ ] Mobile apps (iOS/Android)

## 📝 License

MIT © [Your Name]

## 🙏 Acknowledgments

- [Stremio](https://www.stremio.com/) - For the amazing streaming platform
- [OpenAI](https://openai.com/) - For GPT-4 API
- [Playwright](https://playwright.dev/) - For reliable E2E testing
- [Next.js](https://nextjs.org/) - For the awesome React framework

## 📧 Contact

- Website: https://globalsubs.net
- Email: support@globalsubs.net
- Twitter: [@globalsubs](https://twitter.com/globalsubs)

---

**Made with ❤️ by the GlobalSubs Team**

**Tested with Playwright MCP Server** 🎭✅
