#!/bin/bash
set -e

echo "Starting infrastructure services..."
docker-compose -f infra/docker-compose.yml up -d

echo "Waiting for PostgreSQL to be ready..."
until docker exec stremio-ai-postgres pg_isready -U stremio > /dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
docker exec -i stremio-ai-postgres psql -U stremio -d stremio_ai_subs < infra/migrations/001_init.sql

echo "✅ Infrastructure is ready!"
