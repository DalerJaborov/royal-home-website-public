#!/usr/bin/env bash
# Ежедневный бэкап сайта royalhome.tj: дамп MySQL + архив загруженных фото.
# Запуск на VPS из каталога проекта (/opt/royalhome-site):
#   crontab -e  →  30 3 * * * /opt/royalhome-site/ops/backup.sh >> /var/log/site-backup.log 2>&1
#
# Telegram-алерт при сбое использует /opt/watchdog.env (TELEGRAM_BOT_TOKEN,
# TELEGRAM_CHAT_ID) — тот же файл, что и ops/health-watchdog.sh.
set -u -o pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker-compose.prod.yml"
BACKUP_DIR="${SITE_BACKUP_DIR:-/backups/site}"
KEEP_DAYS="${SITE_BACKUP_KEEP_DAYS:-30}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"

alert() {
  echo "[backup][ERROR] $1" >&2
  if [ -f /opt/watchdog.env ]; then
    # shellcheck disable=SC1091
    . /opt/watchdog.env
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
      curl -s -o /dev/null --max-time 10 \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d text="⚠️ Site backup failed on $(hostname): $1"
    fi
  fi
  exit 1
}

# 1. Дамп базы. MYSQL_ROOT_PASSWORD внутри самого контейнера mysql может быть
#    пустой (docker compose up без --env-file не подставляет ${VAR} при
#    создании контейнера, хотя реальный пароль в БД остался прежним) —
#    поэтому читаем пароль из .env.production на хосте и передаём в exec
#    явно (-e), не печатая его в лог/аргументы команды.
$COMPOSE exec -T -e MYSQL_ROOT_PASSWORD="$(grep '^MYSQL_ROOT_PASSWORD=' "$REPO_DIR/.env.production" | cut -d= -f2-)" \
  mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction royalhome' \
  | gzip > "$BACKUP_DIR/site-db-$STAMP.sql.gz" \
  || alert "mysqldump failed"
[ -s "$BACKUP_DIR/site-db-$STAMP.sql.gz" ] || alert "db dump is empty"

# 2. Загруженные фото (Docker-том uploads, смонтирован в app как /app/uploads).
$COMPOSE exec -T app tar czf - -C /app uploads \
  > "$BACKUP_DIR/site-uploads-$STAMP.tar.gz" \
  || alert "uploads archive failed"

# 3. Ротация.
find "$BACKUP_DIR" -name "site-*.gz" -mtime "+$KEEP_DAYS" -delete

echo "[backup] OK $STAMP: $(du -sh "$BACKUP_DIR" | cut -f1) total in $BACKUP_DIR"
