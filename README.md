# AI Audio Studio Platform

> **Active build, not production-ready.** The repository now contains a working control-plane baseline with DB-backed services, worker registration, and remote-task plumbing, but it is still under construction. Treat it as an MVP foundation for a single powerful Mac or a Mac mini plus optional studio Mac worker, not a finished production system.

Automated studio operations platform for independent recording studios. Reduces admin overhead by 80-90% while maintaining human control over all creative, financial, and client-facing decisions.

## Architecture

Single-machine first, split-worker optional:
- **Single Mac mode** — one Mac runs the whole Docker stack locally, including UI, n8n, Ollama, Postgres, APIs, and orchestration.
- **Split mode** — the Mac mini runs the control plane and a second Mac runs `studio-worker` for filesystem-heavy or DAW-adjacent tasks.
- **Shared volume** — `/Volumes/StudioShare/` or equivalent shared mount visible to any machine executing file tasks.
- **LAN access** — set `BIND_HOST=0.0.0.0` to expose the dashboard and APIs to the local network.

## Quick Start

### Prerequisites
- Docker Desktop installed and running
- Minimum 16 GB RAM on Mac mini (Ollama needs ~10 GB for the planner model)
- Shared volume mounted at `/Volumes/StudioShare/`
- If you want LAN access, set `BIND_HOST=0.0.0.0` in `infra/.env`

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

# 4. Start the control plane on the local Mac
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# 5. Optional: start the studio worker on a second Mac
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d

# 6. Verify all services healthy
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
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

# If BIND_HOST=0.0.0.0, access from another machine with:
# http://<mac-mini-lan-ip>:3000
```

Single-machine mode does not require `docker-compose.worker.yml`; the worker file is only for split deployments.

### Headless Validation

```bash
bash scripts/preflight_env.sh infra/.env
bash scripts/validate_stack.sh infra/env.example
```

Current validation is headless and MVP-oriented:
- unit and API tests
- Python syntax compilation
- Docker Compose config resolution
- control-plane health checks
- Studio Brain UI source completeness checks

## Service Map

| Service | Port | Purpose |
|---------|------|---------|
| `studio-brain-ui` | 3000 | Placeholder UI shell for the future approval queue/dashboard |
| `n8n` | 5678 | Workflow automation and webhooks |
| `project-state` | 8080 | Job state, approval queue, audit log |
| `crm-api` | 8090 | Lead and project records |
| `openclaw` | 8100 | Orchestration engine |
| `content-pipeline` | 8110 | Social caption drafting |
| `audio-qc` | 8120 | Loudness, peak, phase validation |
| `lead-intake` | 8130 | Lead normalization and draft replies |
| `inbox-triage` | 8140 | Gmail read-only classification |
| `session-prep` | 8150 | Stem validation and session organization |
| `revision-parser` | 8160 | Natural language → DAW change objects |
| `delivery-packager` | 8170 | QC-gated delivery bundle assembly |
| `studio-worker` | 8190 | Optional remote studio Mac task agent |
| `ollama` | 11434 | Local LLM serving |
| `postgres` | 5432 | Shared database (internal only) |

## Implementation Status

Implemented or partially implemented:
- `project-state` API, schema, FSM, approval routes, audit restrictions
- `project-state` worker registry and remote task queue
- `crm-api` style-profile ingestion for pasted text and file-backed references
- `openclaw` policy helper plus DB-backed orchestration rules
- effort-level gating helper
- audio QC threshold presets
- Docker service graph and prompt/task scaffolding
- studio worker service for optional remote file-task execution

Still incomplete:
- live approval queue UI and worker health widgets
- full single-machine execution parity across the stack
- full OpenClaw execution against all email/content modules
- richer style-profile extraction and per-client/per-project context layering
- audio QC remote execution and DAW automation hooks
- n8n workflow JSONs and end-to-end inbound automations

## Five Core Modules

1. **Lead Intake** — Form/DM/email → normalized lead → draft reply → approval queue
2. **Inbox Triage** — Gmail read-only → classify → draft response → approval queue
3. **Social/Content Pipeline** — Brief → draft captions → asset packaging → approval queue
4. **Session Prep & Audio QC** — Stems → validate → organize → LUFS/peak/phase report
5. **Mix Planner & Revision Parser** — Notes → parameterized changes → SoundFlow/ReaScript

## New Control-Plane Primitives

- **Style Profiles**: paste tone guidance, point at reference files, or combine both through `crm-api /style-profiles`
- **Orchestration Rules**: configure OpenClaw routing contracts through `openclaw /rules`
- **Studio Worker Queue**: enqueue bounded remote tasks in `project-state /workers/tasks`
- **Studio Worker Agent**: run `infra/docker-compose.worker.yml` only when you want a second Mac to claim and execute tasks
- **Auto-seeded defaults**: CRM seeds a baseline studio tone profile and OpenClaw seeds email/content routing rules on startup

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

# Headless repo validation from the host
bash scripts/validate_stack.sh infra/env.example

# View logs
docker compose -f infra/docker-compose.yml logs -f openclaw

# Restart a single service
docker compose -f infra/docker-compose.yml restart project-state

# Apply DB migrations (idempotent)
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U studio -d studiodb -f /docker-entrypoint-initdb.d/init.sql
```

## Deployment Modes

Use single-machine mode when one Mac should do everything locally:
- Start `infra/docker-compose.yml`
- Leave `infra/docker-compose.worker.yml` stopped
- Keep all tasks on the local machine unless you explicitly need a second node

Use split mode when you want a dedicated worker Mac:
- Start `infra/docker-compose.yml` on the control-plane machine
- Start `infra/docker-compose.worker.yml` on the worker machine
- Point `MAC_MINI_BASE_URL` at the control-plane host and share the same project paths

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
