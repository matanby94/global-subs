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
ENV_FILE="${REPO_ROOT}/.env.production"

PROD_HOST="${PROD_HOST:-178.104.8.231}"
PROD_USER="${PROD_USER:-root}"
LOCAL_PG_PORT="${LOCAL_PG_PORT:-54320}"

# ── Check prerequisites ──
if [ ! -f "$ENV_FILE" ]; then
  cat <<'EOF'

❌ Missing .env.production file. Create it at the repo root:

    cp .env.production.example .env.production

Then fill in the production values (see the template).

EOF
  exit 1
fi

# Source the env file to get DB credentials
set -a
source "$ENV_FILE"
set +a

# ── Open SSH tunnel to production Postgres ──
echo "🔗 Opening SSH tunnel to production Postgres (localhost:${LOCAL_PG_PORT} → ${PROD_HOST}:5432)..."

# Check if tunnel is already open
if lsof -i ":${LOCAL_PG_PORT}" > /dev/null 2>&1; then
  echo "   ✓ Tunnel already open on port ${LOCAL_PG_PORT}"
else
  ssh -fN -L "${LOCAL_PG_PORT}:127.0.0.1:5432" "${PROD_USER}@${PROD_HOST}" 2>/dev/null
  sleep 1
  if lsof -i ":${LOCAL_PG_PORT}" > /dev/null 2>&1; then
    echo "   ✓ Tunnel established"
  else
    echo "   ❌ Failed to open SSH tunnel. Check your SSH access."
    exit 1
  fi
fi

# Override DATABASE_URL to use the tunnel
export DATABASE_URL="postgresql://${PROD_PG_USER:-stremio}:${PROD_PG_PASSWORD}@localhost:${LOCAL_PG_PORT}/${PROD_PG_DB:-stremio_ai_subs}"

echo "📊 Running analytics agent (${MODE})..."
echo ""

cd "$REPO_ROOT"
npx tsx packages/api/src/scripts/user-analytics-agent.ts "$MODE"

EXIT_CODE=$?

# ── Cleanup SSH tunnel ──
echo ""
echo "🧹 Closing SSH tunnel..."
pkill -f "ssh.*-L.*${LOCAL_PG_PORT}:127.0.0.1:5432" 2>/dev/null || true

exit $EXIT_CODE
