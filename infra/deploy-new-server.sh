#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  GhostLine AI — Deploy on a Fresh Server
#  Запускать: bash deploy-new-server.sh
#
#  Что делает:
#   1. Устанавливает Docker (если не установлен)
#   2. Создаёт Docker-сеть и volumes
#   3. Проверяет .env
#   4. Запускает все сервисы (postgres, redis, backend, bot, frontend, nginx)
#   5. Выпускает SSL-сертификат через certbot
#
#  Требования перед запуском:
#   - Ubuntu 22.04+ / Debian 12+
#   - Домен направлен на IP сервера (A-записи в DNS)
#   - Файл infra/.env заполнен (скопируй с .env.example)
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="${DOMAIN:-ghostlineai.ru}"
EMAIL="${CERTBOT_EMAIL:-admin@ghostlineai.ru}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_DIR/infra"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     GhostLine AI — Fresh Server Deploy       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    info "Docker installed: $(docker --version)"
else
    info "Docker already installed: $(docker --version)"
fi

# ── 2. Check .env ─────────────────────────────────────────────────────────────
if [[ ! -f "$INFRA_DIR/.env" ]]; then
    if [[ -f "$INFRA_DIR/.env.example" ]]; then
        warn ".env not found. Copying from .env.example — заполни его перед продолжением!"
        cp "$INFRA_DIR/.env.example" "$INFRA_DIR/.env"
        error "Заполни $INFRA_DIR/.env и запусти скрипт снова."
    else
        error ".env не найден в $INFRA_DIR/. Создай его из .env.example."
    fi
fi
info ".env found"

# ── 3. Create network and volumes ─────────────────────────────────────────────
info "Creating Docker network and volumes..."

docker network create infra_ghost_net 2>/dev/null || info "Network infra_ghost_net already exists"

for vol in infra_postgres_data infra_certbot_webroot infra_letsencrypt; do
    docker volume create "$vol" 2>/dev/null || info "Volume $vol already exists"
done

# ── 4. Stop host nginx if running (will conflict with port 80/443) ────────────
if systemctl is-active --quiet nginx 2>/dev/null; then
    warn "Stopping host nginx (port 80/443 conflict)..."
    systemctl stop nginx
    systemctl disable nginx
    info "Host nginx stopped and disabled"
fi

# ── 5. Start infrastructure (postgres + redis first) ─────────────────────────
cd "$INFRA_DIR"

info "Starting postgres and redis..."
docker compose up -d --remove-orphans postgres redis
docker compose wait postgres redis 2>/dev/null || sleep 15

# ── 6. Start backend and bot ──────────────────────────────────────────────────
info "Building and starting backend + bot..."
docker compose up -d --build --remove-orphans backend bot

# ── 7. Start nginx with HTTP-only config (for certbot ACME challenge) ─────────
info "Starting nginx (HTTP mode for SSL issuance)..."

# Проверяем, есть ли уже сертификаты
CERT_PATH="/var/lib/docker/volumes/infra_letsencrypt/_data/live/$DOMAIN/fullchain.pem"

if [[ -f "$CERT_PATH" ]]; then
    info "SSL certificate already exists, skipping issuance"
else
    # Временный nginx без SSL для получения сертификата
    info "SSL not found — issuing certificate via certbot..."

    # Временный nginx только с HTTP
    docker run -d --name ghostline-nginx-tmp \
        --network infra_ghost_net \
        -p 80:80 \
        -v "$(pwd)/nginx/ghostline.docker.conf:/etc/nginx/conf.d/default.conf:ro" \
        -v "infra_certbot_webroot:/var/www/certbot" \
        nginx:1.27-alpine 2>/dev/null || warn "Temp nginx already running"

    sleep 3

    # Выпускаем сертификат
    docker run --rm \
        -v "infra_certbot_webroot:/var/www/certbot" \
        -v "infra_letsencrypt:/etc/letsencrypt" \
        certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        --email "$EMAIL" \
        --agree-tos --no-eff-email \
        -d "$DOMAIN" -d "www.$DOMAIN" -d "miniapp.$DOMAIN" -d "api.$DOMAIN" \
        --non-interactive 2>&1

    docker stop ghostline-nginx-tmp && docker rm ghostline-nginx-tmp 2>/dev/null || true
    info "SSL certificate issued for $DOMAIN"
fi

# ── 8. Start frontend + nginx (full stack) ───────────────────────────────────
info "Building and starting frontend..."
docker compose up -d --build --remove-orphans frontend

info "Starting nginx with SSL..."
docker compose up -d --remove-orphans nginx certbot

# ── 9. Final status ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
docker compose ps
echo "═══════════════════════════════════════════════"
echo ""
info "Health check..."
sleep 10
curl -sf "http://127.0.0.1:4000/health" && info "Backend API: OK" || warn "Backend not ready yet (wait 30s)"

echo ""
echo -e "${GREEN}✅ GhostLine AI deployed!${NC}"
echo "   https://$DOMAIN"
echo "   https://api.$DOMAIN/health"
echo ""
echo "Logs:  docker compose -f $INFRA_DIR/docker-compose.yml logs -f"
echo "Stop:  docker compose -f $INFRA_DIR/docker-compose.yml down"
echo ""
