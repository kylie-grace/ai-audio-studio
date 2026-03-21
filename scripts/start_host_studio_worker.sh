#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv-host-worker"
ENV_FILE="${1:-${ROOT_DIR}/infra/env.example}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "Host worker virtualenv is missing. Run: bash scripts/install_host_studio_worker.sh" >&2
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ -z "${!key:-}" ]]; then
      export "${key}=${value}"
    fi
  done < "${ENV_FILE}"
fi

if [[ -z "${REAPER_BINARY_PATH:-}" && -x "/Applications/REAPER.app/Contents/MacOS/REAPER" ]]; then
  export REAPER_BINARY_PATH="/Applications/REAPER.app/Contents/MacOS/REAPER"
fi

export PROJECT_STATE_URL="${PROJECT_STATE_URL:-http://127.0.0.1:8080}"
export WORKER_PLATFORM="${WORKER_PLATFORM:-macos}"
export WORKER_SLUG="${WORKER_SLUG:-host-studio-worker}"
export WORKER_DISPLAY_NAME="${WORKER_DISPLAY_NAME:-Host Studio Worker}"
export WORKER_API_BASE_URL="${WORKER_API_BASE_URL:-http://127.0.0.1:${PORT:-8190}}"
if [[ "${WORKER_CAPABILITIES:-}" == "session-prep,revision-parser,delivery-packager" ]]; then
  unset WORKER_CAPABILITIES
fi
export WORKER_CAPABILITIES="${WORKER_CAPABILITIES:-session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript}"
export STUDIO_WORKER_DRY_RUN_DAW="${STUDIO_WORKER_DRY_RUN_DAW:-false}"
export PYTHONPATH="${ROOT_DIR}/services/studio-worker${PYTHONPATH:+:${PYTHONPATH}}"

exec "${VENV_DIR}/bin/python" -m uvicorn main:app --app-dir "${ROOT_DIR}/services/studio-worker" --host 0.0.0.0 --port "${PORT:-8190}"
