# AI Audio Studio Platform

> **Active build, not production-ready.** The repository now contains a strong control-plane MVP: Dockerized services, a live dashboard, DB-backed state, seeded orchestration rules, optional worker execution, and LAN/HTTPS access. It is still under construction as a product. Treat it as an operator-facing MVP foundation for a single powerful Mac or a Mac mini plus optional studio Mac worker, not a finished turnkey system.

Automated studio operations platform for independent recording studios. Reduces admin overhead by 80-90% while maintaining human control over all creative, financial, and client-facing decisions.

## Architecture

Single-machine first, split-worker optional:
- **Single Mac mode** — one Mac runs the whole Docker stack locally, including UI, n8n, Ollama, Postgres, APIs, and orchestration.
- **Split mode** — the Mac mini runs the control plane and a second Mac runs `studio-worker` for filesystem-heavy or DAW-adjacent tasks.
- **Shared volume** — `/Volumes/StudioShare/` or equivalent shared mount visible to any machine executing file tasks.
- **LAN access** — set `BIND_HOST=0.0.0.0` to expose the dashboard and APIs to the full local network by IP.
- **HTTPS edge** — add `infra/docker-compose.edge.yml` when you want a single TLS front door for dashboard access on the LAN.

## Product Status

What is solid today:
- the control plane starts cleanly under Docker Compose
- the dashboard is live and surfaces health, approvals, workers, rules, alerts, and bootstrap state
- `project-state` persists jobs, approvals, audit records, worker nodes, and worker tasks
- `crm-api` persists projects, leads, and style profiles
- `openclaw` seeds default orchestration rules, starter packs, and playbooks
- starter n8n workflows can be imported with a one-shot helper
- single-machine mode is the default path, with optional local or remote worker execution

What is still being added:
- deeper operator-safe settings coverage across every major service beyond the current persisted module-tuning layer
- deeper novice-friendly control-room actions so operators do not need to edit env files for normal product setup
- richer end-to-end email/content automations beyond the current MVP pathways
- full DAW execution validation on a real production worker machine

What this means in practice:
- this repo is past the scaffold stage
- it is not yet a novice-ready finished product
- the next phase is productization: onboarding, settings, safer defaults, and broader automation coverage

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

# 5. First-time only: import the starter n8n workflows
# This runs once against the live n8n service and safely skips if workflows already exist.
bash scripts/bootstrap_n8n.sh infra/.env

# 6. Optional: add the HTTPS dashboard front door
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.edge.yml up -d

# 7. Optional: start the studio worker on a second Mac
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d

# 8. Verify all services healthy
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
```

Then open the control room and complete the first-run workspace questionnaire. It now persists:
- studio identity
- deployment mode
- shared paths
- operator identity
- style/tone seed
- alert destinations
- optional worker settings

Network access posture:
- Fastest access: `http://<control-plane-ip>:3000`
- Preferred operator URL after hostname setup: `https://$CONTROL_PLANE_HOST`
- Engineering/admin fallbacks remain available on direct ports such as `:5678`, `:8080`, `:8090`, and `:8100`

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
# http://<control-plane-ip>:3000
```

Single-machine mode does not require `docker-compose.worker.yml`; the worker file is only for split deployments.

Optional HTTPS front door:
```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.edge.yml \
  up -d
```
This serves the dashboard at `https://$CONTROL_PLANE_HOST` through Caddy with an internal LAN certificate.
Export the Caddy root certificate with `bash scripts/export_caddy_root_cert.sh infra/.env` and trust it on operator devices for clean HTTPS access.
The edge stack also exposes `https://n8n.$CONTROL_PLANE_HOST` and `https://openclaw.$CONTROL_PLANE_HOST`.

Recommended access sequence:
1. Bring the stack up with `BIND_HOST=0.0.0.0`.
2. Verify the dashboard by IP at `http://<control-plane-ip>:3000`.
3. Add the HTTPS edge stack.
4. Point `CONTROL_PLANE_HOST` at that same machine in local DNS or `/etc/hosts`.
5. Trust the exported Caddy root certificate on operator Macs.
6. Move daily operator use to `https://$CONTROL_PLANE_HOST`.

Optional local worker on the same Mac:
```bash
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d
```
Use this when one Mac should also execute bounded worker tasks locally. Keep `infra/docker-compose.worker.yml` for the separate studio-Mac deployment.

The Compose project is intentionally named `ai-audio-studio` so Docker Desktop shows the product name instead of the `infra/` folder.

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
- targeted runtime smoke checks for bootstrap, dashboard, and control-plane services

## Service Map

| Service | Port | Purpose |
|---------|------|---------|
| `studio-brain-ui` | 3000 | Operator dashboard and API proxy |
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
- `openclaw` policy helper plus DB-backed orchestration rules and rule packs
- `openclaw` starter playbooks for prebuilt operator automations
- seeded n8n workflow templates under `infra/n8n/workflows/`
- one-shot n8n bootstrap helper at `scripts/bootstrap_n8n.sh` with idempotent existing-workflow detection
- effort-level gating helper
- audio QC threshold presets
- Docker service graph and prompt/task scaffolding
- studio worker service for optional remote file-task execution
- `local-worker` Docker profile for single-Mac execution
- operator dashboard with live health, approvals, style profiles, worker state, and rule-pack visibility
- persisted `workspace-settings` and first-run questionnaire for studio identity, paths, tone, alerts, and worker posture
- persisted module settings and per-service `/status` surfaces for the core automation and production modules
- LAN and HTTPS operator access paths
- idempotent n8n bootstrap status surfaced through OpenClaw and the dashboard
- service drilldowns in the control room with live status snapshots and saved tuning summaries

Still incomplete:
- complete operator-safe settings coverage for every service/module
- full novice-friendly first-run flow without `.env` editing beyond secrets and machine-local wiring
- full OpenClaw execution depth against all email/content modules
- richer style-profile extraction and per-client/per-project context layering
- audio QC remote execution and DAW automation hooks validated against a real worker machine
- end-to-end inbound automations beyond the seeded workflow templates
- outbound alerts and escalation connectors

## Five Core Modules

1. **Lead Intake** — Form/DM/email → normalized lead → draft reply → approval queue
2. **Inbox Triage** — Gmail read-only → classify → draft response → approval queue
3. **Social/Content Pipeline** — Brief → draft captions → asset packaging → approval queue
4. **Session Prep & Audio QC** — Stems → validate → organize → LUFS/peak/phase report
5. **Mix Planner & Revision Parser** — Notes → parameterized changes → SoundFlow/ReaScript

## New Control-Plane Primitives

- **Style Profiles**: paste tone guidance, point at reference files, or combine both through `crm-api /style-profiles`
- **Workspace Settings**: the first-run questionnaire now persists studio identity, path defaults, tone seed, alerts, and optional worker posture through `crm-api /workspace-settings`
- **Orchestration Rules**: curated defaults auto-seed on startup and grouped rule packs list at `openclaw /rule-packs`
- **Starter Automations**: inspect prebuilt routing surfaces through `openclaw /playbooks`
- **Studio Worker Queue**: enqueue bounded remote tasks in `project-state /workers/tasks`
- **Studio Worker Agent**: run `infra/docker-compose.worker.yml` for a second Mac or `--profile local-worker` when one Mac should execute locally
- **Auto-seeded defaults**: CRM seeds a baseline studio tone profile and OpenClaw seeds email/content routing rules on startup
- **n8n Workflow Pack**: import the supplied webhook templates from `infra/n8n/workflows/` instead of building first-pass flows from scratch

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
- Add `--profile local-worker` if you want bounded DAW-adjacent tasks to execute on the same machine
- Keep all tasks on the local machine unless you explicitly need a second node

Use split mode when you want a dedicated worker Mac:
- Start `infra/docker-compose.yml` on the control-plane machine
- Start `infra/docker-compose.worker.yml` on the worker machine
- Point `MAC_MINI_BASE_URL` at the control-plane host and share the same project paths

Use `infra/docker-compose.edge.yml` when you want HTTPS on a single front door for the dashboard.

For novice-friendly operations:
- Use `https://$CONTROL_PLANE_HOST` as the main dashboard entrypoint.
- Use `http://<control-plane-ip>:3000` as the immediate LAN fallback before hostname/TLS trust is complete.
- Keep Docker Desktop filtered by the `ai-audio-studio` project name.
- Use the seeded rule packs and supplied n8n workflow templates before creating custom automation.
- Expect a dedicated onboarding/settings flow to replace part of the current env-driven setup over the next milestones.
- Use the legacy cutover checklist before retiring any older automation host or dashboard.

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
- [docs/runbooks/local-network.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/local-network.md) — LAN and HTTPS setup
- [docs/runbooks/legacy-cutover.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/legacy-cutover.md) — retiring legacy infra cleanly
- [docs/runbooks/n8n-bootstrap.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/n8n-bootstrap.md) — importable workflow templates
