#!/usr/bin/env bash
# Pull required Ollama models into the running Ollama container.
# Run once after first `docker compose up -d`.
# Safe to re-run: Ollama skips already-downloaded models.

set -euo pipefail

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

echo "Waiting for Ollama to be ready..."
until curl -sf "${OLLAMA_URL}/api/tags" > /dev/null; do
  sleep 2
done
echo "Ollama is ready."

pull_model() {
  local model="$1"
  echo "Pulling ${model}..."
  local result
  result=$(curl -sf -X POST "${OLLAMA_URL}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${model}\"}" \
    | tail -1)
  if ! echo "$result" | grep -q '"status":"success"'; then
    echo "ERROR: Failed to pull ${model}. Last response: ${result}" >&2
    exit 1
  fi
  echo "Done: ${model}"
}

# Pull in priority order (largest first so we fail fast if RAM is insufficient)
pull_model "${PLANNER_MODEL:-qwen2.5:14b-instruct}"
pull_model "${CLASSIFIER_MODEL:-qwen2.5:3b}"
pull_model "${EMBEDDING_MODEL:-nomic-embed-text}"

echo ""
echo "All models pulled successfully. Verify with:"
echo "  curl http://localhost:11434/api/tags | python3 -m json.tool"
