#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
F=http://localhost:3000

pass=0; fail=0
ok()  { echo "  PASS: $1"; pass=$((pass+1)); }
bad() { echo "  FAIL: $1"; fail=$((fail+1)); }

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

if ! curl -s -o /dev/null -m 2 "$F"; then
  echo "== стек не запущен — поднимаю сам =="
  "$ROOT/scripts/dev.sh" > /tmp/liveme-dev.log 2>&1 & PIDS+=($!)
  for _ in $(seq 1 60); do curl -s -o /dev/null -m 2 "$F" && break; sleep 1; done
fi

echo "== страницы отвечают =="
for p in / /admin; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$F$p")
  [ "$code" = 200 ] && ok "GET $p → 200" || bad "GET $p → $code"
done

echo "== API через next-прокси =="
cj=$(mktemp)
curl -s -o /dev/null -w '' -c "$cj" -X POST "$F/api/login" \
  -H 'Content-Type: application/json' -d '{"password":"wrong"}'
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$F/api/login" \
  -H 'Content-Type: application/json' -d '{"password":"wrong"}')
[ "$code" = 401 ] && ok "login неверный → 401" || bad "login неверный → $code"
tok=$(curl -s -c "$cj" -X POST "$F/api/login" -H 'Content-Type: application/json' \
  -d "{\"password\":\"${ADMIN_PASSWORD:-abdi2008}\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
[ -n "$tok" ] && ok "login верный → токен" || bad "login верный: токена нет"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$cj" -X PUT "$F/api/content" \
  -H 'Content-Type: application/json' -d '{"html":"<h2>e2e</h2><p>тест</p>"}')
[ "$code" = 200 ] && ok "PUT content (auth) → 200" || bad "PUT content → $code"
curl -s "$F/api/content" | grep -q 'e2e' && ok "GET content отдаёт свежее" || bad "content не обновился"
curl -s -X POST "$F/api/react" -H 'Content-Type: application/json' -d '{"emoji":"🔥"}' \
  | grep -q ok && ok "реакция принята" || bad "реакция не прошла"

echo "== publish без токена отклоняется =="
timeout 8 ffmpeg -hide_banner -loglevel error -re -f lavfi -i testsrc2 -f lavfi -i sine \
  -t 3 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a libopus -ac 2 \
  -f whip "http://127.0.0.1:8889/live/main/whip" >/dev/null 2>&1
[ "$(curl -s "$F/api/stream" | python3 -c 'import json,sys; print(json.load(sys.stdin)["is_live"])')" = "False" ] \
  && ok "is_live остался false" || bad "поток без токена прошёл!"

echo "== эфир: ffmpeg-WHIP с токеном через next-прокси =="
(timeout 25 curl -sN "$F/api/events" > /tmp/liveme-sse.txt 2>/dev/null &)
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -tune zerolatency -b:v 2000k -g 60 -pix_fmt yuv420p \
  -c:a libopus -b:a 64k -ac 2 \
  -f whip "$F/whip?token=$tok" > /tmp/liveme-pub.log 2>&1 &
PUB=$!; PIDS+=($PUB)
live=""
for _ in $(seq 1 15); do
  sleep 1
  [ "$(curl -s "$F/api/stream" | python3 -c 'import json,sys; print(json.load(sys.stdin)["is_live"])' 2>/dev/null)" = "True" ] && { live=1; break; }
done
[ -n "$live" ] && ok "publish принят → is_live:true" || bad "is_live не стал true (см. /tmp/liveme-pub.log)"

sleep 4
codecs=$(timeout 20 ffprobe -v error -show_entries stream=codec_name -of csv "$F/aac/main/index.m3u8" 2>/dev/null | sort -u)
grep -q h264 <<<"$codecs" && grep -q aac <<<"$codecs" \
  && ok "LL-HLS через next-прокси: h264+aac" || bad "кодеки: $(tr '\n' ' ' <<<"$codecs")"
vol=$(timeout 30 ffmpeg -hide_banner -t 3 -i "$F/aac/main/index.m3u8" -map 0:a:0 -af volumedetect -f null - 2>&1 \
  | grep -oP 'mean_volume: \K-?[0-9.]+' || echo "")
[ -n "$vol" ] && ok "звук декодируется (mean $vol dB)" || bad "звук не декодируется"

echo "== обрыв → офлайн =="
kill $PUB 2>/dev/null; sleep 4
[ "$(curl -s "$F/api/stream" | python3 -c 'import json,sys; print(json.load(sys.stdin)["is_live"])')" = "False" ] \
  && ok "is_live вернулся в false" || bad "is_live не сбросился"
grep -q '"is_live":true' /tmp/liveme-sse.txt && grep -q '"is_live":false' /tmp/liveme-sse.txt \
  && ok "SSE донёс live:true и live:false" || bad "SSE не донёс события live"

echo
echo "ИТОГ: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
