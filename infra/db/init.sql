-- AI Audio Studio — Database Schema
-- Idempotent: safe to run multiple times.
-- Append-only audit_log must never be updated or deleted from.

-- ── Extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Projects ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT UNIQUE NOT NULL,
    client_name   TEXT NOT NULL,
    client_email  TEXT,
    service_type  TEXT NOT NULL,
    -- mix | master | mix+master | session | other
    status        TEXT NOT NULL DEFAULT 'lead',
    -- lead | intake | prep | mix | qc | revision | delivery | archived
    budget_signal TEXT,
    -- low | medium | high | unknown
    timeline      TEXT,
    notes         TEXT,
    effort_level  INTEGER NOT NULL DEFAULT 2 CHECK (effort_level BETWEEN 1 AND 4),
    -- 1=import-only  2=import+qc  3=import+qc+mix-plan  4=full-pipeline
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Jobs (canonical job envelope) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
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
    priority             TEXT NOT NULL DEFAULT 'normal',
    -- low | normal | high
    required_permissions TEXT[] NOT NULL DEFAULT '{}',
    approval_required    BOOLEAN NOT NULL DEFAULT true,
    approved_by          TEXT,
    approved_at          TIMESTAMPTZ,
    artifacts            JSONB NOT NULL DEFAULT '[]',
    error_message        TEXT,
    requested_by         TEXT NOT NULL DEFAULT 'system',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit Log (append-only — never UPDATE or DELETE) ─────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL PRIMARY KEY,
    job_id       UUID REFERENCES jobs(id),
    project_id   UUID REFERENCES projects(id),
    actor        TEXT NOT NULL,
    -- system | human:owner | human:engineer | worker:lead-intake | worker:audio-qc etc.
    action       TEXT NOT NULL,
    tier         INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
    payload      JSONB,
    artifact_refs TEXT[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    -- No updated_at — this table is strictly append-only
);

-- ── Leads (CRM records) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id),
    source          TEXT NOT NULL,
    -- form | dm | email | referral
    raw_input       TEXT NOT NULL,
    normalized      JSONB NOT NULL DEFAULT '{}',
    fit_score       INTEGER CHECK (fit_score BETWEEN 0 AND 100),
    urgency_score   INTEGER CHECK (urgency_score BETWEEN 0 AND 100),
    draft_reply     TEXT,
    draft_approved  BOOLEAN NOT NULL DEFAULT false,
    draft_sent      BOOLEAN NOT NULL DEFAULT false,
    follow_up_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Inbox Drafts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id),
    source_thread   TEXT NOT NULL,
    message_type    TEXT NOT NULL,
    -- lead | revision-request | scheduling | payment | admin | noise
    draft_body      TEXT NOT NULL,
    draft_subject   TEXT,
    classification  TEXT,
    urgency         TEXT,
    -- high | normal | low
    status          TEXT NOT NULL DEFAULT 'pending-review',
    -- pending-review | approved | rejected | sent
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Social Drafts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id),
    job_id          UUID REFERENCES jobs(id),
    platform        TEXT NOT NULL,
    -- instagram | facebook | threads | linkedin
    caption         TEXT NOT NULL,
    hashtags        TEXT[],
    asset_manifest  JSONB,
    variant_short   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending-review',
    -- pending-review | approved | rejected | scheduled | posted
    scheduled_at    TIMESTAMPTZ,
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Session Manifests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_manifests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects(id) NOT NULL,
    job_id           UUID REFERENCES jobs(id),
    stems            JSONB NOT NULL DEFAULT '[]',
    -- [{name, path, sample_rate, bit_depth, duration_s, channels, valid}]
    issues           JSONB NOT NULL DEFAULT '[]',
    -- [{stem, issue_type, severity, message}]
    template_used    TEXT,
    session_path     TEXT,
    prep_report_path TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    -- pending | validated | issues-found | ready | failed
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── QC Reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID REFERENCES projects(id) NOT NULL,
    job_id            UUID REFERENCES jobs(id),
    file_path         TEXT NOT NULL,
    lufs_integrated   NUMERIC(6,2),
    lufs_target       NUMERIC(6,2),
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

-- ── Mix Plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mix_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) NOT NULL,
    job_id          UUID REFERENCES jobs(id),
    plan_json       JSONB NOT NULL DEFAULT '{}',
    -- structured mix decisions: levels, fx chains, routing, references
    status          TEXT NOT NULL DEFAULT 'draft',
    -- draft | approved | executing | complete | failed
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Revisions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revisions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects(id) NOT NULL,
    job_id           UUID REFERENCES jobs(id),
    raw_notes        TEXT NOT NULL,
    parsed_changes   JSONB NOT NULL DEFAULT '[]',
    -- [{element, parameter, direction, value, confidence, human_readable}]
    soundflow_script TEXT,
    reascript_path   TEXT,
    status           TEXT NOT NULL DEFAULT 'parsed',
    -- parsed | approved | executing | complete | failed
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_project    ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_module     ON jobs(module);
CREATE INDEX IF NOT EXISTS idx_audit_job       ON audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_project   ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_project   ON leads(project_id);
CREATE INDEX IF NOT EXISTS idx_inbox_status    ON inbox_drafts(status);
CREATE INDEX IF NOT EXISTS idx_social_status   ON social_drafts(status);
CREATE INDEX IF NOT EXISTS idx_qc_project      ON qc_reports(project_id);

-- ── Auto-update updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_projects_updated
        BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_jobs_updated
        BEFORE UPDATE ON jobs
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_leads_updated
        BEFORE UPDATE ON leads
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_manifests_updated
        BEFORE UPDATE ON session_manifests
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
