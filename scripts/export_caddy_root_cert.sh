#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-infra/.env}"
OUTPUT_PATH="${2:-infra/caddy-root.crt}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

CONTAINER_ID="$(
  docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml -f infra/docker-compose.edge.yml ps -q caddy
)"

if [[ -z "$CONTAINER_ID" ]]; then
  echo "caddy container is not running" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
docker cp "$CONTAINER_ID:/data/caddy/pki/authorities/local/root.crt" "$OUTPUT_PATH"
echo "exported $OUTPUT_PATH"
