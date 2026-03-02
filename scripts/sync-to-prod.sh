#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# sync-to-prod.sh — Sync content tables from local DB to production
#
# Syncs: subtitle_sources, scrape_requests, artifacts
# Mode:  INSERT ... ON CONFLICT DO NOTHING (production rows are never touched)
# Files: Already on shared Blaze storage — only DB rows need syncing
#
# Usage:
#   ./scripts/sync-to-prod.sh              # interactive confirmation
#   ./scripts/sync-to-prod.sh --yes        # skip confirmation
#   ./scripts/sync-to-prod.sh --dry-run    # dump SQL to file, don't push
# ─────────────────────────────────────────────────────────────────────────────

# ── Configuration ────────────────────────────────────────────────────────────
LOCAL_CONTAINER="${LOCAL_CONTAINER:-stremio-ai-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-stremio}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-stremio_ai_subs}"

PROD_HOST="${PROD_HOST:-178.104.8.231}"
PROD_SSH_USER="${PROD_SSH_USER:-root}"
PROD_CONTAINER="${PROD_CONTAINER:-globalsubs-postgres}"
PROD_DB_USER="${PROD_DB_USER:-stremio}"
PROD_DB_NAME="${PROD_DB_NAME:-stremio_ai_subs}"

TABLES=("subtitle_sources" "scrape_requests" "artifacts")

# ── Parse flags ──────────────────────────────────────────────────────────────
DRY_RUN=false
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes|-y)  AUTO_YES=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--yes|-y] [--help|-h]"
      echo ""
      echo "  --dry-run   Dump SQL to ./sync-dump.sql instead of pushing to prod"
      echo "  --yes, -y   Skip confirmation prompt"
      echo "  --help, -h  Show this help"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (use --help for usage)"
      exit 1
      ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m==>\033[0m $*"; }
warn()  { echo -e "\033[1;33m⚠\033[0m  $*"; }
ok()    { echo -e "\033[1;32m✓\033[0m  $*"; }
fail()  { echo -e "\033[1;31m✗\033[0m  $*" >&2; exit 1; }

# ── Preflight checks ────────────────────────────────────────────────────────
info "Checking local postgres container..."
docker inspect "$LOCAL_CONTAINER" &>/dev/null \
  || fail "Local container '$LOCAL_CONTAINER' not found. Start it with: cd infra && docker-compose up -d"

info "Checking local DB connectivity..."
docker exec "$LOCAL_CONTAINER" pg_isready -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" &>/dev/null \
  || fail "Local DB not ready"

if [ "$DRY_RUN" = false ]; then
  info "Checking SSH to $PROD_SSH_USER@$PROD_HOST..."
  ssh -o ConnectTimeout=5 -o BatchMode=yes "$PROD_SSH_USER@$PROD_HOST" "docker inspect $PROD_CONTAINER" &>/dev/null \
    || fail "Cannot reach production container '$PROD_CONTAINER' via SSH ($PROD_SSH_USER@$PROD_HOST)"
fi

ok "Preflight checks passed"

# ── Show local row counts ───────────────────────────────────────────────────
info "Local row counts:"
for tbl in "${TABLES[@]}"; do
  count=$(docker exec "$LOCAL_CONTAINER" \
    psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -tAc "SELECT count(*) FROM $tbl" 2>/dev/null || echo "?")
  echo "   $tbl: $count rows"
done

# ── Show production row counts (before) ─────────────────────────────────────
if [ "$DRY_RUN" = false ]; then
  info "Production row counts (before sync):"
  for tbl in "${TABLES[@]}"; do
    count=$(ssh "$PROD_SSH_USER@$PROD_HOST" \
      "docker exec $PROD_CONTAINER psql -U $PROD_DB_USER -d $PROD_DB_NAME -tAc 'SELECT count(*) FROM $tbl'" 2>/dev/null || echo "?")
    echo "   $tbl: $count rows"
  done
fi

# ── Confirmation ─────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  info "Dry-run mode: will dump SQL to ./sync-dump.sql"
elif [ "$AUTO_YES" = false ]; then
  echo ""
  read -rp "Push local content tables to production? [y/N] " confirm
  case "$confirm" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# ── Dump tables ──────────────────────────────────────────────────────────────
# Build pg_dump flags — using --data-only --inserts --on-conflict-do-nothing
# This requires pg_dump >= 16 which is available inside the PG 16 container.

PG_DUMP_ARGS=(
  --data-only
  --inserts
  --on-conflict-do-nothing
  --no-owner
  --no-privileges
)

for tbl in "${TABLES[@]}"; do
  PG_DUMP_ARGS+=(--table="$tbl")
done

info "Dumping tables: ${TABLES[*]}"

if [ "$DRY_RUN" = true ]; then
  # ── Dry run: write to file ─────────────────────────────────────────────────
  DUMP_FILE="./sync-dump.sql"
  docker exec "$LOCAL_CONTAINER" \
    pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" "${PG_DUMP_ARGS[@]}" \
    > "$DUMP_FILE"
  ok "SQL dump written to $DUMP_FILE ($(wc -l < "$DUMP_FILE") lines, $(du -h "$DUMP_FILE" | cut -f1))"
  echo "   Inspect with: head -100 $DUMP_FILE"
else
  # ── Live sync: pipe pg_dump → SSH → psql ───────────────────────────────────
  info "Streaming to production..."
  docker exec "$LOCAL_CONTAINER" \
    pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" "${PG_DUMP_ARGS[@]}" \
  | ssh "$PROD_SSH_USER@$PROD_HOST" \
    "docker exec -i $PROD_CONTAINER psql -U $PROD_DB_USER -d $PROD_DB_NAME"

  ok "Sync complete!"

  # ── Show production row counts (after) ───────────────────────────────────
  info "Production row counts (after sync):"
  for tbl in "${TABLES[@]}"; do
    count=$(ssh "$PROD_SSH_USER@$PROD_HOST" \
      "docker exec $PROD_CONTAINER psql -U $PROD_DB_USER -d $PROD_DB_NAME -tAc 'SELECT count(*) FROM $tbl'" 2>/dev/null || echo "?")
    echo "   $tbl: $count rows"
  done
fi
