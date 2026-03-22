# API Reference

**Written for:** Developer Contributor, advanced operator
**Purpose:** Every service endpoint, required headers, request bodies, and response shapes

---

## Global Conventions

### Authentication

All mutating requests require an `X-Actor` header:

```
X-Actor: owner
```

Actor formats:
- `owner` or `engineer` — human operators (can approve/reject)
- `system:{service}` — internal services (cannot approve)
- `worker:{slug}` — worker nodes (cannot approve)

The actor value must appear in `AUTHORIZED_ACTORS` for approval/rejection operations. If `OPERATOR_API_TOKEN` is set, mutating requests also require `X-Operator-Token: {token}`.

### Base URLs (default)

| Service | Base URL |
|---------|----------|
| project-state | `http://localhost:8080` |
| crm-api | `http://localhost:8090` |
| openclaw | `http://localhost:8100` |
| content-pipeline | `http://localhost:8110` |
| audio-qc | `http://localhost:8120` |
| lead-intake | `http://localhost:8130` |
| inbox-triage | `http://localhost:8140` |
| session-prep | `http://localhost:8150` |
| revision-parser | `http://localhost:8160` |
| delivery-packager | `http://localhost:8170` |
| studio-worker | `http://localhost:8190` |

After HTTPS setup, the main URLs route through Caddy:
- Dashboard: `https://{STUDIO_DOMAIN}`
- API-backed services: `https://{STUDIO_DOMAIN}/api/<service>`
- n8n: `https://{STUDIO_DOMAIN}/n8n` or `https://n8n.{STUDIO_DOMAIN}`
- OpenClaw: `https://{STUDIO_DOMAIN}/openclaw` or `https://openclaw.{STUDIO_DOMAIN}`

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request — malformed body |
| 401 | Missing X-Actor header |
| 403 | Actor not authorized for this action |
| 404 | Resource not found |
| 409 | State conflict (FSM transition invalid) |
| 422 | Validation error |

---

## project-state (:8080)

The authoritative state backend. Manages the job FSM, approval queue, audit log, worker registry, and worker task queue.

---

### Health

#### `GET /health`

Returns service health.

**Response:**
```json
{"status": "ok"}
```

---

### Jobs

#### `POST /jobs`

Create a new job envelope.

**Body:**
```json
{
  "project_id": "uuid (optional)",
  "module": "lead-intake",
  "action": "draft-reply",
  "trigger_type": "webhook",
  "trigger_payload": {},
  "priority": "normal",
  "approval_required": true,
  "requested_by": "system:lead-intake"
}
```

**module values:** `lead-intake`, `inbox-triage`, `session-prep`, `audio-qc`, `mix-planner`, `revision-parser`, `delivery-packager`, `social-drafting`, `content-pipeline`

**trigger_type values:** `webhook`, `filewatch`, `schedule`, `operator`

**priority values:** `low`, `normal`, `high`

**Response:** `201` — full job object

---

#### `GET /jobs`

List jobs with optional filters.

**Query params:**
- `module` — filter by module name
- `status` — filter by status
- `project_id` — filter by project
- `limit` — max results (default 50, max 200)

**Response:** array of job objects

---

#### `GET /jobs/{job_id}`

Get a single job by UUID.

**Response:** job object or `404`

---

#### `PUT /jobs/{job_id}/status`

Update job status (FSM-enforced).

**Body:**
```json
{
  "status": "in-progress",
  "actor": "system:lead-intake",
  "error_message": null
}
```

**status values:** `pending`, `in-progress`, `awaiting-approval`, `approved`, `rejected`, `complete`, `failed`

Returns `409` if the transition is invalid per FSM rules.

---

#### `POST /jobs/{job_id}/artifacts`

Attach an artifact to a job.

**Body:**
```json
{
  "type": "draft",
  "path": "/path/to/file",
  "label": "Mix plan v1"
}
```

---

### Approval Queue

#### `GET /jobs/awaiting-approval`

List all jobs awaiting human approval, with previews.

**Response:** array of job objects, each with a `preview` field containing module-specific content (lead details, inbox draft, social drafts, revision plan).

---

#### `POST /jobs/{job_id}/approve`

Approve a job. Requires human actor.

**Required headers:**
- `X-Actor: owner` (or other authorized actor)
- `X-Operator-Token: {token}` (if `OPERATOR_API_TOKEN` is set)

**Response:**
```json
{"job_id": "uuid", "status": "approved", "approved_by": "owner"}
```

Returns `403` if actor is not in `AUTHORIZED_ACTORS`.
Returns `409` if job is not in `awaiting-approval` state, or if a revision-parser job has unresolved blocking issues (missing worker, missing script, etc.).

---

#### `POST /jobs/{job_id}/reject`

Reject a job. Requires human actor.

**Required headers:**
- `X-Actor: owner`
- `X-Operator-Token: {token}` (if set)

**Body:**
```json
{"reason": "Draft tone is off — needs revision"}
```

**Response:**
```json
{"job_id": "uuid", "status": "rejected"}
```

---

### Audit Log

#### `GET /audit-log`

Query the append-only audit log.

**Query params:**
- `date_from` — ISO 8601 start date
- `date_to` — ISO 8601 end date
- `job_id` — filter by job
- `actor` — filter by actor
- `limit` — max results (default 50)

**Response:**
```json
[
  {
    "id": 1001,
    "job_id": "uuid",
    "project_id": "uuid",
    "actor": "human:owner",
    "action": "approve",
    "tier": 3,
    "payload": {},
    "artifact_refs": [],
    "created_at": "2026-01-01T12:00:00Z"
  }
]
```

---

### Workers

#### `GET /workers`

List all registered worker nodes (excludes retired).

**Response:** array of worker node objects

---

#### `POST /workers/register`

Register a worker node.

**Required header:** `X-Worker-Token: {token}`

**Body:**
```json
{
  "slug": "studio-mac",
  "display_name": "Studio Mac Pro",
  "platform": "macos",
  "api_base_url": "http://192.168.1.60:8190",
  "capabilities": ["session-prep", "execute-reascript", "execute-soundflow"],
  "watched_paths": {}
}
```

---

#### `POST /workers/{slug}/heartbeat`

Send a heartbeat. Workers call this every 30s.

**Required header:** `X-Worker-Token: {token}`

---

#### `POST /workers/{slug}/retire`

Retire a worker node permanently.

**Required header:** `X-Actor: owner`

---

#### `GET /workers/tasks/list`

List worker tasks (queued, claimed, recent completions).

**Query params:**
- `worker_slug` — filter by worker
- `status` — filter by status (`queued`, `claimed`, `complete`, `failed`)
- `limit` — max results (default 50)

---

#### `POST /workers/tasks/{task_id}/claim`

Claim a queued task for execution.

**Required header:** `X-Worker-Token: {token}`

**Body:**
```json
{"worker_slug": "studio-mac", "lease_seconds": 300}
```

---

#### `POST /workers/tasks/{task_id}/complete`

Mark a claimed task as complete.

**Required header:** `X-Worker-Token: {token}`

**Body:**
```json
{
  "worker_slug": "studio-mac",
  "result": {"output_path": "/path/to/result"},
  "error_message": null
}
```

---

#### `POST /workers/tasks/{task_id}/cancel`

Cancel a task (operator use).

**Required header:** `X-Actor: owner`

---

### Alerts

#### `GET /alerts`

List active runtime alerts.

**Response:**
```json
[
  {
    "alert_type": "worker-offline",
    "severity": "warning",
    "message": "Worker studio-mac has not sent a heartbeat in 8 minutes",
    "data": {},
    "created_at": "2026-01-01T12:00:00Z"
  }
]
```

---

## crm-api (:8090)

Stores leads, projects, style profiles, and workspace settings.

---

### Health

#### `GET /health`

Returns service health.

#### `GET /status`

Returns service status with counts:
```json
{
  "status": "ok",
  "project_count": 12,
  "lead_count": 47,
  "style_profile_count": 3,
  "studio_name": "Maggie Mars Studio",
  "operator_name": "owner",
  "integrations": {}
}
```

---

### Projects

#### `POST /projects`

Create a project.

**Body:**
```json
{
  "client_name": "Jamie Novak",
  "client_email": "jamie@example.com",
  "service_type": "mix",
  "budget_signal": "medium",
  "timeline": "3 weeks",
  "notes": "Hip-hop album, 10 tracks",
  "effort_level": 3
}
```

**service_type values:** `mix`, `master`, `mix+master`, `session`, `other`

**budget_signal values:** `low`, `medium`, `high`, `unknown`

**effort_level values:**
- `1` — import only
- `2` — import + QC
- `3` — import + QC + mix plan
- `4` — full pipeline

**Response:** `201` — project object (includes auto-generated `slug`)

---

#### `GET /projects`

List projects, ordered by most recently updated.

**Query params:**
- `limit` — max results (default 50, max 200)

---

#### `GET /projects/{project_id}`

Get a project by UUID or slug.

---

### Leads

#### `POST /leads`

Create a lead record (usually called by lead-intake module).

**Body:**
```json
{
  "project_id": "uuid",
  "source": "form",
  "raw_input": "Full text of lead submission",
  "normalized": {},
  "fit_score": 72,
  "urgency_score": 60,
  "draft_reply": "Hi Jamie, thanks for reaching out..."
}
```

**source values:** `form`, `dm`, `email`, `referral`

---

#### `GET /leads`

List leads.

**Query params:**
- `project_id` — filter by project
- `limit` — max results

---

#### `GET /leads/{lead_id}`

Get a specific lead.

---

### Style Profiles

#### `POST /style-profiles`

Create a style profile.

**Body:**
```json
{
  "name": "Studio Voice v2",
  "scope": "studio",
  "project_id": null,
  "raw_text": "Direct, warm, technical but not cold. Use first names...",
  "file_paths": []
}
```

**scope values:** `studio`, `engineer`, `client`, `project`

---

#### `GET /style-profiles`

List style profiles.

**Query params:**
- `scope` — filter by scope
- `project_id` — filter by project

---

#### `GET /style-profiles/{profile_id}`

Get a specific style profile.

---

### Workspace Settings

#### `GET /workspace-settings`

Returns the current workspace configuration (singleton row).

**Response includes:** `studio_name`, `deployment_mode`, `operator_name`, `shared_paths`, `integrations`, `module_settings`, `worker_config`, `alert_destinations`, `onboarding_complete`

---

#### `PATCH /workspace-settings`

Update specific workspace settings fields.

**Body (all fields optional):**
```json
{
  "studio_name": "Maggie Mars Studio",
  "operator_name": "owner",
  "alert_destinations": {"email_to": [], "webhook_url": ""},
  "integrations": {"gmail_readonly": true},
  "module_settings": {}
}
```

---

#### `POST /workspace-settings/bootstrap`

Full first-run workspace setup (overwrites existing settings).

**Body:** complete `WorkspaceBootstrapBody` — studio identity, paths, style seed, integrations, worker config, module settings.

---

#### `GET /workspace-settings/status`

Returns settings plus a status assessment (completion percentage, missing fields, readiness indicators).

---

#### `POST /workspace-settings/style-seed/rescan`

Re-extract guidance from existing style seed source files. Use after updating referenced files.

---

## openclaw (:8100)

Stateless orchestration engine. Routes job envelopes and enforces permission tiers.

---

### Health

#### `GET /health`

Returns service health.

---

### Dispatch

#### `POST /dispatch/by-trigger`

Main routing endpoint. All n8n workflows terminate here.

**Body:**
```json
{
  "trigger": "lead-source",
  "payload": {
    "source": "form",
    "raw_input": "Hi, I'm looking for a mixing engineer..."
  }
}
```

OpenClaw looks up the matching orchestration rule, validates the tier, creates a job in project-state, and routes to the target module.

**Required header:** `X-Actor: system:n8n` (or appropriate system actor)

---

### Control Room Assistant

#### `POST /assistant`

Control Room Assistant chat.

**Body:**
```json
{
  "message": "How many jobs are waiting for approval?"
}
```

**Response:**
```json
{
  "reply": "There are 3 jobs awaiting approval: 2 lead replies and 1 inbox draft.",
  "fallback_mode": false
}
```

`fallback_mode: true` means Ollama was unavailable and the response is limited to basic status queries.

---

### Orchestration Rules

#### `GET /orchestration-rules`

List all seeded orchestration rules.

**Response:** array of rule objects with `slug`, `name`, `trigger_module`, `trigger_action`, `target_module`, `required_tier`, `approval_required`, `enabled`

---

#### `GET /rule-packs`

List available orchestration rule packs (grouped sets of rules).

---

#### `GET /playbooks`

List starter playbooks (prebuilt operator automation sequences).

---

## Module Endpoints

### lead-intake (:8130)

#### `GET /health`

#### `POST /webhook/lead-intake`

Submit a lead for processing.

**Body:**
```json
{
  "source": "form",
  "raw_input": "Full text of lead submission"
}
```

The module normalizes the lead, scores fit and urgency, drafts a reply, and queues for approval.

---

### inbox-triage (:8140)

#### `GET /health`

#### `POST /webhook/inbox-triage`

Submit an email for triage.

**Body:**
```json
{
  "thread_id": "Gmail thread ID",
  "message_id": "Gmail message ID",
  "subject": "Email subject",
  "body": "Email body text"
}
```

The module classifies the message, drafts a reply, and queues for approval.

---

### content-pipeline (:8110)

#### `GET /health`

#### `POST /draft-social`

Submit a content brief for caption drafting.

**Body:**
```json
{
  "brief": "Behind-the-scenes mixing session for Jamie's album",
  "platforms": ["instagram", "facebook", "threads"],
  "assets": ["/path/to/image.jpg"]
}
```

**Response:** per-platform caption drafts queued for approval.

---

### audio-qc (:8120)

#### `GET /health`

#### `POST /qc/run`

Submit a file for QC analysis.

**Body:**
```json
{
  "candidate_path": "/Volumes/StudioShare/projects/jamie/render_v3.wav",
  "effort_level": 2
}
```

**effort_level values:**
- `1` — LUFS + true peak only
- `2` — adds phase coherence and mono compatibility
- `3` — adds full spectral analysis

**Response:** QC report object with all measurements and `overall_pass` boolean.

---

#### `GET /qc/reports`

List QC reports.

**Query params:**
- `project_id`
- `limit`

---

### session-prep (:8150)

#### `GET /health`

#### `POST /prepare-session`

Submit a stems directory for session preparation.

**Body:**
```json
{
  "project_slug": "jamie-novak",
  "stems_path": "/Volumes/StudioShare/incoming-stems/jamie"
}
```

The module validates all audio files (format, sample rate, bit depth, naming), creates a session folder, and generates a manifest.

---

#### `POST /webhook/session-prep`

n8n webhook entry point (same behavior as `/prepare-session`).

---

### revision-parser (:8160)

#### `GET /health`

#### `POST /parse-revisions`

Submit revision notes for parsing.

**Body:**
```json
{
  "project_slug": "jamie-novak",
  "raw_notes": "Turn up the vocals a bit in the chorus, the kick needs more punch in the second verse",
  "daw": "reaper",
  "session_path": "/Volumes/StudioShare/projects/jamie/session.rpp",
  "worker_slug": "studio-mac"
}
```

**daw values:** `reaper`, `protools`

The module parses the notes into structured change objects with confidence scores, and generates the appropriate script (ReaScript for REAPER, SoundFlow for Pro Tools).

---

### delivery-packager (:8170)

#### `GET /health`

#### `POST /package-delivery`

Assemble a delivery bundle.

**Body:**
```json
{
  "project_slug": "jamie-novak",
  "qc_report_id": "uuid",
  "output_path": "/Volumes/StudioShare/deliveries/jamie"
}
```

Requires a passing QC report — returns `409` if referenced QC report did not pass.

---

### studio-worker (:8190)

#### `GET /health`

#### `GET /runtime`

Worker runtime status: drain state, current task count, worker slug.

---

#### `POST /runtime/drain`

Pause new task intake. In-progress tasks complete normally.

**Required header:** `X-Actor: owner`

---

#### `POST /runtime/resume`

Resume task intake after drain.

**Required header:** `X-Actor: owner`

---

#### `GET /workstation/profile`

Detected DAWs, plugins, and binary paths on this worker machine.

---

#### `GET /workstation/validate`

Validate that configured paths exist and binaries are executable.

---

#### `POST /workstation/dry-run-smoke`

Run a full planning rehearsal without executing in any DAW. Creates disposable manifests, plans, and reports to verify the worker configuration is correct.

---

#### `POST /session-manifest/preview`

Preview a session manifest without committing it to the database.

---

#### `POST /execution-plan/preview`

Preview an execution plan without committing it.

---

## n8n Webhook Endpoints (:5678)

These are the public-facing webhook URLs. All route to OpenClaw internally.

| Webhook | URL |
|---------|-----|
| New lead | `POST /webhook/lead-source-new-lead` |
| New email | `POST /webhook/inbox-source-new-message` |
| Content brief | `POST /webhook/content-source-new-brief` |
| Stems import | `POST /webhook/session-source-import-stems` |
| Revision notes | `POST /webhook/revision-source-notes-received` |
| QC pass | `POST /webhook/qc-source-qc-pass` |
| Status digest | `GET /webhook/control-room-status-digest` |

See [n8n Workflow Reference](n8n-workflows.md) for expected payloads.
