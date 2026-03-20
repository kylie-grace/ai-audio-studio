# ADR 003 — Local Model Selection (Ollama)

**Status:** Accepted
**Date:** 2026-03-20

## Context
All LLM calls must run locally (privacy, no client data to cloud). Need to balance
capability vs RAM constraints on Mac mini (16-32 GB target).

## Decision
Three-model strategy:

| Role | Model | RAM | Used by |
|------|-------|-----|---------|
| Planner / Drafter | `qwen2.5:14b-instruct` | ~10 GB | Lead intake drafter, revision parser, social captions |
| Classifier / Router | `qwen2.5:3b` | ~2 GB | Inbox classifier, lead normalizer (fast path) |
| Embeddings | `nomic-embed-text` | ~1 GB | Project memory, retrieval (optional Phase 2) |

Model names are env-var driven (`PLANNER_MODEL`, `CLASSIFIER_MODEL`) — swap without
code changes.

## Alternatives Considered
- `llama3.2:3b` for classifier — similar capability, chosen qwen2.5 for instruction following
- Cloud fallback (OpenAI) — rejected: client data must stay local
- Single model for all roles — rejected: latency and cost on Mac mini

## Consequences
- System requires ~13 GB RAM for models alone; Mac mini needs ≥16 GB
- First `docker compose up` requires pulling ~8 GB of model data
- Model quality is lower than GPT-4o for complex reasoning — prompt engineering required
- Upgrading models requires only env var change + `pull_models.sh` re-run
