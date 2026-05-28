#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="./backups"
backup_file="$backup_dir/orbi-staging-$timestamp.sql.gz"

mkdir -p "$backup_dir"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$backup_file"

echo "Backup written: $backup_file"
