#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/infra/.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  echo "Copy infra/env.example to infra/.env and fill in required values." >&2
  exit 1
fi

required_vars=(
  POSTGRES_PASSWORD
  N8N_PASSWORD
)

path_vars=(
  SHARED_PROJECTS_PATH
  DELIVERY_PATH
)

for key in "${required_vars[@]}"; do
  value="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
  if [[ -z "${value}" ]]; then
    echo "Required env var ${key} is missing or empty in ${ENV_FILE}" >&2
    exit 1
  fi
done

for key in "${path_vars[@]}"; do
  value="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
  if [[ -n "${value}" && "${value}" = /* && ! -d "${value}" ]]; then
    echo "Configured path ${key} does not exist on this host: ${value}" >&2
    exit 1
  fi
done

echo "Preflight env check passed for ${ENV_FILE}"
