# Service Map — Complete Directory

**Written for:** Developer Contributor, Operator debugging
**Purpose:** Find any service, its port, dependencies, and key endpoints

---

## Service Zones

```
CONTROL PLANE (core, always running)
  postgres       :5432   Shared database
  n8n            :5678   Workflow automation
  project-state  :8080   Job FSM, approval queue, audit log
  crm-api        :8090   Leads, projects, style profiles, workspace settings
  openclaw       :8100   Orchestration routing and policy enforcement
  caddy          :80/:443 HTTPS front door

AUTOMATION MODULES (communication, default profile)
  content-pipeline :8110  Social caption drafting
  lead-intake      :8130  Lead normalization and reply drafting
  inbox-triage     :8140  Gmail read + email classification + reply drafting

PRODUCTION MODULES (DAW profile — add --profile daw)
  audio-qc           :8120  Loudness, peak, phase, spectral analysis
  session-prep       :8150  Stem validation and session folder creation
  revision-parser    :8160  Natural language → DAW change objects
  delivery-packager  :8170  QC-gated client delivery assembly
  mix-planner        :8180  Session-aware mix decision generation

WORKERS (optional — single machine or remote)
  studio-worker  :8190  File and DAW task execution agent

AI RUNTIME (native, not Docker)
  ollama         :11434  Local LLM serving
```

---

## Control Plane Services

### postgres — Shared Database

**Port:** 5432 (internal only — not exposed to LAN)
**Docker profile:** default
**Purpose:** Single source of truth for all persistent data. All services connect to this database.
**Image:** postgres:16-alpine
**Data persists in:** Docker volume `postgres-data`
**Health check:** `pg_isready -U studio -d studiodb`

---

### n8n — Workflow Automation

**Port:** 5678
**Docker profile:** default
**Purpose:** Webhook ingestion, workflow routing, integration layer. Receives events from external sources and routes them to the appropriate services.
**Health check:** `GET http://localhost:5678/healthz`
**Web UI:** `http://localhost:5678`
**After HTTPS setup:** `https://n8n.studio-brain.local`

**Key endpoints:**
- `GET /healthz` — health check
- `POST /webhook/{workflow-id}` — trigger a workflow
- `/rest/credentials` — credential management (web UI only)

**Bootstrap:** `bash scripts/bootstrap_n8n.sh infra/.env`

---

### project-state — Job State and Approvals

**Port:** 8080
**Docker profile:** default
**Purpose:** The authoritative state backend. Manages the job FSM, approval queue, audit log, and worker task registry.
**Health check:** `GET http://localhost:8080/health`
**Logs:** `docker compose logs project-state`

**Key endpoints:**
- `GET /health` — service health
- `GET /jobs/awaiting-approval` — pending approval queue
- `POST /jobs/{id}/approve` — approve a job
- `POST /jobs/{id}/reject` — reject a job
- `GET /audit-log` — query audit log (supports `?date_from=&date_to=` filters)
- `GET /workers` — registered worker nodes
- `GET /workers/tasks/list` — worker task queue
- `GET /alerts` — active runtime alerts

**Required header:** `X-Actor: {actor-name}` on all mutating requests.

---

### crm-api — Projects, Leads, Settings

**Port:** 8090
**Docker profile:** default
**Purpose:** Stores leads, project records, style profiles, and workspace settings. Auto-seeds default style profile and workspace settings questionnaire on first start.
**Health check:** `GET http://localhost:8090/health`

**Key endpoints:**
- `GET /health` — service health
- `GET /workspace-settings` — current workspace config
- `PUT /workspace-settings` — update workspace config
- `GET /style-profiles` — list style profiles
- `POST /style-profiles` — create style profile
- `GET /projects` — list projects
- `POST /leads` — create a lead record

---

### openclaw — Orchestration Engine

**Port:** 8100
**Docker profile:** default
**Purpose:** Policy enforcement and routing. Receives normalized job envelopes, validates against permission tiers, routes to the correct module. Stateless — does not persist jobs, delegates to project-state.
**Health check:** `GET http://localhost:8100/health`
**After HTTPS setup:** `https://openclaw.studio-brain.local`

**Key endpoints:**
- `GET /health` — service health
- `POST /dispatch/by-trigger` — main routing endpoint (all n8n workflows terminate here)
- `POST /assistant` — Control Room Assistant chat
- `GET /rule-packs` — available orchestration rule packs
- `GET /playbooks` — starter playbooks
- `GET /orchestration-rules` — seeded routing rules

**Required header:** `X-Actor: {actor-name}` on mutating requests.

---

### caddy — HTTPS Front Door

**Ports:** 80, 443
**Docker profile:** default
**Purpose:** TLS termination, reverse proxy to dashboard, n8n, and OpenClaw API. Generates self-signed LAN certificate automatically.
**Configuration:** `infra/Caddyfile`
**Certificate export:** `bash scripts/export_caddy_root_cert.sh infra/.env`

**Routes:**
- `https://{CONTROL_PLANE_HOST}` → studio-brain-ui:3000
- `https://n8n.{CONTROL_PLANE_HOST}` → n8n:5678
- `https://openclaw.{CONTROL_PLANE_HOST}` → openclaw:8100

---

## Automation Modules

### content-pipeline — Social Caption Drafting

**Port:** 8110
**Docker profile:** default
**Purpose:** Generates platform-specific social media captions from content briefs. Respects character limits, applies engineer voice and hashtag conventions per platform.
**Health check:** `GET http://localhost:8110/health`

**Key endpoints:**
- `GET /health`
- `POST /draft-social` — submit a brief, receive per-platform caption drafts

---

### lead-intake — Lead Analysis and Reply Drafting

**Port:** 8130
**Docker profile:** default
**Purpose:** Normalizes incoming leads, scores fit and urgency, drafts initial replies in the studio's voice. Queues all drafts for operator approval.
**Health check:** `GET http://localhost:8130/health`

**Key endpoints:**
- `GET /health`
- `POST /webhook/lead-intake` — submit a lead for processing

---

### inbox-triage — Gmail Classification and Draft Replies

**Port:** 8140
**Docker profile:** default
**Purpose:** Reads Gmail with read-only OAuth credentials. Classifies messages by type and urgency. Drafts reply for each non-noise message. Queues for approval.
**Health check:** `GET http://localhost:8140/health`

**Key endpoints:**
- `GET /health`
- `POST /webhook/inbox-triage` — trigger triage on a specific message

---

## Production Modules (DAW Profile)

### audio-qc — Audio Quality Control

**Port:** 8120
**Docker profile:** daw (start with `--profile daw`)
**Purpose:** Objective measurements on rendered audio: LUFS, true peak, clipping, phase coherence, mono compatibility, spectral analysis.
**Health check:** `GET http://localhost:8120/health`

**Key endpoints:**
- `GET /health`
- `POST /qc/run` — submit a file for QC analysis (body: `{candidate_path, effort_level}`)
- `GET /qc/reports` — list QC reports

---

### session-prep — Stem Validation and Organization

**Port:** 8150
**Docker profile:** daw
**Purpose:** Validates incoming audio files (format, sample rate, bit depth, naming) and organizes them into a clean session folder structure with a manifest.
**Health check:** `GET http://localhost:8150/health`

**Key endpoints:**
- `GET /health`
- `POST /prepare-session` — submit a stems directory for processing
- `POST /webhook/session-prep` — n8n webhook entry point

---

### revision-parser — Notes to DAW Operations

**Port:** 8160
**Docker profile:** daw
**Purpose:** Converts client revision notes (plain English) into structured change objects with confidence scores. Generates executable ReaScript or SoundFlow scripts.
**Health check:** `GET http://localhost:8160/health`

**Key endpoints:**
- `GET /health`
- `POST /parse-revisions` — submit revision notes for parsing

---

### delivery-packager — QC-Gated Delivery Assembly

**Port:** 8170
**Docker profile:** daw
**Purpose:** Assembles client delivery bundles from QC-approved renders. Requires a passing QC report — cannot package without one. Includes documentation and embedded metadata.
**Health check:** `GET http://localhost:8170/health`

**Key endpoints:**
- `GET /health`
- `POST /package-delivery` — trigger delivery assembly (requires passing QC report reference)

---

### mix-planner — Session-Aware Mix Planning

**Port:** 8180
**Docker profile:** daw
**Purpose:** Reads session manifest + studio style profile and generates bounded mix decisions: levels, EQ guidance, FX routing, reference comparison points.
**Health check:** `GET http://localhost:8180/health`

**Key endpoints:**
- `GET /health`
- `POST /mix-plan` — generate a mix plan (body: `{session_manifest_id, project_slug}`)

---

## Worker

### studio-worker — DAW Task Execution Agent

**Port:** 8190
**Docker profile:** `--profile local-worker` (same machine) or `docker-compose.worker.yml` (remote)
**Purpose:** Polls project-state for queued tasks and executes them. Handles session prep, revision execution, delivery packaging, and DAW script execution. Can run natively on macOS for direct DAW binary access.
**Health check:** `GET http://localhost:8190/health`

**Key endpoints:**
- `GET /health`
- `GET /runtime` — worker runtime status (drain state, task count)
- `POST /runtime/drain` — pause new task intake
- `POST /runtime/resume` — resume task intake
- `GET /workstation/profile` — detected DAWs and plugins
- `GET /workstation/validate` — validate workstation configuration
- `POST /workstation/dry-run-smoke` — run full planning rehearsal
- `POST /session-manifest/preview` — preview session manifest without committing
- `POST /execution-plan/preview` — preview execution plan without committing

**Required:** Worker must be registered with project-state. Registration happens automatically on startup if `MAC_MINI_BASE_URL` is correct.

---

## AI Runtime

### ollama — Local LLM Serving

**Port:** 11434
**Runtime:** Native macOS — not Docker
**Purpose:** Serves `qwen2.5:14b-instruct` (planner) and `qwen2.5:3b` (classifier) locally. Docker services reach it via `host.docker.internal:11434`.
**Start:** `bash scripts/start-ollama.sh`

**Key endpoints:**
- `GET /api/tags` — list loaded models
- `GET /api/ps` — show currently loaded model(s)
- `POST /api/generate` — generate text (used internally by services)
