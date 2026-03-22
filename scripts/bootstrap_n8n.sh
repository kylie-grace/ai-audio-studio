#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-infra/.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml)

read_env_value() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
target = sys.argv[2]
for line in env_path.read_text().splitlines():
    if not line or line.lstrip().startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if key.strip() == target:
        print(value.strip())
        break
PY
}

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

POSTGRES_USER_VALUE="$(read_env_value POSTGRES_USER || true)"
N8N_DB_VALUE="$(read_env_value N8N_DB || true)"
POSTGRES_USER_VALUE="${POSTGRES_USER_VALUE:-studio}"
N8N_DB_VALUE="${N8N_DB_VALUE:-n8ndb}"

EXISTING_WORKFLOW_NAMES="$("${COMPOSE[@]}" exec -T postgres psql -U "${POSTGRES_USER_VALUE}" -d "${N8N_DB_VALUE}" -At -c "select name from workflow_entity")"
MISSING_WORKFLOW_FILES="$(
  EXISTING_WORKFLOW_NAMES="${EXISTING_WORKFLOW_NAMES}" python3 - <<'PY'
import json
import os
from pathlib import Path

existing = {line.strip() for line in os.environ.get("EXISTING_WORKFLOW_NAMES", "").splitlines() if line.strip()}
for path in sorted((Path("infra") / "n8n" / "workflows").glob("*.json")):
    data = json.loads(path.read_text())
    if data["name"] not in existing:
        print(path.name)
PY
)"

if [[ -n "${MISSING_WORKFLOW_FILES}" ]]; then
  echo "Importing missing packaged workflows..."
  while IFS= read -r workflow_file; do
    [[ -n "${workflow_file}" ]] || continue
    "${COMPOSE[@]}" exec -T n8n n8n import:workflow --input="/workflows/${workflow_file}"
  done <<< "${MISSING_WORKFLOW_FILES}"
fi

echo "Reconciling packaged workflow activation state..."
SQL_STATEMENTS="$(
  python3 - <<'PY'
import json
from pathlib import Path

for path in sorted((Path("infra") / "n8n" / "workflows").glob("*.json")):
    data = json.loads(path.read_text())
    name = str(data["name"]).replace("'", "''")
    active = "true" if data.get("active") else "false"
    print(f"UPDATE workflow_entity SET active = {active}, \"updatedAt\" = CURRENT_TIMESTAMP WHERE name = '{name}';")
PY
)"

if [[ -n "${SQL_STATEMENTS}" ]]; then
  "${COMPOSE[@]}" exec -T postgres psql \
    -U "${POSTGRES_USER_VALUE}" \
    -d "${N8N_DB_VALUE}" \
    -v ON_ERROR_STOP=1 \
    -c "${SQL_STATEMENTS}"
fi
