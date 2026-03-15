#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# setup-analytics-prod.sh
# Run ON the production server to set up Umami analytics.
#
# Usage:
#   ssh root@178.104.8.231 "cd /app && bash scripts/setup-analytics-prod.sh"
# ─────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f ${APP_DIR}/infra/docker-compose.prod.yml"

echo "==> Setting up Umami analytics ($(date -u +%Y-%m-%dT%H:%M:%SZ))"

# ── Step 1: Ensure umami database exists ──
echo "==> Creating umami database (if not exists)..."
$COMPOSE up -d postgres
sleep 3
$COMPOSE exec -T postgres sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT '\''CREATE DATABASE umami'\'' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '\''umami'\'')\\gexec"' \
  2>&1 || true

# ── Step 2: Apply analytics_reports migration ──
echo "==> Applying analytics_reports migration..."
$COMPOSE exec -T postgres sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -f /docker-entrypoint-initdb.d/011_analytics_reports.sql' \
  2>&1 || true

# ── Step 3: Start Umami ──
echo "==> Starting Umami container..."
$COMPOSE up -d umami
sleep 5

# Check if Umami is healthy
if $COMPOSE exec -T umami wget -qO- http://localhost:3000/api/heartbeat > /dev/null 2>&1; then
  echo "✅ Umami is running"
else
  echo "⚠️  Umami may still be starting — check logs: docker logs globalsubs-umami"
fi

# ── Step 4: Install Nginx vhost ──
NGINX_CONF="/etc/nginx/sites-available/analytics.globalsubs-ai.com.conf"
if [ ! -f "$NGINX_CONF" ]; then
  echo "==> Installing Nginx config for analytics.globalsubs-ai.com..."
  cp "${APP_DIR}/infra/nginx/analytics.globalsubs-ai.com.conf" "$NGINX_CONF"
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  echo "✅ Nginx configured"

  # ── Step 5: TLS certificate ──
  echo "==> Obtaining TLS certificate..."
  if command -v certbot &> /dev/null; then
    certbot --nginx -d analytics.globalsubs-ai.com --non-interactive --agree-tos --redirect \
      || echo "⚠️  Certbot failed — make sure DNS A record for analytics.globalsubs-ai.com points to this server"
  else
    echo "⚠️  certbot not installed — run: apt install certbot python3-certbot-nginx"
  fi
else
  echo "ℹ️  Nginx config already exists, skipping"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Umami Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Ensure DNS: analytics.globalsubs-ai.com → $(curl -4s ifconfig.me 2>/dev/null || echo '178.104.8.231')"
echo "  2. Open https://analytics.globalsubs-ai.com"
echo "  3. Login with admin / umami (CHANGE THE PASSWORD!)"
echo "  4. Go to Settings → Websites → Add website"
echo "     Name: GlobalSubs"
echo "     Domain: globalsubs-ai.com"
echo "  5. Copy the Website ID and update .env:"
echo "     NEXT_PUBLIC_UMAMI_URL=https://analytics.globalsubs-ai.com"
echo "     NEXT_PUBLIC_UMAMI_WEBSITE_ID=<copied-id>"
echo "     UMAMI_API_URL=http://umami:3000"
echo "     UMAMI_API_TOKEN=<from Umami Settings → API → Create token>"
echo "  6. Rebuild web to bake in the NEXT_PUBLIC vars:"
echo "     $COMPOSE build web && $COMPOSE up -d web"
echo ""
