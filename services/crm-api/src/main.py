# SPDX-License-Identifier: AGPL-3.0-or-later
"""CRM API — lead and project records."""

from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .style_profiles import (
    DEFAULT_STYLE_PROFILE_NAME,
    DEFAULT_STYLE_PROFILE_TEXT,
    extract_guidance,
    serialize_style_profile,
)
from .workspace_settings import (
    default_workspace_settings,
    normalize_workspace_settings,
    serialize_workspace_settings,
    workspace_status,
)

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    await ensure_workspace_settings_table(_pool)
    await seed_default_style_profile(_pool)
    await seed_default_workspace_settings(_pool)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="CRM API", lifespan=lifespan)


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


class CreateProjectBody(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    service_type: str
    budget_signal: str = "unknown"
    timeline: Optional[str] = None
    notes: Optional[str] = None
    effort_level: int = 2


class CreateLeadBody(BaseModel):
    project_id: str
    source: str
    raw_input: str
    normalized: dict = {}
    fit_score: Optional[int] = None
    urgency_score: Optional[int] = None
    draft_reply: Optional[str] = None


class CreateStyleProfileBody(BaseModel):
    name: str
    scope: str = "studio"
    project_id: Optional[str] = None
    raw_text: str = ""
    file_paths: list[str] = []


class WorkspaceSharedPathsBody(BaseModel):
    projects: str = ""
    deliveries: str = ""
    draft_queue: str = ""
    approval_queue: str = ""
    incoming_stems: str = ""


class WorkspaceStyleSeedBody(BaseModel):
    name: str = DEFAULT_STYLE_PROFILE_NAME
    raw_text: str = DEFAULT_STYLE_PROFILE_TEXT
    source_paths: list[str] = []


class WorkspaceAlertDestinationsBody(BaseModel):
    email_to: list[str] = []
    webhook_url: str = ""


class WorkspaceIntegrationsBody(BaseModel):
    n8n: bool = True
    gmail_readonly: bool = False
    gmail_send: bool = False
    instagram: bool = False
    facebook: bool = False


class WorkspaceWorkerBody(BaseModel):
    enabled: bool = False
    worker_slug: str = ""
    worker_api_base_url: str = ""
    display_name: str = ""
    platform: str = "macos"
    default_daw: str = "reaper"
    supported_daws: list[str] = Field(default_factory=lambda: ["reaper"])
    adapter_capabilities: list[str] = Field(default_factory=lambda: ["execute-reascript"])
    dry_run_daw: bool = False
    reaper_binary_path: str = ""
    protools_app_path: str = ""
    soundflow_cli_path: str = ""
    notes: str = ""


class LeadIntakeSettingsBody(BaseModel):
    enabled: bool = True
    minimum_fit_score: int = 55
    response_sla_hours: int = 24
    auto_create_projects: bool = True


class InboxTriageSettingsBody(BaseModel):
    enabled: bool = True
    ignore_noise: bool = True
    high_priority_types: list[str] = ["payment", "revision-request"]


class ContentPipelineSettingsBody(BaseModel):
    enabled: bool = True
    default_platforms: list[str] = ["instagram", "facebook"]
    require_assets: bool = False
    approval_required: bool = True


class AudioQcSettingsBody(BaseModel):
    enabled: bool = True
    default_target: str = "streaming"
    hard_fail_on_clipping: bool = True


class SessionPrepSettingsBody(BaseModel):
    enabled: bool = True
    filename_space_warning: bool = True
    remote_enabled: bool = True


class RevisionParserSettingsBody(BaseModel):
    enabled: bool = True
    default_daw: str = "reaper"
    confidence_threshold: float = 0.85


class DeliveryPackagerSettingsBody(BaseModel):
    enabled: bool = True
    require_qc_pass: bool = True
    include_manifest: bool = True


class MixPlannerSettingsBody(BaseModel):
    enabled: bool = True
    default_focus: list[str] = ["vocals", "drums", "low-end translation"]


class WorkspaceModuleSettingsBody(BaseModel):
    lead_intake: LeadIntakeSettingsBody = LeadIntakeSettingsBody()
    inbox_triage: InboxTriageSettingsBody = InboxTriageSettingsBody()
    content_pipeline: ContentPipelineSettingsBody = ContentPipelineSettingsBody()
    audio_qc: AudioQcSettingsBody = AudioQcSettingsBody()
    session_prep: SessionPrepSettingsBody = SessionPrepSettingsBody()
    revision_parser: RevisionParserSettingsBody = RevisionParserSettingsBody()
    delivery_packager: DeliveryPackagerSettingsBody = DeliveryPackagerSettingsBody()
    mix_planner: MixPlannerSettingsBody = MixPlannerSettingsBody()


class WorkspaceBootstrapBody(BaseModel):
    studio_name: str
    host_machine_type: str = "other"
    deployment_mode: str = "single_machine"
    public_base_url: str = ""
    https_mode: str = "local_http"
    operator_name: str
    shared_paths: WorkspaceSharedPathsBody
    style_seed: WorkspaceStyleSeedBody
    alert_destinations: WorkspaceAlertDestinationsBody = WorkspaceAlertDestinationsBody()
    integrations: WorkspaceIntegrationsBody = WorkspaceIntegrationsBody()
    worker: WorkspaceWorkerBody = WorkspaceWorkerBody()
    module_settings: WorkspaceModuleSettingsBody = WorkspaceModuleSettingsBody()


async def seed_default_style_profile(pool: asyncpg.Pool) -> None:
    existing = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        DEFAULT_STYLE_PROFILE_NAME,
    )
    if existing is not None:
        return
    await pool.execute(
        """INSERT INTO style_profiles
           (scope, name, source_type, raw_text, file_paths, extracted_guidance)
           VALUES ('studio',$1,'pasted',$2,'[]'::jsonb,$3::jsonb)""",
        DEFAULT_STYLE_PROFILE_NAME,
        DEFAULT_STYLE_PROFILE_TEXT,
        json.dumps(extract_guidance(DEFAULT_STYLE_PROFILE_TEXT)),
    )


async def ensure_workspace_settings_table(pool: asyncpg.Pool) -> None:
    await pool.execute(
        """CREATE TABLE IF NOT EXISTS workspace_settings (
               singleton           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
               studio_name         TEXT NOT NULL DEFAULT '',
               host_machine_type   TEXT NOT NULL DEFAULT 'other',
               deployment_mode     TEXT NOT NULL DEFAULT 'single_machine',
               public_base_url     TEXT NOT NULL DEFAULT '',
               https_mode          TEXT NOT NULL DEFAULT 'local_http',
               operator_name       TEXT NOT NULL DEFAULT 'owner',
               shared_paths        JSONB NOT NULL DEFAULT '{}'::jsonb,
               style_seed          JSONB NOT NULL DEFAULT '{}'::jsonb,
               alert_destinations  JSONB NOT NULL DEFAULT '{}'::jsonb,
               integrations        JSONB NOT NULL DEFAULT '{}'::jsonb,
               worker_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
               module_settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
               onboarding_complete BOOLEAN NOT NULL DEFAULT false,
               created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
               updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
           )"""
    )
    await pool.execute("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS host_machine_type TEXT NOT NULL DEFAULT 'other'")
    await pool.execute("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS module_settings JSONB NOT NULL DEFAULT '{}'::jsonb")


async def seed_default_workspace_settings(pool: asyncpg.Pool) -> None:
    existing = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    if existing is not None:
        return
    defaults = default_workspace_settings()
    await pool.execute(
        """INSERT INTO workspace_settings
           (singleton, studio_name, host_machine_type, deployment_mode, public_base_url, https_mode, operator_name,
            shared_paths, style_seed, alert_destinations, integrations, worker_config, module_settings, onboarding_complete)
           VALUES (TRUE,$1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13)""",
        defaults["studio_name"],
        defaults["host_machine_type"],
        defaults["deployment_mode"],
        defaults["public_base_url"],
        defaults["https_mode"],
        defaults["operator_name"],
        json.dumps(defaults["shared_paths"]),
        json.dumps(defaults["style_seed"]),
        json.dumps(defaults["alert_destinations"]),
        json.dumps(defaults["integrations"]),
        json.dumps(defaults["worker"]),
        json.dumps(defaults["module_settings"]),
        defaults["onboarding_complete"],
    )


def combined_style_seed(raw_text: str, file_paths: list[str]) -> tuple[str, str]:
    file_bodies: list[str] = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail=f"Style source file not found: {file_path}")
        file_bodies.append(path.read_text(encoding="utf-8", errors="ignore"))

    combined = "\n\n".join(part for part in [raw_text.strip(), *file_bodies] if part).strip()
    if not combined:
        raise HTTPException(status_code=422, detail="Provide style seed text, style seed files, or both")

    source_type = "hybrid" if raw_text.strip() and file_paths else "files" if file_paths else "pasted"
    return combined, source_type


def serialize_workstation_config(settings: dict) -> list[dict]:
    worker = settings.get("worker") or {}
    if not any(
        [
            worker.get("worker_slug"),
            worker.get("worker_api_base_url"),
            worker.get("display_name"),
            worker.get("supported_daws"),
        ]
    ):
        return []
    return [
        {
            "slug": worker.get("worker_slug") or "",
            "enabled": bool(worker.get("enabled", False)),
            "api_base_url": worker.get("worker_api_base_url") or "",
            "display_name": worker.get("display_name") or "",
            "platform": worker.get("platform") or "macos",
            "default_daw": worker.get("default_daw") or "reaper",
            "supported_daws": worker.get("supported_daws") or [],
            "adapter_capabilities": worker.get("adapter_capabilities") or [],
            "notes": worker.get("notes") or "",
            "status_source": "workspace-settings",
        }
    ]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    project_count = await pool.fetchval("SELECT COUNT(*) FROM projects")
    lead_count = await pool.fetchval("SELECT COUNT(*) FROM leads")
    style_profile_count = await pool.fetchval("SELECT COUNT(*) FROM style_profiles")
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    settings = serialize_workspace_settings(row)
    return {
        "status": "ok",
        "project_count": project_count,
        "lead_count": lead_count,
        "style_profile_count": style_profile_count,
        "studio_name": settings.get("studio_name", ""),
        "operator_name": settings.get("operator_name", ""),
        "integrations": settings.get("integrations", {}),
    }


@app.post("/projects", status_code=201)
async def create_project(body: CreateProjectBody):
    pool = await get_pool()
    slug = slugify(body.client_name)
    existing = await pool.fetchval("SELECT COUNT(*) FROM projects WHERE slug LIKE $1", f"{slug}%")
    if existing:
        slug = f"{slug}-{existing + 1}"
    row = await pool.fetchrow(
        """INSERT INTO projects
           (slug, client_name, client_email, service_type, budget_signal, timeline, notes, effort_level)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *""",
        slug,
        body.client_name,
        body.client_email,
        body.service_type,
        body.budget_signal,
        body.timeline,
        body.notes,
        body.effort_level,
    )
    return dict(row)


@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM projects WHERE id::text=$1 OR slug=$1", project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    lead_count = await pool.fetchval("SELECT COUNT(*) FROM leads WHERE project_id=$1", row["id"])
    return {**dict(row), "lead_count": lead_count}


@app.get("/projects")
async def list_projects(limit: int = Query(50, le=200)):
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT $1", limit)
    projects = []
    for row in rows:
        lead_count = await pool.fetchval("SELECT COUNT(*) FROM leads WHERE project_id=$1", row["id"])
        projects.append({**dict(row), "lead_count": lead_count})
    return projects


@app.post("/leads", status_code=201)
async def create_lead(body: CreateLeadBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT id FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    row = await pool.fetchrow(
        """INSERT INTO leads
           (project_id, source, raw_input, normalized, fit_score, urgency_score, draft_reply)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
           RETURNING *""",
        body.project_id,
        body.source,
        body.raw_input,
        json.dumps(body.normalized),
        body.fit_score,
        body.urgency_score,
        body.draft_reply,
    )
    return dict(row)


@app.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM leads WHERE id=$1", lead_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return dict(row)


@app.get("/leads")
async def list_leads(project_id: Optional[str] = Query(None), limit: int = Query(50, le=200)):
    pool = await get_pool()
    if project_id:
        rows = await pool.fetch(
            "SELECT * FROM leads WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2",
            project_id,
            limit,
        )
    else:
        rows = await pool.fetch("SELECT * FROM leads ORDER BY created_at DESC LIMIT $1", limit)
    return [dict(row) for row in rows]


@app.post("/style-profiles", status_code=201)
async def create_style_profile(body: CreateStyleProfileBody):
    pool = await get_pool()
    if body.project_id:
        project = await pool.fetchrow("SELECT id FROM projects WHERE id=$1", body.project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

    file_bodies: list[str] = []
    for file_path in body.file_paths:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail=f"Style source file not found: {file_path}")
        file_bodies.append(path.read_text(encoding="utf-8", errors="ignore"))

    combined = "\n\n".join(part for part in [body.raw_text.strip(), *file_bodies] if part).strip()
    if not combined:
        raise HTTPException(status_code=422, detail="Provide raw_text, file_paths, or both")

    source_type = "hybrid" if body.raw_text.strip() and body.file_paths else "files" if body.file_paths else "pasted"
    row = await pool.fetchrow(
        """INSERT INTO style_profiles
           (scope, project_id, name, source_type, raw_text, file_paths, extracted_guidance)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
           RETURNING *""",
        body.scope,
        body.project_id,
        body.name,
        source_type,
        combined,
        json.dumps(body.file_paths),
        json.dumps(extract_guidance(combined)),
    )
    return serialize_style_profile(row)


@app.get("/style-profiles")
async def list_style_profiles(scope: Optional[str] = Query(None), project_id: Optional[str] = Query(None)):
    pool = await get_pool()
    if scope and project_id:
        rows = await pool.fetch(
            "SELECT * FROM style_profiles WHERE scope=$1 AND project_id=$2 ORDER BY created_at DESC",
            scope,
            project_id,
        )
    elif scope:
        rows = await pool.fetch(
            "SELECT * FROM style_profiles WHERE scope=$1 ORDER BY created_at DESC",
            scope,
        )
    elif project_id:
        rows = await pool.fetch(
            "SELECT * FROM style_profiles WHERE project_id=$1 ORDER BY created_at DESC",
            project_id,
        )
    else:
        rows = await pool.fetch("SELECT * FROM style_profiles ORDER BY created_at DESC")
    return [serialize_style_profile(row) for row in rows]


@app.get("/style-profiles/{profile_id}")
async def get_style_profile(profile_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM style_profiles WHERE id=$1", profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    return serialize_style_profile(row)


@app.get("/workspace-settings")
async def get_workspace_settings():
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    return serialize_workspace_settings(row)


class WorkspaceSettingsPatch(BaseModel):
    studio_name: str | None = None
    host_machine_type: str | None = None
    operator_name: str | None = None
    public_base_url: str | None = None
    alert_destinations: dict | None = None
    integrations: dict | None = None
    module_settings: dict | None = None
    shared_paths: dict | None = None
    style_seed: dict | None = None
    onboarding_complete: bool | None = None


@app.patch("/workspace-settings")
async def patch_workspace_settings(body: WorkspaceSettingsPatch):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    current_settings = serialize_workspace_settings(existing)
    patch_payload = body.model_dump(exclude_none=True)
    if not patch_payload:
        raise HTTPException(status_code=422, detail="No fields provided to update")
    normalized_patch = normalize_workspace_settings({**current_settings, **patch_payload})
    updates: list[str] = ["updated_at = now()"]
    values: list = []
    idx = 1

    simple_fields = ["studio_name", "host_machine_type", "operator_name", "public_base_url", "onboarding_complete"]
    json_fields = ["alert_destinations", "integrations", "module_settings", "shared_paths", "style_seed"]

    for field in simple_fields:
        val = normalized_patch.get(field)
        if val is not None:
            updates.append(f"{field} = ${idx}")
            values.append(val)
            idx += 1

    for field in json_fields:
        val = normalized_patch.get(field)
        if val is not None:
            updates.append(f"{field} = ${idx}::jsonb")
            values.append(json.dumps(val))
            idx += 1

    await pool.execute(
        f"UPDATE workspace_settings SET {', '.join(updates)} WHERE singleton = TRUE",
        *values,
    )
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    return serialize_workspace_settings(row)


@app.get("/workstations")
async def list_workstations():
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    settings = serialize_workspace_settings(row)
    return serialize_workstation_config(settings)


@app.get("/workspace-settings/status")
async def get_workspace_settings_status():
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    settings = serialize_workspace_settings(row)
    style_profile_count = await pool.fetchval("SELECT COUNT(*) FROM style_profiles WHERE scope='studio'")
    return {
        "settings": settings,
        **workspace_status(settings, style_profile_count),
    }


@app.post("/workspace-settings/style-seed/rescan")
async def rescan_workspace_style_seed():
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    settings = serialize_workspace_settings(row)
    style_seed = settings.get("style_seed") or {}
    style_seed_text, source_type = combined_style_seed(style_seed.get("raw_text", ""), style_seed.get("source_paths", []))
    extracted = extract_guidance(style_seed_text)

    existing_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        style_seed.get("name", DEFAULT_STYLE_PROFILE_NAME),
    )
    if existing_profile is None:
        await pool.execute(
            """INSERT INTO style_profiles
               (scope, name, source_type, raw_text, file_paths, extracted_guidance)
               VALUES ('studio',$1,$2,$3,$4::jsonb,$5::jsonb)""",
            style_seed.get("name", DEFAULT_STYLE_PROFILE_NAME),
            source_type,
            style_seed_text,
            json.dumps(style_seed.get("source_paths", [])),
            json.dumps(extracted),
        )
    else:
        await pool.execute(
            """UPDATE style_profiles
               SET source_type=$2,
                   raw_text=$3,
                   file_paths=$4::jsonb,
                   extracted_guidance=$5::jsonb,
                   updated_at=now()
               WHERE id=$1""",
            existing_profile["id"],
            source_type,
            style_seed_text,
            json.dumps(style_seed.get("source_paths", [])),
            json.dumps(extracted),
        )

    return {
        "status": "ok",
        "style_profile_name": style_seed.get("name", DEFAULT_STYLE_PROFILE_NAME),
        "source_type": source_type,
        "source_count": len(style_seed.get("source_paths", [])),
        "summary": extracted.get("summary", ""),
    }


@app.post("/workspace-settings/bootstrap")
async def bootstrap_workspace_settings(body: WorkspaceBootstrapBody):
    pool = await get_pool()
    style_seed_text, source_type = combined_style_seed(body.style_seed.raw_text, body.style_seed.source_paths)

    await pool.execute(
        """INSERT INTO workspace_settings
           (singleton, studio_name, host_machine_type, deployment_mode, public_base_url, https_mode, operator_name,
            shared_paths, style_seed, alert_destinations, integrations, worker_config, module_settings, onboarding_complete, updated_at)
           VALUES (TRUE,$1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,TRUE,now())
           ON CONFLICT (singleton) DO UPDATE SET
             studio_name=EXCLUDED.studio_name,
             host_machine_type=EXCLUDED.host_machine_type,
             deployment_mode=EXCLUDED.deployment_mode,
             public_base_url=EXCLUDED.public_base_url,
             https_mode=EXCLUDED.https_mode,
             operator_name=EXCLUDED.operator_name,
             shared_paths=EXCLUDED.shared_paths,
             style_seed=EXCLUDED.style_seed,
             alert_destinations=EXCLUDED.alert_destinations,
             integrations=EXCLUDED.integrations,
             worker_config=EXCLUDED.worker_config,
             module_settings=EXCLUDED.module_settings,
             onboarding_complete=EXCLUDED.onboarding_complete,
             updated_at=now()""",
        body.studio_name.strip(),
        body.host_machine_type,
        body.deployment_mode,
        body.public_base_url.strip(),
        body.https_mode,
        body.operator_name.strip(),
        json.dumps(body.shared_paths.model_dump()),
        json.dumps(body.style_seed.model_dump()),
        json.dumps(body.alert_destinations.model_dump()),
        json.dumps(body.integrations.model_dump()),
        json.dumps(body.worker.model_dump()),
        json.dumps(body.module_settings.model_dump()),
    )

    existing_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        body.style_seed.name,
    )
    if existing_profile is None:
        await pool.execute(
            """INSERT INTO style_profiles
               (scope, name, source_type, raw_text, file_paths, extracted_guidance)
               VALUES ('studio',$1,$2,$3,$4::jsonb,$5::jsonb)""",
            body.style_seed.name,
            source_type,
            style_seed_text,
            json.dumps(body.style_seed.source_paths),
            json.dumps(extract_guidance(style_seed_text)),
        )
    else:
        await pool.execute(
            """UPDATE style_profiles
               SET source_type=$2,
                   raw_text=$3,
                   file_paths=$4::jsonb,
                   extracted_guidance=$5::jsonb,
                   updated_at=now()
               WHERE id=$1""",
            existing_profile["id"],
            source_type,
            style_seed_text,
            json.dumps(body.style_seed.source_paths),
            json.dumps(extract_guidance(style_seed_text)),
        )

    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    settings = serialize_workspace_settings(row)
    style_profile_count = await pool.fetchval("SELECT COUNT(*) FROM style_profiles WHERE scope='studio'")
    return {
        "settings": settings,
        **workspace_status(settings, style_profile_count),
    }
