#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# analytics-prod.sh
# Run the analytics agent LOCALLY against PRODUCTION data.
#
# Connects via SSH tunnel to the production PostgreSQL and
# uses the public Umami URL for frontend analytics data.
#
# Prerequisites:
#   - SSH access to the production server (root@178.104.8.231)
#   - .env.production file at repo root (see template below)
#   - `gh` CLI authenticated (for gh models run) OR OPENAI_API_KEY
#   - pnpm + tsx installed
#
# Usage:
#   bash scripts/analytics-prod.sh --mode=daily
#   bash scripts/analytics-prod.sh --mode=weekly
# ─────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:---mode=daily}"
ENV_FILE="${REPO_ROOT}/.env.analytics"

PROD_HOST="${PROD_HOST:-178.104.8.231}"
PROD_USER="${PROD_USER:-root}"
LOCAL_PG_PORT="${LOCAL_PG_PORT:-54320}"
LOCAL_UMAMI_PORT="${LOCAL_UMAMI_PORT:-13005}"

# ── Check prerequisites ──
if [ ! -f "$ENV_FILE" ]; then
  cat <<'EOF'

❌ Missing .env.analytics file. Create it at the repo root:

    cp .env.analytics.example .env.analytics

Then fill in the production values (see the template).

EOF
  exit 1
fi

# Source the env file to get DB credentials
set -a
source "$ENV_FILE"
set +a

# ── Open SSH tunnels to production Postgres + Umami ──
echo "🔗 Opening SSH tunnels to production..."
echo "   Postgres: localhost:${LOCAL_PG_PORT} → ${PROD_HOST}:5432"
echo "   Umami:    localhost:${LOCAL_UMAMI_PORT} → ${PROD_HOST}:3005"

# Check if tunnels are already open
TUNNEL_NEEDED=false
if ! lsof -i ":${LOCAL_PG_PORT}" > /dev/null 2>&1; then
  TUNNEL_NEEDED=true
fi
if ! lsof -i ":${LOCAL_UMAMI_PORT}" > /dev/null 2>&1; then
  TUNNEL_NEEDED=true
fi

if [ "$TUNNEL_NEEDED" = true ]; then
  ssh -fN \
    -L "${LOCAL_PG_PORT}:127.0.0.1:5432" \
    -L "${LOCAL_UMAMI_PORT}:127.0.0.1:3005" \
    "${PROD_USER}@${PROD_HOST}" 2>/dev/null
  sleep 1
fi

if lsof -i ":${LOCAL_PG_PORT}" > /dev/null 2>&1; then
  echo "   ✓ Postgres tunnel established"
else
  echo "   ❌ Failed to open Postgres SSH tunnel."
  exit 1
fi
if lsof -i ":${LOCAL_UMAMI_PORT}" > /dev/null 2>&1; then
  echo "   ✓ Umami tunnel established"
else
  echo "   ⚠️  Umami tunnel not available — frontend analytics will be skipped"
fi

# Override DATABASE_URL and UMAMI_API_URL to use the tunnels
export DATABASE_URL="postgresql://${PROD_PG_USER:-stremio}:${PROD_PG_PASSWORD}@localhost:${LOCAL_PG_PORT}/${PROD_PG_DB:-stremio_ai_subs}"
export UMAMI_API_URL="http://localhost:${LOCAL_UMAMI_PORT}"

echo "📊 Running analytics agent (${MODE})..."
echo ""

cd "$REPO_ROOT"
./packages/api/node_modules/.bin/tsx packages/api/src/scripts/user-analytics-agent.ts "$MODE"

EXIT_CODE=$?

# ── Cleanup SSH tunnel ──
echo ""
echo "🧹 Closing SSH tunnels..."
pkill -f "ssh.*-L.*${LOCAL_PG_PORT}:127.0.0.1:5432" 2>/dev/null || true

exit $EXIT_CODE
