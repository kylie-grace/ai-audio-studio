# ADR 001 — OpenClaw Scope and Role

**Status:** Accepted
**Date:** 2026-03-20

## Context
We need an orchestration layer that decides which worker to invoke for a given trigger,
enforces permission tiers, and maintains policy isolation between modules. Options
considered: direct n8n orchestration, Claude Code as runtime agent, custom router.

## Decision
OpenClaw is a lightweight Python FastAPI service that:
1. Receives normalized job envelopes from n8n
2. Validates the job against the policy layer (permission tier, blocklist)
3. Selects and calls the appropriate worker
4. Does NOT hold business logic — workers do
5. Does NOT persist state — project-state service does
6. Uses Ollama for any routing decisions that require language understanding

OpenClaw does NOT directly invoke Claude Cloud API. All LLM calls go to local Ollama.

## Consequences
- Policy enforcement is centralized and auditable
- Workers are independently deployable and testable
- Adding a new module requires: new worker + new OpenClaw route + new n8n workflow
- OpenClaw is a potential single point of failure — it must be kept simple and stateless
