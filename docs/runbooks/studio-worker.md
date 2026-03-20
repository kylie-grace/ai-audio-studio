# Runbook: Studio Worker Node

## Purpose

Run a lightweight worker service on the studio Mac so the Mac mini can hand off bounded filesystem and DAW-adjacent tasks without moving the whole control plane.

## Initial scope

Current worker capabilities:
- `session-prep`
- `revision-parser`
- `delivery-packager`

Queued tasks are claimed from `project-state` over HTTP and executed against mounted local paths.
The code is split into `config`, `paths`, `runner`, `tasks`, and `adapters` so DAW execution can be added without reworking the worker loop.

## Prerequisites

- Docker Desktop installed on the studio Mac
- Shared storage mounted at the same path as the Mac mini, or `PATH_TRANSLATION_JSON` configured
- The Mac mini control plane reachable on the LAN

## Configure

In `infra/.env` or a worker-specific env file:

```bash
MAC_MINI_BASE_URL=http://192.168.1.10
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac
WORKER_API_BASE_URL=http://192.168.1.20:8190
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager
STUDIO_WORKER_DRY_RUN_DAW=true
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
DELIVERY_PATH=/Volumes/StudioShare/deliveries
PATH_TRANSLATION_JSON={}
```

If mount points differ between the Mac mini and studio Mac:

```bash
PATH_TRANSLATION_JSON={"/Volumes/StudioShare":"/Volumes/ControlPlaneShare"}
```

## Start

```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml ps
```

## Verify

- Studio worker health: `http://<studio-mac-ip>:8190/health`
- Registered workers: `http://<mac-mini-ip>:8080/workers`
- Worker tasks: `http://<mac-mini-ip>:8080/workers/tasks/list`

## Behavior

- The worker registers itself on boot
- It heartbeats every few seconds
- It claims one queued task at a time
- On success it posts structured result data back to the Mac mini
- On failure it marks the task and linked job failed
- `execute-soundflow` and `execute-reascript` are scaffolded adapter entry points for later approval-gated DAW execution
- Set `STUDIO_WORKER_DRY_RUN_DAW=true` to validate DAW execution queueing before a real studio Mac is available
