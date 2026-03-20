#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/infra/env.example}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

echo "==> Using env file: ${ENV_FILE}"
echo "==> Python tests"
(
  cd "${ROOT_DIR}"
  pytest
)

echo "==> Python syntax validation"
(
  cd "${ROOT_DIR}"
  python3 -m compileall services workers tests
)

echo "==> Docker compose config validation"
(
  cd "${ROOT_DIR}"
  docker compose --env-file "${ENV_FILE}" -f infra/docker-compose.yml config >/dev/null
)

echo "==> Studio Brain UI source validation"
for path in \
  "${ROOT_DIR}/apps/studio-brain-ui/index.html" \
  "${ROOT_DIR}/apps/studio-brain-ui/src/main.tsx" \
  "${ROOT_DIR}/apps/studio-brain-ui/src/App.tsx" \
  "${ROOT_DIR}/apps/studio-brain-ui/tsconfig.json" \
  "${ROOT_DIR}/apps/studio-brain-ui/vite.config.ts"; do
  if [[ ! -f "${path}" ]]; then
    echo "Missing UI source file: ${path}" >&2
    exit 1
  fi
done

echo "==> Validation complete"
