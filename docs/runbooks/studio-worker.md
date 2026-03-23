# Runbook: Studio Worker Node

## Purpose

Run a lightweight worker service on the same host or on a second workstation so the control plane can hand off bounded filesystem and DAW-adjacent tasks without moving the whole stack.

## Initial scope

Current worker capabilities:
- `session-prep`
- `revision-parser`
- `delivery-packager`
- workstation discovery and DAW readiness reporting
- workstation dry-run smoke rehearsal for the planning chain
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
- For split deployments, `WORKER_API_BASE_URL` must be set to the worker machine's reachable LAN URL. Do not leave it blank.

## Configure

In `infra/.env` or a worker-specific env file:

```bash
MAC_MINI_BASE_URL=http://192.168.1.50
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac
WORKER_API_BASE_URL=http://192.168.1.60:8190
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

Windows workers are supported in configuration and path translation, but live DAW runtime validation is still pending. Treat that path as scaffolded until a real Windows workstation has been exercised.

## Start

```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml ps
```

Remote worker compose defaults now assume LAN exposure:
- `BIND_HOST=0.0.0.0`
- `WORKER_API_BASE_URL` must be set to the worker machine's real LAN URL, for example `http://192.168.1.60:8190`
- the worker will warn if that callback URL is blank, and the split-compose file now requires it explicitly

For `single_machine` or host-native REAPER automation on the same Mac:

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

## Shared storage

The worker assumes shared storage is already mounted. This repo does not provision SMB/NFS for you.

Recommended baseline:
- control plane and worker both mount the same share root, ideally `/Volumes/StudioShare`
- create at least:
  - `/Volumes/StudioShare/projects`
  - `/Volumes/StudioShare/deliveries`
  - `/Volumes/StudioShare/draft-queue`
  - `/Volumes/StudioShare/approval-queue`
  - `/Volumes/StudioShare/incoming-stems`
- if mount points differ between machines, define `PATH_TRANSLATION_JSON`

Example SMB mount on macOS:

```bash
mkdir -p /Volumes/StudioShare
open "smb://studio-share.local/StudioShare"
```

Example Windows mapping:

```powershell
New-PSDrive -Name Z -PSProvider FileSystem -Root "\\studio-share\StudioShare" -Persist
```

Then translate:

```bash
PATH_TRANSLATION_JSON={"/Volumes/StudioShare":"Z:\\StudioShare"}
```

## launchd persistence for host mode

For host-native Mac workers, use `launchd` so the worker comes back after reboot.

Example plist path:

```text
~/Library/LaunchAgents/com.aiaudiostudio.worker.plist
```

Minimal launchd program block:

```xml
<key>ProgramArguments</key>
<array>
  <string>/bin/zsh</string>
  <string>-lc</string>
  <string>cd /Users/your-user/ai-audio-studio && bash scripts/start_host_studio_worker.sh /Users/your-user/.ai-audio-studio-worker.env</string>
</array>
<key>RunAtLoad</key>
<true/>
<key>KeepAlive</key>
<true/>
```

The repository includes a ready-to-adapt plist template at [scripts/com.ai-audio-studio.studio-worker.plist](../../scripts/com.ai-audio-studio.studio-worker.plist). Copy it into `~/Library/LaunchAgents/`, replace the placeholders, and load it with `launchctl` to keep the host worker alive across reboots.

Load it with:

```bash
launchctl unload ~/Library/LaunchAgents/com.aiaudiostudio.worker.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.aiaudiostudio.worker.plist
launchctl kickstart -k gui/$(id -u)/com.aiaudiostudio.worker
```

## Verify

- Studio worker health: `http://<studio-mac-ip>:8190/health`
- Workstation profile: `http://<studio-mac-ip>:8190/workstation/profile`
- Workstation validation: `http://<studio-mac-ip>:8190/workstation/validate`
- Workstation dry-run smoke: `POST http://<studio-mac-ip>:8190/workstation/dry-run-smoke`
- Confirm a paused DAW task: `POST http://<studio-mac-ip>:8190/runtime/confirm-task`
- Worker runtime status: `http://<studio-mac-ip>:8190/runtime`
- Worker drain / resume: `POST http://<studio-mac-ip>:8190/runtime/drain` and `POST http://<studio-mac-ip>:8190/runtime/resume`
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
- Expired claimed-task leases are now auto-recovered by `project-state`; crashed workers no longer leave claims stuck forever
- `execute-soundflow` and `execute-reascript` now support workstation readiness reporting, generated DAW-specific revision artifacts, Reaper session introspection, preview execution-loop planning, and disposable working-copy staging before execution
- for host-mode REAPER automation, `execute-reascript` can now dispatch to the configured REAPER binary when `STUDIO_WORKER_DRY_RUN_DAW=false`
- Set `STUDIO_WORKER_DRY_RUN_DAW=true` to validate DAW execution queueing before a real studio Mac is available
- The control room `Setup Validation` panel can now run a one-click dry-run smoke that stages a disposable session manifest, mix plan, listening review, render plan, and execution-plan rehearsal without touching a live project
- The same panel can now drain or resume the worker so maintenance can pause new task claims without killing in-flight process state
- DAW execution tasks now pause in `awaiting-approval` until an operator explicitly confirms them from the control room or via `POST /runtime/confirm-task`
- Pro Tools-oriented operators can start from `workers/soundflow-bootstrap/` as the minimal SoundFlow package skeleton for revision execution payloads
- `windows` workers are scaffolded in path translation, plugin scanning, and workstation validation, but still need live DAW runtime validation before being treated as production-ready
