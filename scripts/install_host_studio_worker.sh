#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv-host-worker"

python3 -m venv "${VENV_DIR}"
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install -r "${ROOT_DIR}/services/studio-worker/requirements.txt"

echo "Host studio-worker environment installed at ${VENV_DIR}"
echo "Start it with: bash scripts/start_host_studio_worker.sh"
