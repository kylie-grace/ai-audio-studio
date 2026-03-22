#!/bin/bash
# Start Ollama as a native macOS process for Apple Silicon Metal acceleration
set -e
if ! command -v ollama &>/dev/null; then
  echo "Ollama not found. Install with: brew install ollama" >&2
  exit 1
fi
ollama serve &
sleep 3
ollama pull qwen2.5:14b-instruct
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
echo "Ollama ready at http://localhost:11434"
