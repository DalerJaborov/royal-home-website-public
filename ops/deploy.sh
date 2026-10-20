#!/usr/bin/env bash
# Обновление сайта royalhome.tj на проде: git pull + пересборка + очистка
# кэша Cloudflare. Запуск на VPS из каталога проекта (/opt/royalhome-site):
#   ./ops/deploy.sh
#
# Без этого шага Cloudflare может неделями отдавать старую (или битую —
# см. инцидент с og-image.jpg и logo_royal.webp) версию статики с одного из
# граничных узлов, даже когда сервер уже отдаёт новый файл. CF_API_TOKEN и
# CF_ZONE_ID — в .env.production (не в git), токен с правом Zone/Cache Purge.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# shellcheck disable=SC1091
[ -f .env.production ] && source .env.production

if [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
  response="$(curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}')"
  if echo "$response" | grep -q '"success":true'; then
    echo "[deploy] Cloudflare cache purged"
  else
    echo "[deploy][WARN] Cloudflare purge failed: $response" >&2
  fi
else
  echo "[deploy][WARN] CF_API_TOKEN/CF_ZONE_ID не заданы в .env.production — кэш Cloudflare не очищен" >&2
fi
