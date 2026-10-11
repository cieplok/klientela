#!/bin/sh
# Nightly SQLite backup for the salon server.
#
# Safe for a live WAL database: uses `sqlite3 .backup` when available, which takes a
# consistent snapshot without stopping the server. Falls back to a plain copy only
# when sqlite3 is missing (note: that can miss recent WAL commits).
#
# Schedule it (e.g. 03:30 daily) on the host or in a sidecar:
#   30 3 * * *  DB_PATH=/data/klientela.db BACKUP_DIR=/data/backups /path/to/scripts/backup-db.sh
set -eu

DB_PATH="${DB_PATH:-./data/klientela.db}"
BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%d-%H%M%S)
DEST="$BACKUP_DIR/$(basename "$DB_PATH" .db)-$STAMP.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  echo "sqlite3 not found; falling back to a file copy (WAL commits since the last checkpoint may be missed)" >&2
  cp "$DB_PATH" "$DEST"
fi

# Prune backups older than the retention window.
find "$BACKUP_DIR" -type f -name '*.db' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "Backup written: $DEST"
