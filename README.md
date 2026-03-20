# AI Audio Studio Platform

Automated studio operations platform for Maggie's recording studio. Reduces admin overhead by 80-90% while maintaining human control over all creative, financial, and client-facing decisions.

## Architecture

Two-machine system:
- **Mac mini (Studio Brain)** — always-on Docker stack: n8n, Ollama, OpenClaw, all services
- **Mac Pro (Production Workstation)** — Pro Tools, REAPER, SoundFlow for actual audio work
- **Shared volume** — `/Volumes/StudioShare/` connects both machines

## Quick Start

### Prerequisites
- Docker Desktop installed and running
- Minimum 16 GB RAM on Mac mini (Ollama needs ~10 GB for the planner model)
- Shared volume mounted at `/Volumes/StudioShare/`

### First-time setup

```bash
# 1. Clone and enter the repo
git clone <repo-url> studio-ai-platform
cd studio-ai-platform

# 2. Configure environment
cp infra/env.example infra/.env
# Edit infra/.env and fill in all required values

# 3. Pull Ollama models (takes 10-30 min depending on connection)
bash services/ollama/pull_models.sh

# 4. Start the full stack
docker compose -f infra/docker-compose.yml up -d

# 5. Verify all services healthy
docker compose -f infra/docker-compose.yml ps
```

### Verify health

```bash
curl http://localhost:5678/healthz          # n8n
curl http://localhost:8080/health           # project-state
curl http://localhost:8090/health           # crm-api
curl http://localhost:8100/health           # openclaw
curl http://localhost:11434/api/tags        # ollama (lists loaded models)
open http://localhost:3000                  # studio-brain-ui
open http://localhost:5678                  # n8n workflow editor
```

## Service Map

| Service | Port | Purpose |
|---------|------|---------|
| `studio-brain-ui` | 3000 | Internal approval queue dashboard |
| `n8n` | 5678 | Workflow automation and webhooks |
| `project-state` | 8080 | Job state, approval queue, audit log |
| `crm-api` | 8090 | Lead and project records |
| `openclaw` | 8100 | Orchestration engine |
| `content-pipeline` | 8110 | Social caption drafting |
| `audio-qc` | 8120 | Loudness, peak, phase validation |
| `ollama` | 11434 | Local LLM serving |
| `postgres` | 5432 | Shared database (internal only) |

## Five Core Modules

1. **Lead Intake** — Form/DM/email → normalized lead → draft reply → approval queue
2. **Inbox Triage** — Gmail read-only → classify → draft response → approval queue
3. **Social/Content Pipeline** — Brief → draft captions → asset packaging → approval queue
4. **Session Prep & Audio QC** — Stems → validate → organize → LUFS/peak/phase report
5. **Mix Planner & Revision Parser** — Notes → parameterized changes → SoundFlow/ReaScript

## Safety Model

All AI actions require explicit human approval before anything is sent or executed:

| Tier | What it can do | Examples |
|------|---------------|---------|
| 1 (Read) | Read files and state | File watching, inbox reading |
| 2 (Draft) | Write drafts to queue | Email drafts, social captions |
| 3 (Queue) | Add to approval queue | Lead responses, revision plans |
| 4 (Narrow Auto) | Pre-approved bounded actions | File organization, session prep |

**The system fails closed.** Missing approval → action blocked, never proceeds.

## Development

```bash
# Run tests
docker compose -f infra/docker-compose.yml run --rm project-state pytest
docker compose -f infra/docker-compose.yml run --rm audio-qc pytest

# View logs
docker compose -f infra/docker-compose.yml logs -f openclaw

# Restart a single service
docker compose -f infra/docker-compose.yml restart project-state

# Apply DB migrations (idempotent)
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U studio -d studiodb -f /docker-entrypoint-initdb.d/init.sql
```

## Task Files

Numbered task files in `tasks/` define the implementation sequence for AI agents:

```
tasks/001-bootstrap-stack.md      ← Start here
tasks/010-lead-intake.md
tasks/020-inbox-draft-queue.md
tasks/030-social-draft-pipeline.md
tasks/040-project-state-service.md
tasks/050-session-prep.md
tasks/060-audio-qc.md
tasks/070-revision-parser.md
tasks/080-policy-guardrails.md
```

Each task file contains: purpose, dependencies, file list, input/output contracts, security constraints, and acceptance tests.

## Docs

- `docs/architecture/` — ADRs, system diagrams, prompt contracts
- `docs/runbooks/` — Operator procedures and safety checklists
