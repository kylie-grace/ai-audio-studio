# Database Schema Reference

**Written for:** Developer Contributor
**Purpose:** Every table, column, constraint, and relationship in the shared Postgres database

---

## Overview

All services share a single PostgreSQL 16 database (`studiodb`). The schema is defined in `infra/db/init.sql` (idempotent — safe to re-run) with additional migrations in `infra/db/migrations/`.

```
studiodb
├── projects              ← CRM project records
├── leads                 ← Lead submissions per project
├── jobs                  ← Job FSM envelopes (all automation work)
├── audit_log             ← Append-only event log
├── inbox_drafts          ← Email triage draft replies
├── social_drafts         ← Social media caption drafts
├── session_manifests     ← Stem validation records
├── qc_reports            ← Audio QC measurement results
├── listening_reports     ← Mix listening review records
├── render_reviews        ← Render review records
├── mix_plans             ← LLM-generated mix decisions
├── revisions             ← Parsed revision change sets
├── worker_nodes          ← Registered studio worker machines
├── workstation_plugins   ← Plugin inventory per worker
├── worker_tasks          ← Bounded remote task queue
├── style_profiles        ← Tone and voice guidance
├── orchestration_rules   ← OpenClaw routing policy
└── workspace_settings    ← Studio configuration (singleton)
```

---

## projects

CRM record for a client project. All automation work references a project.

```sql
CREATE TABLE projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT UNIQUE NOT NULL,
    client_name   TEXT NOT NULL,
    client_email  TEXT,
    service_type  TEXT NOT NULL,    -- mix | master | mix+master | session | other
    status        TEXT NOT NULL DEFAULT 'lead',
    -- lead | intake | prep | mix | qc | revision | delivery | archived
    budget_signal TEXT,             -- low | medium | high | unknown
    timeline      TEXT,
    notes         TEXT,
    effort_level  INTEGER NOT NULL DEFAULT 2 CHECK (effort_level BETWEEN 1 AND 4),
    -- 1=import-only  2=import+qc  3=import+qc+mix-plan  4=full-pipeline
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `slug` is auto-generated from `client_name` (slugified, deduplicated with a counter suffix)
- `effort_level` controls which modules activate for this project
- `status` is not FSM-enforced — it's a display/reporting field updated by operators or modules

---

## jobs

The canonical job envelope. Every unit of automation work is a job. The FSM enforces valid status transitions.

```sql
CREATE TABLE jobs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID REFERENCES projects(id),
    module               TEXT NOT NULL,
    -- lead-intake | inbox-triage | session-prep | audio-qc
    -- mix-planner | revision-parser | delivery-packager | social-drafting
    action               TEXT NOT NULL,
    trigger_type         TEXT NOT NULL,
    -- webhook | filewatch | schedule | operator
    trigger_payload      JSONB,
    status               TEXT NOT NULL DEFAULT 'pending',
    -- pending | in-progress | awaiting-approval | approved | rejected | complete | failed
    priority             TEXT NOT NULL DEFAULT 'normal',   -- low | normal | high
    required_permissions TEXT[] NOT NULL DEFAULT '{}',
    approval_required    BOOLEAN NOT NULL DEFAULT true,
    approved_by          TEXT,
    approved_at          TIMESTAMPTZ,
    artifacts            JSONB NOT NULL DEFAULT '[]',
    error_message        TEXT,
    retry_count          INTEGER NOT NULL DEFAULT 0,
    max_retries          INTEGER NOT NULL DEFAULT 3,
    requested_by         TEXT NOT NULL DEFAULT 'system',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Status FSM (enforced in `services/project-state/src/fsm.py`):**
```
pending → in-progress → awaiting-approval → approved → complete
                                           ↓
                                         rejected
Any state → failed (on error)
```

**Indexes:** `idx_jobs_project`, `idx_jobs_status`, `idx_jobs_module`

---

## audit_log

Append-only. Every state transition, approval, and rejection is permanently recorded here. The application user has no UPDATE or DELETE on this table.

```sql
CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    job_id       UUID REFERENCES jobs(id),
    project_id   UUID REFERENCES projects(id),
    actor        TEXT NOT NULL,
    -- human:owner | human:engineer | system:{service} | worker:{slug}
    action       TEXT NOT NULL,
    -- create | status:in-progress | approve | reject | queue-execution | status:complete | etc.
    tier         INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
    payload      JSONB,              -- full context for this event
    artifact_refs TEXT[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    -- No updated_at — strictly append-only
);
```

**Notes:**
- `tier` is the permission tier of the action (1–4)
- `payload` contains the complete event context (previous state, new state, draft content, etc.)
- Queryable by `date_from`/`date_to`, `job_id`, `actor`

**Indexes:** `idx_audit_job`, `idx_audit_project`, `idx_audit_created`

---

## leads

CRM lead records. Created by `lead-intake` module after receiving a form or DM submission.

```sql
CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id),
    source          TEXT NOT NULL,          -- form | dm | email | referral
    raw_input       TEXT NOT NULL,          -- original submission text
    normalized      JSONB NOT NULL DEFAULT '{}',
    -- {name, email, service_requested, budget, timeline, message}
    fit_score       INTEGER CHECK (fit_score BETWEEN 0 AND 100),
    urgency_score   INTEGER CHECK (urgency_score BETWEEN 0 AND 100),
    draft_reply     TEXT,
    draft_approved  BOOLEAN NOT NULL DEFAULT false,
    draft_sent      BOOLEAN NOT NULL DEFAULT false,
    follow_up_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `fit_score` and `urgency_score` are 0–100 integers from the LLM scoring pass
- `normalized` contains structured fields extracted from the raw submission

---

## inbox_drafts

Email triage draft replies. Created by `inbox-triage` module for each non-noise message.

```sql
CREATE TABLE inbox_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id),
    source_thread   TEXT NOT NULL,          -- Gmail thread ID
    message_type    TEXT NOT NULL,
    -- lead | revision-request | scheduling | payment | admin | noise
    draft_body      TEXT NOT NULL,
    draft_subject   TEXT,
    classification  TEXT,                   -- detailed classification label
    urgency         TEXT,                   -- high | normal | low
    status          TEXT NOT NULL DEFAULT 'pending-review',
    -- pending-review | approved | rejected | sent
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:** `idx_inbox_status`

---

## social_drafts

Social media caption drafts. Created by `content-pipeline` module, one row per platform per brief.

```sql
CREATE TABLE social_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id),
    job_id          UUID REFERENCES jobs(id),
    platform        TEXT NOT NULL,          -- instagram | facebook | threads | linkedin
    caption         TEXT NOT NULL,
    hashtags        TEXT[],
    asset_manifest  JSONB,                  -- [{path, type, label}]
    variant_short   TEXT,                   -- condensed version for character-limited platforms
    status          TEXT NOT NULL DEFAULT 'pending-review',
    -- pending-review | approved | rejected | scheduled | posted
    scheduled_at    TIMESTAMPTZ,
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:** `idx_social_status`

---

## session_manifests

Stem validation and session organization records. Created by `session-prep` module.

```sql
CREATE TABLE session_manifests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects(id) NOT NULL,
    job_id           UUID REFERENCES jobs(id),
    stems            JSONB NOT NULL DEFAULT '[]',
    -- [{name, path, sample_rate, bit_depth, duration_s, channels, valid}]
    issues           JSONB NOT NULL DEFAULT '[]',
    -- [{stem, issue_type, severity, message}]
    template_used    TEXT,
    session_path     TEXT,                  -- destination session folder
    prep_report_path TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    -- pending | validated | issues-found | ready | failed
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## qc_reports

Audio QC measurement results. Created by `audio-qc` module. Referenced by `delivery-packager` as a gate.

```sql
CREATE TABLE qc_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID REFERENCES projects(id) NOT NULL,
    job_id            UUID REFERENCES jobs(id),
    file_path         TEXT NOT NULL,
    lufs_integrated   NUMERIC(6,2),         -- integrated LUFS measurement
    lufs_target       NUMERIC(6,2),         -- target for selected preset
    true_peak_dbfs    NUMERIC(6,2),
    true_peak_ok      BOOLEAN,
    clipping_detected BOOLEAN,
    phase_ok          BOOLEAN,
    mono_ok           BOOLEAN,
    duration_s        NUMERIC(10,3),
    sample_rate       INTEGER,
    bit_depth         INTEGER,
    overall_pass      BOOLEAN NOT NULL,
    issues            JSONB NOT NULL DEFAULT '[]',
    -- [{check, value, threshold, pass, message}]
    report_path       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:** `idx_qc_project`

---

## listening_reports

Mix listening review records. Created by `mix-planner` module during planning rehearsal.

```sql
CREATE TABLE listening_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target          TEXT NOT NULL,          -- streaming | broadcast | film | etc.
    status          TEXT NOT NULL DEFAULT 'preview',
    reference_count INTEGER NOT NULL DEFAULT 0,
    payload         JSONB NOT NULL DEFAULT '{}',
    summary         JSONB NOT NULL DEFAULT '{}',
    next_actions    JSONB NOT NULL DEFAULT '[]',
    created_by      TEXT NOT NULL DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## render_reviews

Render review records. Tracks review candidates and follow-up actions.

```sql
CREATE TABLE render_reviews (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target                TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'preview',
    review_candidate_slug TEXT,
    payload               JSONB NOT NULL DEFAULT '{}',
    follow_up             JSONB NOT NULL DEFAULT '[]',
    created_by            TEXT NOT NULL DEFAULT 'system',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## mix_plans

LLM-generated mix decisions. Created by `mix-planner` module.

```sql
CREATE TABLE mix_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) NOT NULL,
    job_id          UUID REFERENCES jobs(id),
    plan_json       JSONB NOT NULL DEFAULT '{}',
    -- {levels, fx_chains, routing, reference_points, notes}
    status          TEXT NOT NULL DEFAULT 'draft',
    -- draft | approved | executing | complete | failed
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## revisions

Parsed revision change sets. Created by `revision-parser` module from client notes.

```sql
CREATE TABLE revisions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects(id) NOT NULL,
    job_id           UUID REFERENCES jobs(id),
    raw_notes        TEXT NOT NULL,
    parsed_changes   JSONB NOT NULL DEFAULT '[]',
    -- [{element, parameter, direction, value, confidence, human_readable}]
    soundflow_script TEXT,                  -- generated SoundFlow script (Pro Tools)
    reascript_path   TEXT,                  -- generated ReaScript path (REAPER)
    status           TEXT NOT NULL DEFAULT 'parsed',
    -- parsed | approved | executing | complete | failed
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `parsed_changes` has one object per interpreted change, with a `confidence` score (0–1)
- Either `soundflow_script` or `reascript_path` is populated depending on the target DAW
- Both can be null if the notes produced no parseable changes above the confidence threshold

---

## worker_nodes

Registered studio worker machines (Mac Pro or any machine running studio-worker).

```sql
CREATE TABLE worker_nodes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           TEXT UNIQUE NOT NULL,
    display_name   TEXT NOT NULL,
    platform       TEXT NOT NULL DEFAULT 'macos',
    host           TEXT,                    -- IP or hostname
    api_base_url   TEXT,                    -- http://192.168.1.60:8190
    status         TEXT NOT NULL DEFAULT 'idle',
    -- offline | idle | busy | error | retired
    capabilities   JSONB NOT NULL DEFAULT '[]',
    -- ["session-prep", "execute-reascript", "execute-soundflow"]
    watched_paths  JSONB NOT NULL DEFAULT '{}',
    workstation_profile JSONB NOT NULL DEFAULT '{}',
    -- {daws_detected: [...], plugin_count: N, ...}
    workstation_status  JSONB NOT NULL DEFAULT '{}',
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Status meanings:**
- `offline` — no heartbeat in `STALE_WORKER_MINUTES` (default 5)
- `idle` — registered and heartbeating, no active task
- `busy` — currently executing a task
- `error` — last task failed or workstation validation failed
- `retired` — permanently decommissioned, excluded from active queries

**Indexes:** `idx_workers_slug`, `idx_workers_seen`

---

## workstation_plugins

Plugin inventory discovered by the studio-worker workstation scan.

```sql
CREATE TABLE workstation_plugins (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_slug    TEXT NOT NULL REFERENCES worker_nodes(slug) ON DELETE CASCADE,
    plugin_format  TEXT NOT NULL,           -- VST | VST3 | AU | AAX
    name           TEXT NOT NULL,
    vendor         TEXT,
    version        TEXT,
    path           TEXT NOT NULL,
    file_name      TEXT NOT NULL,
    installed      BOOLEAN NOT NULL DEFAULT true,
    source_root    TEXT,
    size_bytes     BIGINT,
    modified_at    TIMESTAMPTZ,
    discovered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(worker_slug, path)
);
```

---

## worker_tasks

Bounded remote task queue. Tasks are enqueued here after an approval and claimed by the worker.

```sql
CREATE TABLE worker_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID REFERENCES jobs(id),
    project_id          UUID REFERENCES projects(id),
    worker_slug         TEXT REFERENCES worker_nodes(slug),
    task_type           TEXT NOT NULL,
    -- session-prep | execute-reascript | execute-soundflow | delivery-package | dry-run-smoke
    required_capability TEXT,
    payload             JSONB NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'queued',
    -- queued | claimed | complete | failed
    priority            TEXT NOT NULL DEFAULT 'normal',
    claimed_by          TEXT,
    claimed_at          TIMESTAMPTZ,
    lease_expires_at    TIMESTAMPTZ,
    result              JSONB NOT NULL DEFAULT '{}',
    error_message       TEXT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Lease recovery:** `project-state` runs a background sweep every `LEASE_SWEEP_INTERVAL_SECONDS` (default 30s). Tasks whose `lease_expires_at` has passed and are still in `claimed` state are re-queued automatically.

**Indexes:** `idx_worker_tasks_status`, `idx_worker_tasks_worker`

---

## style_profiles

Tone, voice, and reference guidance used by LLM calls in all modules.

```sql
CREATE TABLE style_profiles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope              TEXT NOT NULL DEFAULT 'studio',
    -- studio | engineer | client | project
    project_id         UUID REFERENCES projects(id),
    name               TEXT NOT NULL,
    source_type        TEXT NOT NULL,       -- pasted | files | hybrid
    raw_text           TEXT NOT NULL DEFAULT '',
    file_paths         JSONB NOT NULL DEFAULT '[]',
    extracted_guidance JSONB NOT NULL DEFAULT '{}',
    -- {summary, tone_markers, vocabulary, examples, prohibitions}
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `scope=studio` applies to all modules by default
- `scope=project` applies only to that project's jobs
- `extracted_guidance` is the parsed structure that LLM prompts receive
- A default style profile is seeded on `crm-api` startup

**Indexes:** `idx_style_profiles_scope`

---

## orchestration_rules

OpenClaw routing policy. Maps trigger events to target modules with tier enforcement.

```sql
CREATE TABLE orchestration_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              TEXT UNIQUE NOT NULL,
    name              TEXT NOT NULL,
    trigger_module    TEXT NOT NULL,        -- lead-source | inbox-source | etc.
    trigger_action    TEXT NOT NULL,        -- new-lead | new-message | etc.
    target_module     TEXT NOT NULL,        -- lead-intake | inbox-triage | etc.
    required_tier     INTEGER NOT NULL DEFAULT 3 CHECK (required_tier BETWEEN 1 AND 4),
    approval_required BOOLEAN NOT NULL DEFAULT true,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    style_profile_id  UUID REFERENCES style_profiles(id),
    conditions        JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- Default rules are seeded by OpenClaw on startup
- `required_tier` enforces the permission tier model (1=Read, 2=Draft, 3=Queue, 4=Narrow Auto)
- A module cannot self-escalate its tier — only explicit rule changes via admin API can change it

**Indexes:** `idx_rules_trigger`

---

## workspace_settings

Singleton studio configuration row. Exactly one row exists (enforced by `singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton)`).

```sql
CREATE TABLE workspace_settings (
    singleton           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    studio_name         TEXT NOT NULL DEFAULT '',
    host_machine_type   TEXT NOT NULL DEFAULT 'other',
    -- mac-mini | mac-pro | macbook | other
    deployment_mode     TEXT NOT NULL DEFAULT 'single_machine',
    -- single_machine | control_plane_plus_worker
    public_base_url     TEXT NOT NULL DEFAULT '',
    https_mode          TEXT NOT NULL DEFAULT 'local_http',
    -- local_http | local_https | public_https
    operator_name       TEXT NOT NULL DEFAULT 'owner',
    shared_paths        JSONB NOT NULL DEFAULT '{}',
    -- {projects, deliveries, draft_queue, approval_queue, incoming_stems}
    style_seed          JSONB NOT NULL DEFAULT '{}',
    -- {name, raw_text, source_paths}
    alert_destinations  JSONB NOT NULL DEFAULT '{}',
    -- {email_to: [], webhook_url: ""}
    integrations        JSONB NOT NULL DEFAULT '{}',
    -- {n8n, gmail_readonly, gmail_send, instagram, facebook}
    worker_config       JSONB NOT NULL DEFAULT '{}',
    -- full worker settings object
    module_settings     JSONB NOT NULL DEFAULT '{}',
    -- per-module settings: lead_intake, inbox_triage, content_pipeline, etc.
    onboarding_complete BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- Seeded with defaults on `crm-api` startup
- `module_settings` stores all per-module configuration (thresholds, flags, platform lists)
- `worker_config` mirrors `WorkspaceWorkerBody` — DAW paths, dry-run flag, capabilities

---

## schema_migrations

Migration tracking table.

```sql
CREATE TABLE schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`project-state` checks for required migrations on startup and refuses to start if they're missing.

---

## Triggers

All tables with `updated_at` have a `BEFORE UPDATE` trigger that calls `set_updated_at()`:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```

Covered tables: `projects`, `jobs`, `leads`, `session_manifests`, `worker_nodes`, `worker_tasks`, `style_profiles`, `orchestration_rules`

---

## Connection Details

```
Host:     postgres (Docker internal) or 127.0.0.1 (host access)
Port:     5432 (internal only — not exposed to LAN by default)
Database: studiodb
User:     studio
Password: POSTGRES_PASSWORD env var
```

Connection string format:
```
postgresql://studio:{POSTGRES_PASSWORD}@postgres:5432/studiodb
```

All services connect via `POSTGRES_DSN` environment variable.

**Pool sizes:**
- `project-state`: 2–10 connections
- `crm-api`: 1–5 connections
- Other services: typically 1–3 connections
