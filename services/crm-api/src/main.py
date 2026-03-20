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
from pydantic import BaseModel

from .style_profiles import (
    DEFAULT_STYLE_PROFILE_NAME,
    DEFAULT_STYLE_PROFILE_TEXT,
    decode_jsonb,
    extract_guidance,
    serialize_style_profile,
)

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    await seed_default_style_profile(_pool)
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


@app.get("/health")
async def health():
    return {"status": "ok"}


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
    row = await pool.fetchrow("SELECT * FROM projects WHERE id=$1 OR slug=$1", project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    lead_count = await pool.fetchval("SELECT COUNT(*) FROM leads WHERE project_id=$1", row["id"])
    return {**dict(row), "lead_count": lead_count}


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
