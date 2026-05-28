#!/usr/bin/env sh
set -eu

run_seed="${RUN_SEED:-false}"
skip_backup="${SKIP_BACKUP:-false}"

if [ ! -f .env ]; then
  echo "Missing deploy/staging/.env. Copy .env.example first." >&2
  exit 1
fi

set -a
. ./.env
set +a

required_vars="ORBI_API_DOMAIN ORBI_ADMIN_DOMAIN POSTGRES_PASSWORD PAYMENTS_WEBHOOK_SECRET DOCUMENT_SIGNING_SECRET"
for name in $required_vars; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
done

if [ "$skip_backup" != "true" ] && docker compose ps db --status running >/dev/null 2>&1; then
  sh ./backup-postgres.sh || echo "Backup skipped or failed; continuing deploy." >&2
fi

docker compose up -d --build

if [ "$run_seed" = "true" ]; then
  docker compose run --rm seed
fi

api_url="https://$ORBI_API_DOMAIN/api/v1/health/ready"
admin_url="https://$ORBI_ADMIN_DOMAIN"

echo "Checking API: $api_url"
for attempt in $(seq 1 30); do
  if curl -fsS "$api_url" | grep -q '"status":"ready"'; then
    echo "API ready."
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "API did not become ready." >&2
    exit 1
  fi

  sleep 3
done

echo "Checking admin: $admin_url"
curl -fsSI "$admin_url" >/dev/null
echo "Staging deploy complete."
