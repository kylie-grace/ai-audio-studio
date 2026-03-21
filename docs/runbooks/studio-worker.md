# Runbook: Studio Worker Node

## Purpose

Run a lightweight worker service on a second Mac so the control plane can hand off bounded filesystem and DAW-adjacent tasks without moving the whole stack.

## Initial scope

Current worker capabilities:
- `session-prep`
- `revision-parser`
- `delivery-packager`
- workstation discovery and DAW readiness reporting
- preview generation for session manifests, mix plans, and listening reports

Queued tasks are claimed from `project-state` over HTTP and executed against mounted local paths.
The code is split into `config`, `paths`, `runner`, `tasks`, and `adapters` so DAW execution can be added without reworking the worker loop.

## Prerequisites

- Docker Desktop installed on the studio Mac
- Shared storage mounted at the same path as the Mac mini, or `PATH_TRANSLATION_JSON` configured
- The Mac mini control plane reachable on the LAN
- If you are on a single Mac, you do not need this worker at all.

## Configure

In `infra/.env` or a worker-specific env file:

```bash
MAC_MINI_BASE_URL=http://192.168.1.10
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac
WORKER_API_BASE_URL=http://192.168.1.20:8190
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager
STUDIO_WORKER_DRY_RUN_DAW=true
REAPER_BINARY_PATH=/Applications/REAPER.app/Contents/MacOS/REAPER
PROTOOLS_APP_PATH=/Applications/Pro Tools.app
SOUNDFLOW_CLI_PATH=/Applications/SoundFlow.app/Contents/MacOS/SoundFlow
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
- Workstation profile: `http://<studio-mac-ip>:8190/workstation/profile`
- Session manifest preview: `POST http://<studio-mac-ip>:8190/session-manifest/preview`
- Mix plan preview: `POST http://<studio-mac-ip>:8190/mix-plan/preview`
- Listening report preview: `POST http://<studio-mac-ip>:8190/listening-report/preview`
- Registered workers: `http://<mac-mini-ip>:8080/workers`
- Worker tasks: `http://<mac-mini-ip>:8080/workers/tasks/list`

## Behavior

- The worker registers itself on boot
- It heartbeats every few seconds
- It claims one queued task at a time
- On success it posts structured result data back to the Mac mini
- On failure it marks the task and linked job failed
- `execute-soundflow` and `execute-reascript` now support workstation readiness reporting and generated DAW-specific revision artifacts, while live execution still remains gated behind real workstation validation
- Set `STUDIO_WORKER_DRY_RUN_DAW=true` to validate DAW execution queueing before a real studio Mac is available
