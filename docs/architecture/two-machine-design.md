# Two-Machine Design

**Written for:** Developer Contributor, Studio Owner (advanced)
**Purpose:** Why the system is split, how the split works, and the tradeoffs involved

---

## The Core Problem

A studio automation platform needs to do two fundamentally different things:

1. **Run services continuously** — receive webhooks, manage state, serve a dashboard, process AI prompts. This needs to be always-on, network-reachable, and reliably stable. A Mac mini is ideal: always on, low power, no screen needed.

2. **Execute inside a DAW** — run ReaScripts in REAPER, SoundFlow actions in Pro Tools, move files on the studio storage volume. This needs to be on the machine where the DAW is installed. A Mac Pro or high-spec MacBook is typical for this.

These are different machines. The split is designed around this physical reality.

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MAC MINI — Control Plane                                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Docker Compose (docker-compose.yml)                 │  │
│  │                                                      │  │
│  │  caddy         :80/:443  HTTPS front door           │  │
│  │  studio-brain-ui :3000   Operator dashboard         │  │
│  │  n8n            :5678   Workflow automation         │  │
│  │  project-state  :8080   Job FSM + approvals         │  │
│  │  crm-api        :8090   CRM data                    │  │
│  │  openclaw       :8100   Orchestration engine        │  │
│  │  content-pipeline :8110 Social drafting             │  │
│  │  lead-intake    :8130   Lead processing             │  │
│  │  inbox-triage   :8140   Email triage                │  │
│  │                                                      │  │
│  │  [--profile daw]                                     │  │
│  │  audio-qc       :8120   Audio analysis              │  │
│  │  session-prep   :8150   Stem validation             │  │
│  │  revision-parser :8160  Notes → DAW ops             │  │
│  │  delivery-packager :8170 Delivery assembly          │  │
│  │  mix-planner    :8180   Mix planning                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Ollama (native — not Docker)                               │
│  :11434  qwen2.5:14b-instruct + qwen2.5:3b                 │
└──────────────────────────────┬──────────────────────────────┘
                               │  LAN
                               │  project-state REST API
                               │  shared storage mount
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  MAC PRO — Worker                                            │
│                                                             │
│  studio-worker (native macOS process, or Docker container)  │
│  :8190                                                       │
│                                                             │
│  - Polls project-state every 10s for queued tasks           │
│  - Claims tasks matching its capabilities                    │
│  - Executes: file organization, DAW scripts, delivery pkg   │
│  - Reports results back to project-state                    │
│                                                             │
│  DAW Software:                                              │
│  REAPER (ReaScript execution)                               │
│  Pro Tools (SoundFlow automation)                           │
│                                                             │
│  Shared Storage Mount:                                      │
│  /Volumes/StudioShare/ ← same paths as control plane       │
└──────────────────────────────────────────────────────────────┘
```

---

## Why This Split

### Control plane on Mac mini

The control plane services are always-on web services. They:
- Receive webhooks at any hour
- Serve the operator dashboard
- Run background workers (lease recovery, alert checks)
- Connect to Ollama for LLM inference

A Mac mini is the right host: it draws ~10W idle, has no moving parts, and can be tucked away. You don't want your control plane to go to sleep when you close a laptop lid.

### Worker on Mac Pro

The worker executes operations that require:
- DAW software installed (Pro Tools, REAPER)
- Plugin libraries loaded
- Physical access to the studio storage volume
- Potentially high CPU/RAM for large sessions

A Mac Pro is the right machine for this: it has the storage, the CPU, and the installed software stack. It doesn't need to be always-on — it only needs to be running when you have jobs to execute.

---

## Communication Model

The worker and control plane communicate over the LAN:

```
Worker polls → GET project-state/workers/tasks/list
Worker claims → POST project-state/workers/tasks/{id}/claim
Worker reports → POST project-state/workers/tasks/{id}/complete
```

The worker does not receive pushes from the control plane. It polls. This is intentional:

- The worker controls when it claims work (respects drain state)
- No persistent connection to break
- Firewalls at the control plane don't need to allow inbound from the worker
- The worker can come and go without the control plane noticing immediately (stale detection handles it)

---

## Shared Storage

Both machines must see the same file paths for the system to work. A session organized by the control plane must be readable by the worker; a delivery packaged by the worker must be readable by the control plane for delivery.

**Common approaches:**

**NFS (recommended for Mac-to-Mac):**
```bash
# On Mac mini (NFS server):
sudo nano /etc/exports
/Volumes/StudioDrive/shared -network 192.168.1.0 -mask 255.255.255.0 -alldirs

# On Mac Pro (NFS client):
sudo mount -t nfs mac-mini-ip:/Volumes/StudioDrive/shared /Volumes/StudioShare
```

**SMB (simpler, cross-platform):**
```bash
# Mac mini shares the folder via System Settings → Sharing → File Sharing
# Mac Pro connects via Finder → Connect to Server → smb://mac-mini-ip/StudioShare
```

**Path translation (when paths differ):**

If the Mac mini sees files at `/data/projects` and the Mac Pro sees the same NFS mount at `/Volumes/StudioShare/projects`, paths won't match. Set `PATH_TRANSLATION_JSON` to fix this:

```bash
# In infra/.env on the control plane:
PATH_TRANSLATION_JSON={"worker_prefix":"/Volumes/StudioShare","control_plane_prefix":"/data"}
```

---

## Network Configuration

### Control Plane

Set `BIND_HOST=0.0.0.0` to expose services to the LAN. This is required for:
- Worker to reach `project-state` API
- Operator to access the dashboard from other machines
- External webhooks (contact forms, etc.) to reach n8n

### Worker

Set in the worker's `.env`:
```bash
MAC_MINI_BASE_URL=http://192.168.1.50   # Control plane LAN IP
WORKER_API_BASE_URL=http://192.168.1.60:8190  # Worker's own LAN IP
```

The worker uses `MAC_MINI_BASE_URL` to poll for tasks and report results. The control plane uses `WORKER_API_BASE_URL` to send health check requests and verify the worker is reachable.

### HTTPS

Caddy handles TLS on the control plane:
- `https://{CONTROL_PLANE_HOST}` → dashboard
- `https://n8n.{CONTROL_PLANE_HOST}` → n8n
- `https://openclaw.{CONTROL_PLANE_HOST}` → OpenClaw API

The worker communicates with the control plane over HTTP internally (no TLS for service-to-service LAN traffic).

---

## Security Model

### Token Authentication

Two separate tokens:

**`WORKER_API_TOKEN`** — used by the worker to authenticate with project-state when registering, heartbeating, claiming tasks, and completing tasks. Should be a random 32+ character string.

**`OPERATOR_API_TOKEN`** — used by the dashboard and operators to authenticate approval/rejection actions. Different from the worker token — the worker cannot approve jobs.

Set both in `infra/.env`:
```bash
WORKER_API_TOKEN=wk-random-string-here
OPERATOR_API_TOKEN=op-random-string-here
```

### Actor System

The `X-Actor` header identifies who is taking an action. Actors fall into three classes:

| Class | Format | Can approve? |
|-------|--------|-------------|
| Human | `owner`, `engineer` | Yes (if in AUTHORIZED_ACTORS) |
| System service | `system:openclaw` | No |
| Worker | `worker:studio-mac` | No |

The worker registers itself with a slug (e.g., `studio-mac`) and all its actions are tagged with `worker:studio-mac`. This slug appears in the audit log.

### Credential Separation

The worker does not have database credentials. It communicates through the project-state API only.

The worker does not have Ollama access. All LLM inference happens on the control plane. The worker receives fully-formed execution payloads (scripts, plans) — it doesn't generate them.

---

## Single Machine Mode

Not every studio has two machines. The system runs on one Mac too:

```bash
# Start everything on one machine
docker compose --profile local-worker --env-file infra/.env \
  -f infra/docker-compose.yml up -d
```

The `local-worker` profile starts a Docker-based worker container on the same machine. It has access to the local filesystem and can execute DAW operations if the DAW applications are accessible from the container.

For native DAW execution on a single Mac (the most common case for a home studio on a MacBook), run the worker as a native process:

```bash
bash scripts/start_host_studio_worker.sh infra/.env
```

This gives the worker direct access to your DAW applications without Docker filesystem limitations.

---

## Starting the Worker

### Option A: Docker Worker (split-machine setup)

On the Mac Pro, create `infra/.env` with worker-specific variables:

```bash
# infra/.env on the Mac Pro
MAC_MINI_BASE_URL=http://192.168.1.50
WORKER_SLUG=studio-mac
WORKER_DISPLAY_NAME=Studio Mac Pro
WORKER_API_BASE_URL=http://192.168.1.60:8190
WORKER_CAPABILITIES=session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript
WORKER_PLATFORM=macos
WORKER_API_TOKEN=same-token-as-control-plane
STUDIO_WORKER_DRY_RUN_DAW=true
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
DELIVERY_PATH=/Volumes/StudioShare/deliveries
REAPER_BINARY_PATH=/Applications/REAPER.app/Contents/MacOS/REAPER
SOUNDFLOW_CLI_PATH=/Applications/SoundFlow.app/Contents/MacOS/SoundFlow
```

Start the worker:
```bash
docker compose --env-file infra/.env -f infra/docker-compose.worker.yml up -d
```

### Option B: Native macOS Worker (recommended for live DAW execution)

```bash
bash scripts/install_host_studio_worker.sh
# Edit the generated launchd plist
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.studio-worker.plist
```

The native worker runs as a launchd agent, restarts automatically, and has direct filesystem and process access to your DAW applications.

---

## Verifying the Split

After both machines are running:

1. Open the dashboard on the control plane
2. Navigate to the Operations tab
3. The Worker Runtime panel shows registered workers
4. Your worker should appear: status `idle`, recent heartbeat, your capabilities listed

Or via API from the control plane:
```bash
curl http://localhost:8080/workers
```

---

## Failure Modes

### Worker goes offline

The control plane detects a missing heartbeat after `STALE_WORKER_MINUTES` (default 5). The worker shows as `offline` in the dashboard. Queued tasks remain queued — they don't fail. When the worker comes back online and sends a heartbeat, it resumes claiming tasks.

### Worker crashes mid-task

The lease recovery system in `project-state` sweeps every `LEASE_SWEEP_INTERVAL_SECONDS` (default 30s). Tasks with expired leases are automatically re-queued. No manual intervention needed — wait a few minutes.

### Control plane is unreachable

The worker cannot claim new tasks. In-progress tasks complete. The worker logs errors about failed polls and retries. No data is lost.

### Shared storage is unmounted

The worker claims tasks but fails to execute them (files not found). Tasks are marked `failed` with error messages. Re-mount the storage, then re-submit the jobs.

---

## Deployment Checklist

Before running live DAW execution in the two-machine configuration:

- [ ] Both machines on the same LAN subnet
- [ ] `MAC_MINI_BASE_URL` points to control plane's actual LAN IP (not 127.0.0.1)
- [ ] `WORKER_API_BASE_URL` points to worker's actual LAN IP (not 127.0.0.1)
- [ ] Same `WORKER_API_TOKEN` on both machines
- [ ] Shared storage mounted on both machines at predictable paths
- [ ] `PATH_TRANSLATION_JSON` set if paths differ between machines
- [ ] Worker registered (visible in Operations tab, status `idle`)
- [ ] Workstation scan passed (Operations → Setup Validation → Run Workstation Scan)
- [ ] Dry-run smoke test passed
- [ ] `STUDIO_WORKER_DRY_RUN_DAW=false` only after above steps pass
