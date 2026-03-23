# AI Audio Studio
<p align="center"><img src="brand/icon.svg" width="96" alt="AI Audio Studio" /></p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0) © 2026 Kylie-Grace Mars-Snyder. Licensed under [AGPL-3.0](LICENSE). See [docs/USAGE.md](docs/USAGE.md) for usage intent and commercial collaboration details.

> **Strong control-plane MVP, not a shrink-wrapped installer.** The stack runs today: dashboard, approvals, CRM, orchestration, alerts, worker queueing, DAW-side scaffolding, and LAN/HTTPS access. The remaining productization work is making setup, settings, and recovery feel novice-safe without relying on terminal knowledge.

AI Audio Studio is a Mac-first studio operations platform. It gives a studio one operator-facing control room for intake, inbox handling, content drafting, session prep, QC, revision planning, approvals, and bounded workstation execution.

## What It Is

Think of the product as **one control plane with optional worker capacity**.

- `single_machine`
  One Mac runs the dashboard, database, orchestration, settings, alerts, and optionally the worker too.
- `single_machine + local-worker`
  One Mac runs the control plane and also claims bounded worker tasks for filesystem and DAW-adjacent execution.
- `control_plane_plus_worker`
  One always-on Mac runs the control plane and one or more additional workstations run `studio-worker`.

The system is not “Mac mini only.” A Mac mini is a good control-plane host, but a Mac Studio or MacBook Pro can run the same stack. The right language is deployment posture, not one specific Apple model.

## What It Does

Core automation surfaces today:

1. Lead intake normalization, scoring, draft reply generation, and approval
2. Inbox triage, draft generation, and approval
3. Content drafting and orchestration scaffolding
4. Session prep, QC, render planning, and listening/review scaffolding
5. Revision parsing, execution planning, and bounded DAW task queueing

Nothing sends, posts, or executes without an explicit approval boundary.

## Choose A Deployment Posture

### 1. Single Machine

Use this first unless you already know you need a second workstation.

- best first bring-up path
- best for solo operators
- best for validating the full control room quickly
- remote worker not required

### 2. Single Machine With Local Worker

Use this when the same Mac should also handle bounded execution tasks.

- still one machine to manage
- useful for REAPER, local path work, and early DAW rehearsals
- no extra network/storage coordination beyond your local host setup

### 3. Control Plane Plus Remote Worker

Use this when you want a dedicated orchestration host and a separate studio workstation.

- `control plane`: dashboard, database, orchestration, approvals, CRM, alerts, n8n
- `worker`: mounted storage, plugin inventory, workstation validation, file operations, DAW execution
- ideal split: always-on Mac mini or Mac Studio control plane + studio workstation worker

Important: the remote worker is **optional capacity**, not a separate product tier you must adopt on day one.

## LAN And Access Posture

The intended access order is:

1. `localhost` on the host machine
2. `IP + HTTP` across the LAN
3. `hostname + HTTPS` for normal operator use

Operator front door:

- preferred: `https://$STUDIO_DOMAIN`
- immediate fallback: `http://<control-plane-ip>:3000`

Engineering and worker traffic:

- raw service ports remain valid
- workers can call the control plane by IP or resolvable hostname
- Caddy/HTTPS is for operator ergonomics, not a requirement for first success

## Start Here

Primary docs:

- [docs/runbooks/startup.md](docs/runbooks/startup.md): canonical bring-up order
- [docs/runbooks/local-network.md](docs/runbooks/local-network.md): LAN, hostname, TLS, and front-door guidance
- [docs/runbooks/studio-worker.md](docs/runbooks/studio-worker.md): optional worker deployment, shared storage, `launchd`, and split-machine guidance
- [docs/ROADMAP.md](docs/ROADMAP.md): current next milestones
- [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md): longer-range product direction

Longer-form guides:

- [docs/guide/00-overview.md](docs/guide/00-overview.md)
- [docs/setup/01-quick-start.md](docs/setup/01-quick-start.md)
- [docs/setup/02-split-mode.md](docs/setup/02-split-mode.md)

## Quick Start

### Prerequisites

- Docker Desktop installed and running
- Ollama installed on the Mac that will host local inference
- `infra/.env` created from `infra/env.example`
- enough local RAM/disk for Docker, Postgres, n8n, and models

### Fastest First Run

```bash
git clone <repo-url> ai-audio-studio
cd ai-audio-studio

cp infra/env.example infra/.env
# edit infra/.env for secrets, passwords, tokens, and machine-local paths

bash scripts/start-ollama.sh

docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# one-time, idempotent starter workflow import
bash scripts/bootstrap_n8n.sh infra/.env
```

Open:

- dashboard: `http://localhost:3000`
- n8n: `http://localhost:5678`

Optional profiles:

```bash
# add DAW-oriented services
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d

# let this same machine claim worker tasks too
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d
```

Only add a second worker machine after the control plane is already healthy:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
```

## Deployment Summary

### Control Plane

Responsibilities:

- dashboard / control room
- project-state FSM, approvals, worker queueing, audit trail
- CRM, style profiles, workspace settings
- OpenClaw rules, playbooks, alert fan-out
- n8n bootstrap and webhook surface
- LAN/HTTPS operator front door

### Worker

Optional responsibilities:

- mounted storage execution
- session prep and delivery packaging
- workstation validation and plugin inventory
- dry-run smoke rehearsal
- bounded DAW execution

### Shared Storage

If you add a remote worker, shared storage is part of the deployment contract.

- the repo does not provision SMB/NFS for you
- both machines must see the project/delivery paths
- if mount points differ, use `PATH_TRANSLATION_JSON`

## Safety Model

The system fails closed.

| Tier | Name | What it can do |
|------|------|----------------|
| 1 | Read | Observe and analyze |
| 2 | Draft | Prepare internal draft objects |
| 3 | Queue | Request approval for execution |
| 4 | Narrow Auto | Pre-approved bounded actions only |

If approval is unavailable, jobs wait. They do not auto-approve.

## Current State

Strong today:

- control-plane stack runs end to end in Docker
- dashboard/control room is live on LAN and HTTPS front-door posture is documented
- single-machine and split-machine deployment stories are both supported
- workspace settings, service settings direction, and worker runtime are established
- worker registration, heartbeats, queueing, dry-run rehearsal, and plugin inventory exist
- operator docs now reflect the actual product posture instead of the legacy two-machine prototype

Still being finished:

- novice-safe onboarding and settings coverage across more services
- richer project review packets and listening/review surfaces
- broader operator-safe recovery and service actions
- deeper canned automation packs and outbound integrations
- live validation on more real DAW/workstation combinations

## Documentation Map

Core direction:

- [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)

Bring-up and deployment:

- [docs/runbooks/startup.md](docs/runbooks/startup.md)
- [docs/runbooks/local-network.md](docs/runbooks/local-network.md)
- [docs/runbooks/studio-worker.md](docs/runbooks/studio-worker.md)
- [docs/runbooks/legacy-cutover.md](docs/runbooks/legacy-cutover.md)

Reference and guides:

- [docs/reference/api-reference.md](docs/reference/api-reference.md)
- [docs/guide/00-overview.md](docs/guide/00-overview.md)
- [docs/setup/01-quick-start.md](docs/setup/01-quick-start.md)

## Development

```bash
# stack validation
bash scripts/validate_stack.sh infra/env.example

# inspect logs
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f openclaw

# restart one service
docker compose --env-file infra/.env -f infra/docker-compose.yml restart project-state
```
