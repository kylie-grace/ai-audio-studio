#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-infra/.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml)

if ! container_id="$("${COMPOSE[@]}" ps -q n8n)"; then
  echo "Unable to inspect the n8n service. Start the control plane first with docker compose up -d." >&2
  exit 1
fi

if [[ -z "$container_id" ]]; then
  echo "The n8n service is not running. Start the control plane first with docker compose up -d." >&2
  exit 1
fi

echo "Waiting for n8n to become healthy..."
for attempt in {1..30}; do
  health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  if [[ "$health_state" == "healthy" ]]; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "Timed out waiting for n8n to become healthy. Current state: $health_state" >&2
    exit 1
  fi
  sleep 2
done

"${COMPOSE[@]}" exec -T n8n node /bootstrap/import-workflows.mjs
