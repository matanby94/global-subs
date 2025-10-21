#!/bin/bash
set -e

echo "🚀 Starting Stremio AI Subtitles development environment..."

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed."; exit 1; }

# Start infrastructure
echo "📦 Starting infrastructure services..."
cd infra
docker-compose up -d
cd ..

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run migrations
echo "🗄️  Running database migrations..."
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/001_init.sql 2>/dev/null || true

# Create MinIO bucket
echo "🪣 Creating S3 bucket..."
docker exec stremio-ai-minio sh -c "mc alias set myminio http://localhost:9000 minioadmin minioadmin && mc mb myminio/stremio-ai-subs --ignore-existing" 2>/dev/null || true

# Install dependencies
echo "📥 Installing dependencies..."
pnpm install

# Seed demo user
echo "👤 Seeding demo user..."
pnpm run demo

echo "✅ Development environment is ready!"
echo ""
echo "🌐 Services:"
echo "   Web:           http://localhost:3000"
echo "   API:           http://localhost:3001"
echo "   Stremio Addon: http://localhost:7000"
echo "   MinIO Console: http://localhost:9001"
echo ""
echo "📝 Demo user: demo@stremio-ai.com (100 credits)"
echo ""
echo "🚀 Start development servers with: pnpm run dev"
