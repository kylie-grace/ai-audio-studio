# Split Mode — Control Plane + Studio Worker

**Written for:** Studio Owner setting up two-machine deployment
**Prerequisite:** [Quick Start](01-quick-start.md) completed on the control plane machine

---

## When to Use Split Mode

Split mode makes sense when:
- Your control plane machine (Mac mini, etc.) is always-on but doesn't have your DAW software
- Your DAW workstation (Mac Pro, Mac Studio) shouldn't be burdened with running a full Docker stack
- You want to separate the "always available" operations brain from the "when I'm working" studio computer

It adds configuration complexity. If you're just getting started, single-machine mode is easier — you can add split mode later.

---

## The Architecture

```
Mac mini / Control Plane                Mac Pro / Studio Worker
(always-on, 24/7)                      (your DAW workstation)

docker-compose.yml                      docker-compose.worker.yml
  ├── postgres                            └── studio-worker
  ├── n8n                                     ├── polls project-state for tasks
  ├── project-state                           ├── claims and executes tasks
  ├── crm-api                                 ├── has REAPER/Pro Tools/WaveLab
  ├── openclaw                                └── reads/writes shared storage
  ├── [automation modules]
  ├── studio-brain-ui
  └── caddy

Both machines mount the same shared storage:
/Volumes/StudioShare/ (or equivalent)
```

---

## Network Prerequisites

Before configuring anything:

1. **Both machines on the same LAN** — wired connection recommended for audio file transfers
2. **Static IP for the Mac mini** — go to System Settings → Network → your LAN connection → Details → TCP/IP → Set to Manual. Pick an IP like `192.168.1.50` outside your DHCP range.
3. **Static IP for the Mac Pro worker** (optional but recommended) — same process, e.g., `192.168.1.60`
4. **Firewall rules** — the Mac mini must allow inbound connections on ports 3000, 5678, 8080, 8190 from the LAN. System Settings → Network → Firewall → Options.

---

## Shared Storage Options

The control plane and worker need access to the same audio files. Three options:

### Option 1: NFS Mount (Recommended for Audio)

Best for: large audio file transfers, lowest latency, most reliable for production use.

On the machine hosting the storage (usually the Mac mini):
```bash
# Enable NFS in /etc/exports (requires sudo)
sudo sh -c 'echo "/Volumes/StudioShare -alldirs -maproot=nobody -network 192.168.1.0 -mask 255.255.255.0" >> /etc/exports'
sudo nfsd enable
sudo nfsd update
```

On the Mac Pro (worker machine), mount it:
```bash
sudo mkdir -p /Volumes/StudioShare
sudo mount -t nfs 192.168.1.50:/Volumes/StudioShare /Volumes/StudioShare
```

To auto-mount on boot, add to `/etc/fstab`:
```
192.168.1.50:/Volumes/StudioShare /Volumes/StudioShare nfs rw,bg,intr 0 0
```

### Option 2: SMB Mount (Simpler, Slower)

On the Mac mini: System Settings → General → Sharing → File Sharing → enable, add the folder.

On the Mac Pro:
```bash
# In Finder: Cmd+K → smb://192.168.1.50/StudioShare
# Or from terminal:
open "smb://192.168.1.50/StudioShare"
```

### Option 3: Path Translation (When Mount Points Differ)

If both machines can see the same physical storage but at different paths:

```bash
# In infra/.env on the worker machine:
PATH_TRANSLATION_JSON={"/Volumes/ControlShare":"/Volumes/StudioShare"}
```

This tells the worker: "when the control plane says `/Volumes/ControlShare/projects/foo`, I find that at `/Volumes/StudioShare/projects/foo`."

---

## Control Plane Configuration (Mac mini)

Add to `infra/.env` on the Mac mini:

```bash
# Allow LAN access
BIND_HOST=0.0.0.0
CONTROL_PLANE_HOST=studio-brain.local
CONTROL_PLANE_LAN_IP=192.168.1.50

# Worker will authenticate with this
WORKER_API_TOKEN=your-shared-worker-token-here

# Your shared storage paths (must match what the worker sees)
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
DELIVERY_PATH=/Volumes/StudioShare/deliveries
WATCHED_STEMS_PATH=/Volumes/StudioShare/incoming-stems
```

Start the control plane:
```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

---

## Worker Configuration (Mac Pro)

Create a worker-specific env file, or use a copy of the control plane `.env` with these additions/changes:

```bash
# Where is the control plane?
MAC_MINI_BASE_URL=http://192.168.1.50

# This worker's identity
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac
WORKER_PLATFORM=macos

# Where the control plane can reach this worker
WORKER_API_BASE_URL=http://192.168.1.60:8190

# What this worker can do
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript

# Authentication (must match WORKER_API_TOKEN on the control plane)
WORKER_API_TOKEN=your-shared-worker-token-here

# Worker starts in safe dry-run mode — set to false when ready for live execution
STUDIO_WORKER_DRY_RUN_DAW=true

# DAW paths on this machine
REAPER_BINARY_PATH=/Applications/REAPER.app/Contents/MacOS/REAPER
PROTOOLS_APP_PATH=/Applications/Pro Tools.app
SOUNDFLOW_CLI_PATH=/Applications/SoundFlow.app/Contents/MacOS/SoundFlow

# Shared storage (same physical path as control plane, or use PATH_TRANSLATION_JSON)
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
DELIVERY_PATH=/Volumes/StudioShare/deliveries
```

Start the worker:
```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
```

---

## Verifying the Connection

1. Open the dashboard on the Mac mini: `http://192.168.1.50:3000` or `http://localhost:3000`

2. Go to Operations → Worker Runtime Control

3. You should see "studio-mac" (or your worker slug) listed as **healthy**

4. If not, check connectivity:
   ```bash
   # From Mac mini, can we reach the worker?
   curl http://192.168.1.60:8190/health

   # From Mac Pro, can we reach the control plane?
   curl http://192.168.1.50:8080/health
   ```

5. Run the smoke test: Operations → Setup Validation → Run Dry-Run Smoke

---

## Worker Persistence with launchd

Docker on the Mac Pro works but isn't ideal for a DAW workstation — it adds overhead and requires Docker Desktop to be running. For production use, run the worker as a native process with launchd:

```bash
# Install the worker as a persistent service
bash scripts/install_host_studio_worker.sh
```

This installs a launchd plist that:
- Starts the worker when you log in
- Restarts it automatically if it crashes
- Runs it natively without Docker

To manage it:
```bash
# Start
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist

# Check status
launchctl list | grep studio-worker
```

For native execution with full DAW access (enables live ReaScript/SoundFlow):
```bash
STUDIO_WORKER_DRY_RUN_DAW=false \
WORKER_SLUG=studio-mac \
WORKER_API_BASE_URL=http://192.168.1.60:8190 \
bash scripts/start_host_studio_worker.sh infra/.env
```

---

## Windows Worker (Scaffolded)

Windows worker support is configured in the codebase but has not been validated on a real Windows workstation. The path translation and configuration work — DAW execution validation is pending.

Configuration for a Windows worker:
```bash
WORKER_PLATFORM=windows
REAPER_BINARY_PATH=C:\Program Files\REAPER (x64)\reaper.exe
PROTOOLS_APP_PATH=C:\Program Files\Avid\Pro Tools\ProTools.exe
WAVELAB_APP_PATH=C:\Program Files\Steinberg\WaveLab 12\WaveLab 12.exe
PATH_TRANSLATION_JSON={"/Volumes/StudioShare":"Z:\\StudioShare"}
```

Windows workers can run the worker Docker image or be run natively. Do not use Windows workers for production DAW execution until the runtime validation has been completed.

---

## Troubleshooting Split Mode

**Worker registers but immediately goes offline**
- Check that `WORKER_API_BASE_URL` is the Mac Pro's actual LAN IP, not localhost
- Verify port 8190 is open on the Mac Pro's firewall
- Check the worker logs: `docker compose -f infra/docker-compose.worker.yml logs studio-worker`

**Tasks queue but worker doesn't claim them**
- Check `WORKER_CAPABILITIES` includes the task type you're queuing
- Check `MAC_MINI_BASE_URL` points to the correct control plane IP
- Verify the control plane's `project-state` is healthy: `curl http://192.168.1.50:8080/health`

**Shared storage: "path not found" errors**
- Verify the mount is actually mounted: `ls /Volumes/StudioShare` on both machines
- Check `PATH_TRANSLATION_JSON` if paths differ between machines
- On SMB mounts: the mount may drop after sleep; set "prevent sleep" for the Mac mini or use NFS for better persistence
