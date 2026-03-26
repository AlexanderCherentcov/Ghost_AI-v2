#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GhostLine Server Hardening Script
#  Проверь все переменные ниже ПЕРЕД запуском!
#
#  ⚠️  ВАЖНО: Скрипт сохраняет WireGuard и 3x-ui.
#      Убедись, что SSH_PORT совпадает с твоим реальным SSH-портом.
#      Если SSH_PORT неверный — потеряешь доступ к серверу!
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── НАСТРОЙ ЭТИ ПЕРЕМЕННЫЕ ──────────────────────────────────────────────────

SSH_PORT=22               # Твой SSH-порт. Измени если нестандартный!
WG_PORT=51820             # WireGuard порт (UDP). 0 = не открывать
XRAY_PANEL_PORT=54321     # 3x-ui панель (TCP). 0 = не открывать
# Xray inbound-порты (через пробел) — те что настроены в 3x-ui
# Например: "443 8443 2083 2087"
XRAY_INBOUND_PORTS="443"

DOMAIN="ghostlineai.ru"   # Твой домен для certbot

# ─── ПРОВЕРКИ ─────────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  echo "Запусти скрипт от root: sudo bash server-setup.sh"
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  GhostLine Server Hardening"
echo "══════════════════════════════════════════════"
echo "  SSH_PORT:          $SSH_PORT"
echo "  WG_PORT:           $WG_PORT/udp"
echo "  XRAY_PANEL_PORT:   $XRAY_PANEL_PORT/tcp"
echo "  XRAY_INBOUNDS:     $XRAY_INBOUND_PORTS"
echo "  DOMAIN:            $DOMAIN"
echo "══════════════════════════════════════════════"
echo ""
read -p "Всё верно? (yes/no): " confirm
[[ "$confirm" == "yes" ]] || { echo "Отменено."; exit 0; }

# ─── 1. SSH HARDENING ────────────────────────────────────────────────────────

echo "[1/6] Hardening SSH..."

# Бэкап оригинального конфига
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d)

cat > /etc/ssh/sshd_config.d/99-ghostline.conf << EOF
# GhostLine security config — $(date)
Port $SSH_PORT
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 3
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitEmptyPasswords no
EOF

systemctl reload sshd
echo "  ✅ SSH hardened (port $SSH_PORT, ключи only, root запрещён)"

# ─── 2. UFW FIREWALL ─────────────────────────────────────────────────────────

echo "[2/6] Configuring UFW..."

apt-get install -y ufw > /dev/null 2>&1 || true

# Сброс текущих правил
ufw --force reset

# Политика по умолчанию
ufw default deny incoming
ufw default allow outgoing

# ── SSH ─────────────────────────────────────────
ufw allow "$SSH_PORT/tcp" comment "SSH"

# ── HTTP/HTTPS ──────────────────────────────────
ufw allow 80/tcp  comment "HTTP (Let's Encrypt)"
ufw allow 443/tcp comment "HTTPS"

# ── WireGuard VPN ───────────────────────────────
if [[ "$WG_PORT" != "0" ]]; then
  ufw allow "$WG_PORT/udp" comment "WireGuard VPN"
  echo "  ✅ WireGuard: $WG_PORT/udp открыт"
fi

# ── 3x-ui Xray Panel ────────────────────────────
if [[ "$XRAY_PANEL_PORT" != "0" ]]; then
  ufw allow "$XRAY_PANEL_PORT/tcp" comment "3x-ui panel"
  echo "  ✅ 3x-ui panel: $XRAY_PANEL_PORT/tcp открыт"
fi

# ── Xray inbound ports ──────────────────────────
for port in $XRAY_INBOUND_PORTS; do
  # Пропускаем 443 — уже открыт
  if [[ "$port" != "443" && "$port" != "80" ]]; then
    ufw allow "$port" comment "Xray inbound"
  fi
  echo "  ✅ Xray inbound: $port открыт"
done

# ── PostgreSQL и Redis — только localhost ────────
# Явно запрещаем внешний доступ к БД (они и так на localhost, но надёжнее)
ufw deny 5432/tcp comment "Block external PostgreSQL"
ufw deny 6379/tcp comment "Block external Redis"

# Включаем UFW
ufw --force enable
ufw status verbose

echo "  ✅ UFW настроен"

# ─── 3. PostgreSQL — только localhost ────────────────────────────────────────

echo "[3/6] Securing PostgreSQL & Redis bind..."

PG_CONF=$(find /etc/postgresql -name "postgresql.conf" 2>/dev/null | head -1)
if [[ -n "$PG_CONF" ]]; then
  # listen_addresses = 'localhost' вместо '*'
  sed -i "s/^#*listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$PG_CONF"
  systemctl reload postgresql 2>/dev/null || true
  echo "  ✅ PostgreSQL: listen_addresses = localhost"
else
  echo "  ⚠️  PostgreSQL config не найден (возможно в Docker — там уже localhost)"
fi

REDIS_CONF=$(find /etc/redis -name "redis.conf" 2>/dev/null | head -1)
if [[ -n "$REDIS_CONF" ]]; then
  sed -i "s/^bind .*/bind 127.0.0.1 -::1/" "$REDIS_CONF"
  systemctl reload redis-server 2>/dev/null || true
  echo "  ✅ Redis: bind 127.0.0.1"
else
  echo "  ⚠️  Redis config не найден (возможно в Docker — там уже localhost)"
fi

# ─── 4. FAIL2BAN ─────────────────────────────────────────────────────────────

echo "[4/6] Installing Fail2Ban..."

apt-get install -y fail2ban > /dev/null 2>&1

# Копируем наш конфиг
if [[ -f "$(dirname "$0")/fail2ban/jail.local" ]]; then
  cp "$(dirname "$0")/fail2ban/jail.local" /etc/fail2ban/jail.local
else
  cat > /etc/fail2ban/jail.local << JAILEOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = $SSH_PORT
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
bantime  = 600
JAILEOF
fi

systemctl enable fail2ban
systemctl restart fail2ban
echo "  ✅ Fail2Ban установлен и запущен"

# ─── 5. PERMISSIONS ──────────────────────────────────────────────────────────

echo "[5/6] Setting file permissions..."

# .env файлы — только владелец
find /opt/ghostline -name ".env" -exec chmod 600 {} \; 2>/dev/null || true
find /home -name ".env" -exec chmod 600 {} \; 2>/dev/null || true

# Убеждаемся, что .gitignore защищает .env (только проверка)
if [[ -f "$(dirname "$0")/../.gitignore" ]]; then
  if grep -q "^\.env$" "$(dirname "$0")/../.gitignore"; then
    echo "  ✅ .env в .gitignore"
  else
    echo "  ⚠️  ВНИМАНИЕ: .env не найден в .gitignore!"
  fi
fi

echo "  ✅ Права на файлы установлены"

# ─── 6. CERTBOT (Let's Encrypt) ──────────────────────────────────────────────

echo "[6/6] SSL/TLS certificates..."

if command -v certbot &>/dev/null; then
  echo "  certbot уже установлен"
else
  apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
fi

echo ""
echo "  Для получения сертификата выполни:"
echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "  (после того как Nginx будет запущен)"

# ─── ИТОГ ────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅ Hardening завершён!"
echo ""
echo "  Следующие шаги:"
echo "  1. Скопируй SSH-ключ: ssh-copy-id -p $SSH_PORT user@server"
echo "  2. Проверь что можешь войти по ключу"
echo "  3. Запусти: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "  4. Настрой Nginx: cp infra/nginx/ghostline.conf /etc/nginx/sites-available/"
echo "  5. Проверь ENCRYPTION_KEY в .env (openssl rand -hex 32)"
echo "══════════════════════════════════════════════"
