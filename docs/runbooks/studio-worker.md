# Runbook: Studio Worker Node

## Purpose

Run a lightweight worker service on the same host or on a second workstation so the control plane can hand off bounded filesystem and DAW-adjacent tasks without moving the whole stack.

## Initial scope

Current worker capabilities:
- `session-prep`
- `revision-parser`
- `delivery-packager`
- workstation discovery and DAW readiness reporting
- preview generation for session manifests, mix plans, render plans, listening reports, and execution plans
- cross-platform path translation for differing control-plane and worker mounts
- plugin inventory scans for `macos` and scaffolded scan roots for `windows`
- Wavelab detection scaffolding for mastering-oriented workstation posture

Queued tasks are claimed from `project-state` over HTTP and executed against mounted local paths.
The code is split into `config`, `paths`, `runner`, `tasks`, and `adapters` so DAW execution can be added without reworking the worker loop.

## Prerequisites

- Docker Desktop installed on the worker workstation
- Shared storage mounted at the same path as the control plane, or `PATH_TRANSLATION_JSON` configured
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

For a Windows worker, use Windows targets in the translation map:

```bash
PATH_TRANSLATION_JSON={"/Volumes/StudioShare":"Z:\\StudioShare"}
WORKER_PLATFORM=windows
REAPER_BINARY_PATH="C:\\Program Files\\REAPER (x64)\\reaper.exe"
PROTOOLS_APP_PATH="C:\\Program Files\\Avid\\Pro Tools\\ProTools.exe"
WAVELAB_APP_PATH="C:\\Program Files\\Steinberg\\WaveLab 12\\WaveLab 12.exe"
```

## Start

```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml ps
```

For single-machine or host-native REAPER automation on the same Mac:

```bash
bash scripts/install_host_studio_worker.sh
PORT=8191 \
WORKER_SLUG=host-reaper-worker \
WORKER_DISPLAY_NAME="Host Reaper Worker" \
WORKER_API_BASE_URL=http://127.0.0.1:8191 \
PROJECT_STATE_URL=http://127.0.0.1:8080 \
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript \
STUDIO_WORKER_DRY_RUN_DAW=false \
bash scripts/start_host_studio_worker.sh infra/env.example
```

## Verify

- Studio worker health: `http://<studio-mac-ip>:8190/health`
- Workstation profile: `http://<studio-mac-ip>:8190/workstation/profile`
- Workstation validation: `http://<studio-mac-ip>:8190/workstation/validate`
- Session manifest preview: `POST http://<studio-mac-ip>:8190/session-manifest/preview`
- Mix plan preview: `POST http://<studio-mac-ip>:8190/mix-plan/preview`
- Render plan preview: `POST http://<studio-mac-ip>:8190/render-plan/preview`
- Listening report preview: `POST http://<studio-mac-ip>:8190/listening-report/preview`
- Execution plan preview: `POST http://<studio-mac-ip>:8190/execution-plan/preview`
- Registered workers: `http://<mac-mini-ip>:8080/workers`
- Worker tasks: `http://<mac-mini-ip>:8080/workers/tasks/list`
- Host-side Reaper smoke test: `python3 scripts/reaper_host_smoke_test.py`
- Host worker status: `http://127.0.0.1:8191/status`
- End-to-end queued Reaper validation: `python3 scripts/validate_host_reaper_queue.py`

## Behavior

- The worker registers itself on boot
- It heartbeats every few seconds
- It claims one queued task at a time
- On success it posts structured result data back to the Mac mini
- On failure it marks the task and linked job failed
- `execute-soundflow` and `execute-reascript` now support workstation readiness reporting, generated DAW-specific revision artifacts, Reaper session introspection, preview execution-loop planning, and disposable working-copy staging before execution
- for host-mode REAPER automation, `execute-reascript` can now dispatch to the configured REAPER binary when `STUDIO_WORKER_DRY_RUN_DAW=false`
- Set `STUDIO_WORKER_DRY_RUN_DAW=true` to validate DAW execution queueing before a real studio Mac is available
- `windows` workers are now scaffolded in path translation, plugin scanning, and workstation validation, but still need live DAW runtime validation before being treated as production-ready
