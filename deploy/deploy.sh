#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-abuzhuma.com}"
EMAIL="${CERTBOT_EMAIL:-abuzhuma.com@gmail.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MEDIAMTX_VERSION=v1.19.2
MEDIAMTX_SHA256_AMD64=f9c601cc303ceca8fad2883917b022882672c5bc56311e92dbceb16e5f20c60c

[ "$(id -u)" = 0 ] || { echo "ОШИБКА: запустите через sudo" >&2; exit 1; }

if ! command -v cargo >/dev/null 2>&1 && [ -n "${SUDO_USER:-}" ] \
  && [ -x "/home/$SUDO_USER/.cargo/bin/cargo" ]; then
  export PATH="/home/$SUDO_USER/.cargo/bin:$PATH"
fi
[ -x "$HOME/.cargo/bin/cargo" ] && export PATH="$HOME/.cargo/bin:$PATH"

echo "== зависимости =="
export DEBIAN_FRONTEND=noninteractive
APT_PKGS=()
command -v curl    >/dev/null || APT_PKGS+=(curl)
command -v nginx   >/dev/null || APT_PKGS+=(nginx)
command -v certbot >/dev/null || APT_PKGS+=(certbot)
command -v ffmpeg  >/dev/null || APT_PKGS+=(ffmpeg)
command -v cc      >/dev/null || APT_PKGS+=(build-essential)
if [ ${#APT_PKGS[@]} -gt 0 ]; then
  echo "   ставлю: ${APT_PKGS[*]}"
  apt-get update -q
  apt-get install -y -q "${APT_PKGS[@]}"
fi

node_ok() {
  command -v node >/dev/null 2>&1 \
    && node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)'
}
if ! node_ok; then
  echo "   ставлю node 22 (nodesource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "   ставлю rust (rustup, minimal)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "ОШИБКА: не найден '$1' - установите его" >&2; exit 1; }; }
need node; need npm; need cargo; need ffmpeg; need nginx; need curl; need certbot

echo "== сборка бэкенда (release) =="
( cd "$ROOT/backend" && cargo build --release --quiet )

echo "== сборка фронтенда =="
( cd "$ROOT/frontend" && npm ci --no-audit --no-fund && npx next build )

echo "== MediaMTX $MEDIAMTX_VERSION =="
MTX="$ROOT/media/.cache/mediamtx"
if [ ! -x "$MTX" ] || ! "$MTX" --version | grep -qx "$MEDIAMTX_VERSION"; then
  mkdir -p "$ROOT/media/.cache"
  tar="$ROOT/media/.cache/mtx.tar.gz"
  curl -fsSL -o "$tar" \
    "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_amd64.tar.gz"
  echo "$MEDIAMTX_SHA256_AMD64  $tar" | sha256sum -c -
  tar xzf "$tar" -C "$ROOT/media/.cache" mediamtx
  rm -f "$tar"
fi

echo "== пользователь и данные =="
id -u liveme >/dev/null 2>&1 || useradd --system --home "$ROOT" --shell /usr/sbin/nologin liveme
mkdir -p "$ROOT/data/uploads"
if [ ! -f /etc/liveme/env ]; then
  mkdir -p /etc/liveme
  PASS="$(head -c 128 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 20)"
  cat > /etc/liveme/env <<EOF
ADMIN_PASSWORD=$PASS
LIVEME_DATA=$ROOT/data
EOF
  chmod 600 /etc/liveme/env
  echo
  echo "  ПАРОЛЬ КАБИНЕТА: $PASS"
  echo "  (сохранён в /etc/liveme/env - поменяйте там при желании)"
  echo
fi
chown -R liveme:liveme "$ROOT/data"
chown -R liveme:liveme "$ROOT/frontend/.next"

d="$ROOT"
while [ "$d" != "/" ]; do
  if ! sudo -u liveme test -x "$d" 2>/dev/null; then
    if command -v setfacl >/dev/null 2>&1; then
      setfacl -m u:liveme:--x "$d"
    else
      chmod o+x "$d"
    fi
    echo "   traverse-доступ для liveme: $d"
  fi
  d="$(dirname "$d")"
done

echo "== systemd-юниты =="
NODE_BIN="$(command -v node)"
for unit in liveme-backend liveme-mediamtx liveme-frontend; do
  sed -e "s|@APP_DIR@|$ROOT|g" -e "s|@DOMAIN@|$DOMAIN|g" -e "s|@NODE@|$NODE_BIN|g" \
    "$ROOT/deploy/$unit.service" > "/etc/systemd/system/$unit.service"
done
systemctl daemon-reload
systemctl enable liveme-backend liveme-mediamtx liveme-frontend >/dev/null

echo "== TCP: раздача эфира дальнему зрителю =="

install -d -m 755 /etc/sysctl.d
cat > /etc/sysctl.d/99-liveme.conf <<'SYSCTL'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_slow_start_after_idle = 0
net.core.somaxconn = 4096
SYSCTL
modprobe tcp_bbr 2>/dev/null || true
sysctl -q --system
echo "   cc=$(sysctl -n net.ipv4.tcp_congestion_control)" \
     "qdisc=$(sysctl -n net.core.default_qdisc)" \
     "slow_start_after_idle=$(sysctl -n net.ipv4.tcp_slow_start_after_idle)"

echo "== nginx =="
mkdir -p /var/www/certbot
SITE_AVAIL=/etc/nginx/sites-available/liveme
SITE_ENABLED=/etc/nginx/sites-enabled/liveme

if [ ! -e "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "== выпускаю сертификат Let's Encrypt для $DOMAIN =="
  sed "s|@DOMAIN@|$DOMAIN|g" "$ROOT/deploy/nginx-http.conf" > "$SITE_AVAIL"
  ln -sf "$SITE_AVAIL" "$SITE_ENABLED"
  nginx -t
  systemctl reload nginx || systemctl start nginx
  certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" \
  || certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
fi

sed "s|@DOMAIN@|$DOMAIN|g" "$ROOT/deploy/nginx.conf" > "$SITE_AVAIL"
ln -sf "$SITE_AVAIL" "$SITE_ENABLED"
nginx -t
systemctl reload nginx || systemctl start nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "== ufw: 80,443/tcp и 8189/udp (WebRTC) =="
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 8189/udp >/dev/null
fi

echo "== запуск сервисов =="
systemctl restart liveme-backend liveme-mediamtx liveme-frontend
sleep 2
for s in liveme-backend liveme-mediamtx liveme-frontend; do
  systemctl is-active --quiet "$s" \
    && echo "  OK: $s" \
    || { echo "  ОШИБКА: $s не поднялся - смотрите: journalctl -u $s -n 50" >&2; exit 1; }
done

echo
echo "Готово: https://$DOMAIN (кабинет: https://$DOMAIN/admin)"
echo "Обновление в будущем: git pull && sudo ./deploy/deploy.sh"
