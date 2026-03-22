# Worker Setup — DAW Execution Node

**Written for:** Studio Owner (split-mode or single-machine DAW execution)
**Prerequisite:** Control plane running ([Quick Start](01-quick-start.md))

---

## What the Worker Does

The studio worker is a lightweight service that runs on your DAW workstation (or the same Mac, for single-machine setups). It:

1. **Registers itself** with the control plane when it starts
2. **Polls for tasks** — checks project-state every 10 seconds for new work
3. **Claims tasks** — picks up queued session prep, revision parsing, or delivery jobs
4. **Executes** — runs the actual work (file organization, DAW scripts, audio packaging)
5. **Reports back** — sends results and artifacts to the control plane

The worker is the bridge between the control plane's decisions and your physical DAW.

---

## Dry-Run Mode (Start Here)

Before enabling live DAW execution, start in dry-run mode:

```bash
STUDIO_WORKER_DRY_RUN_DAW=true  # Default — safe to start with
```

In dry-run mode:
- The worker claims tasks and runs the full planning chain
- It generates session manifests, execution plans, mix plans, etc.
- It does **not** execute any operations in your DAW
- Plans appear in the approval queue and Context tab as normal

This lets you validate the full flow before giving the worker live DAW access. When everything looks right, enable live execution by changing to `false`.

---

## Option 1: Docker Worker (Easiest to Start)

Best for: testing, initial validation, non-native DAW integration.

**On the Mac Pro (separate machine) or same Mac (local-worker profile):**

### Separate machine (split mode):

Create `infra/.env` on the worker machine (copy from the control plane and update):

```bash
MAC_MINI_BASE_URL=http://192.168.1.50
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac
WORKER_API_BASE_URL=http://192.168.1.60:8190
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager
WORKER_PLATFORM=macos
WORKER_API_TOKEN=same-token-as-control-plane
STUDIO_WORKER_DRY_RUN_DAW=true
REAPER_BINARY_PATH=/Applications/REAPER.app/Contents/MacOS/REAPER
PROTOOLS_APP_PATH=/Applications/Pro Tools.app
SOUNDFLOW_CLI_PATH=/Applications/SoundFlow.app/Contents/MacOS/SoundFlow
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
DELIVERY_PATH=/Volumes/StudioShare/deliveries
```

Start it:
```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
```

### Same machine (single-machine with local worker):

```bash
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d
```

This uses `LOCAL_WORKER_SLUG`, `LOCAL_WORKER_DISPLAY_NAME`, and `LOCAL_WORKER_CAPABILITIES` from your `.env`.

---

## Option 2: Native Host Worker (Production Recommended)

For live DAW execution, running the worker natively gives it direct access to the DAW application without Docker filesystem complications.

### Install

```bash
bash scripts/install_host_studio_worker.sh
```

This creates a launchd plist at `~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist`.

Edit the plist to set your configuration, then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist
```

### Manual Start (for testing)

```bash
PORT=8190 \
MAC_MINI_BASE_URL=http://192.168.1.50 \
WORKER_SLUG=studio-mac \
WORKER_API_BASE_URL=http://127.0.0.1:8190 \
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript \
STUDIO_WORKER_DRY_RUN_DAW=false \
bash scripts/start_host_studio_worker.sh infra/.env
```

### Managing the Native Worker

```bash
# Start
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist

# Restart
launchctl kickstart -k gui/$(id -u)/com.aiaudiostudio.worker

# Check status
launchctl list | grep studio-worker

# Check health
curl http://localhost:8190/health
```

---

## Configuring Worker Capabilities

The `WORKER_CAPABILITIES` variable tells the control plane what this worker can do. Set only the capabilities the worker actually has the software for:

| Capability | Requires |
|-----------|---------|
| `session-prep` | Access to shared storage |
| `revision-parser` | Access to shared storage, LLM for interpretation |
| `delivery-packager` | Access to shared storage, QC-passing renders |
| `execute-soundflow` | SoundFlow CLI installed, Pro Tools present |
| `execute-reascript` | REAPER installed at `REAPER_BINARY_PATH` |

Example for a Mac Pro with REAPER and SoundFlow:
```bash
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript
```

Example for a worker that only does file organization (no DAW software required):
```bash
WORKER_CAPABILITIES=session-prep,delivery-packager
```

---

## DAW Application Paths

Set these to the actual installed locations on the worker machine:

```bash
# REAPER
REAPER_BINARY_PATH=/Applications/REAPER.app/Contents/MacOS/REAPER

# Pro Tools (app bundle path)
PROTOOLS_APP_PATH=/Applications/Pro Tools.app

# SoundFlow CLI (required for Pro Tools automation)
SOUNDFLOW_CLI_PATH=/Applications/SoundFlow.app/Contents/MacOS/SoundFlow

# WaveLab (if installed)
WAVELAB_APP_PATH=
```

Verify each path exists:
```bash
ls -la /Applications/REAPER.app/Contents/MacOS/REAPER
ls -la "/Applications/Pro Tools.app"
ls -la /Applications/SoundFlow.app/Contents/MacOS/SoundFlow
```

---

## Verifying Registration

After starting the worker:

1. Open the dashboard → Operations tab
2. Find the "Worker Runtime" section
3. Your worker should show with:
   - Status: **healthy** (green)
   - Last heartbeat: within the last 30 seconds
   - Your worker slug name

Or check via API:
```bash
curl http://localhost:8080/workers
```

---

## Workstation Validation

Before running real jobs, validate the worker's DAW detection:

**From the dashboard:** Operations → Setup Validation → Run Workstation Scan

This shows:
- Which DAWs were detected
- Plugin inventory
- Path reachability
- Any configuration issues

**Dry-run smoke test:** Operations → Setup Validation → Run Dry-Run Smoke

This runs a full planning rehearsal:
1. Creates a disposable session manifest
2. Creates a test mix plan
3. Creates a test listening report
4. Creates a test render plan
5. Creates a test execution plan
6. Reports success/failure at each step

If the smoke test passes, the worker is correctly configured and ready for real work.

---

## Enabling Live DAW Execution

After validating dry-run mode:

1. In your worker's env configuration, change:
   ```bash
   STUDIO_WORKER_DRY_RUN_DAW=false
   ```

2. Restart the worker

3. Run the smoke test again to confirm live execution mode is configured correctly

> ⚠️ **Live execution means your DAW will change.** The worker runs scripts in the currently open session. Make sure:
> - The right session is open before approving an execution plan
> - Your session is saved before approving (the worker doesn't save before executing)
> - You understand what the execution plan will do before clicking Approve

---

## Worker Maintenance

### Draining Before Maintenance

If you need to update the worker, restart your Mac, or do maintenance on the DAW workstation:

1. Dashboard → Operations → Worker Runtime → **Drain**

Drain stops the worker from claiming new tasks but lets any in-progress task complete. Wait for the "0 tasks in progress" status, then safely restart or update.

2. After maintenance: **Resume**

Resume re-enables task claiming.

### Retiring a Worker

To permanently remove a worker registration (e.g., decommissioning a machine):

Dashboard → Operations → Worker Runtime → **Retire**

Retired workers are removed from the registry. Their completed task history remains in the audit log.

---

## Task Recovery

If a worker crashes mid-task, the control plane's lease recovery system detects the stuck claim and re-queues the task automatically. There's no manual intervention needed — wait 5–10 minutes and the task will reappear in the queue.

If you need to manually cancel a stuck task:
```bash
# Find the task
curl http://localhost:8080/workers/tasks/list

# Cancel it (replace TASK_ID)
curl -X POST http://localhost:8080/workers/tasks/TASK_ID/cancel \
  -H "X-Actor: owner"
```
