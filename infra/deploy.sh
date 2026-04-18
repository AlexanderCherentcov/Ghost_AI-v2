#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  GhostLine AI — Update Deploy
#  Запускать: bash infra/deploy.sh
#
#  Что делает:
#   1. git pull последних изменений
#   2. Пересобирает и перезапускает backend + frontend
#   3. Перезапускает nginx (подхватывает новый конфиг если изменился)
#   4. Показывает статус и health check
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_DIR/infra"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       GhostLine AI — Update Deploy           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Pull latest code ───────────────────────────────────────────────────────
cd "$REPO_DIR"
info "Pulling latest code..."
git pull origin master

# ── 2. Rebuild backend + frontend ─────────────────────────────────────────────
cd "$INFRA_DIR"
info "Building and restarting backend + frontend..."
# --no-cache prevents Docker from using stale layers when git replaces file inodes
docker compose build --no-cache backend frontend
docker compose up -d backend frontend

# ── 3. Restart nginx (picks up new inode after git pull) ─────────────────────
# git pull replaces file inodes — bind-mounted nginx config requires container
# restart (not just nginx -s reload) to see the updated file.
info "Restarting nginx..."
docker compose restart nginx

# ── 4. Status ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo "═══════════════════════════════════════════════"
echo ""

sleep 5
curl -sf "http://127.0.0.1:4000/health" \
  && info "Backend API: OK" \
  || warn "Backend not ready yet — подожди 30 сек и проверь: docker compose logs backend"

echo ""
echo -e "${GREEN}✅ Deploy done!${NC}"
echo ""
