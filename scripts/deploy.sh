#!/usr/bin/env bash
set -euo pipefail

# GlobalSubs Production Deploy Script
# Runs on the Hetzner server via GitHub Actions SSH

APP_DIR="${APP_DIR:-/opt/globalsubs}"
COMPOSE_FILE="infra/docker-compose.prod.yml"

echo "==> Deploying GlobalSubs to $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

cd "$APP_DIR"

# Pull latest code
echo "==> Pulling latest changes..."
git fetch origin main
git reset --hard origin/main

# Build and restart services (with zero-downtime rolling approach)
echo "==> Building Docker images..."
docker compose -f "$COMPOSE_FILE" build --parallel

echo "==> Applying database migrations..."
docker compose -f "$COMPOSE_FILE" up -d postgres
sleep 5  # Wait for postgres to be ready

docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c \
  'for f in /docker-entrypoint-initdb.d/*.sql; do
    echo "Applying $f..."
    PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -f "$f" 2>&1 || true
  done'

echo "==> Starting all services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Cleaning up old images..."
docker image prune -f

echo "==> Waiting for health checks..."
sleep 10

# Verify services are running
RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --format json | grep -c '"running"' || true)
TOTAL=$(docker compose -f "$COMPOSE_FILE" ps --format json | wc -l)
echo "==> Services running: $RUNNING/$TOTAL"

if [ "$RUNNING" -lt "$TOTAL" ]; then
  echo "WARNING: Not all services are healthy!"
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "==> Deploy complete!"
