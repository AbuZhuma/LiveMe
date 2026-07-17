#!/usr/bin/env bash
set -u
curl -sS -m 3 -X POST http://127.0.0.1:8080/internal/hooks/ready || true

exec ffmpeg -hide_banner -loglevel warning -nostdin \
  -fflags +genpts -use_wallclock_as_timestamps 1 \
  -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/live/main" \
  -map 0:v:0 -map '0:a:0?' \
  -c:v copy \
  -c:a aac -b:a 96k -ar 48000 -ac 2 \
  -af aresample=async=1:first_pts=0 \
  -f rtsp -rtsp_transport tcp "rtsp://127.0.0.1:8554/aac/main"
