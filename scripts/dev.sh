#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MEDIAMTX_VERSION=v1.19.2
MEDIAMTX_SHA256_AMD64=f9c601cc303ceca8fad2883917b022882672c5bc56311e92dbceb16e5f20c60c

for port in 3000 8080 8554 8888 8889 9997; do
  if ss -tln 2>/dev/null | grep -qE ":${port}\s"; then
    echo "ОШИБКА: порт :$port уже занят — погасите старый процесс (ss -tlnp | grep $port)" >&2
    exit 1
  fi
done

MTX="${MEDIAMTX_BIN:-$ROOT/media/.cache/mediamtx}"
if [ ! -x "$MTX" ] || ! "$MTX" --version | grep -qx "$MEDIAMTX_VERSION"; then
  echo "== скачиваю MediaMTX $MEDIAMTX_VERSION =="
  mkdir -p "$ROOT/media/.cache"
  tar="$ROOT/media/.cache/mtx.tar.gz"
  curl -fsSL -o "$tar" \
    "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_amd64.tar.gz"
  echo "$MEDIAMTX_SHA256_AMD64  $tar" | sha256sum -c -
  tar xzf "$tar" -C "$ROOT/media/.cache" mediamtx
  rm -f "$tar"
  MTX="$ROOT/media/.cache/mediamtx"
fi

( cd "$ROOT/backend" && cargo build --quiet )
[ -d "$ROOT/frontend/node_modules" ] || ( cd "$ROOT/frontend" && npm install )

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

( cd "$ROOT" && exec ./backend/target/debug/liveme-backend ) & PIDS+=($!)
( cd "$ROOT" && exec "$MTX" media/mediamtx.yml ) & PIDS+=($!)
( cd "$ROOT/frontend" && exec npx next dev ) & PIDS+=($!)

echo
echo "  главная:  http://localhost:3000"
echo "  кабинет:  http://localhost:3000/admin"
echo
wait
