"""social-drafting worker."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="social-drafting", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def load_module_settings(pool: asyncpg.Pool) -> dict:
    row = await pool.fetchrow("SELECT module_settings FROM workspace_settings WHERE singleton = TRUE")
    if row is None or not row["module_settings"]:
        return {}
    value = row["module_settings"]
    return json.loads(value) if isinstance(value, str) else dict(value)


async def require_module_enabled(pool: asyncpg.Pool, module_key: str) -> dict:
    module_settings = (await load_module_settings(pool)).get(module_key, {})
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


class DraftBody(BaseModel):
    project_id: str
    brief: str = Field(min_length=1)
    platform: str = "instagram"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("content_pipeline", {})
    draft_count = await pool.fetchval("SELECT COUNT(*) FROM social_drafts")
    return {
        "status": "ok",
        "module": "social-drafting",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "draft_count": draft_count,
        "deprecation_note": "Standalone social-drafting is legacy; content-pipeline is the primary social drafting runtime.",
    }


@app.post("/draft-social", status_code=201)
async def draft_social(body: DraftBody):
    pool = await get_pool()
    await require_module_enabled(pool, "content_pipeline")
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    caption = f"{project['client_name']}: {body.brief.strip()} Review before posting."
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'social-drafting','draft-social','operator',$2::jsonb,'awaiting-approval',true,'worker:social-drafting')
           RETURNING *""",
        body.project_id,
        json.dumps(body.model_dump()),
    )
    row = await pool.fetchrow(
        """INSERT INTO social_drafts
           (project_id, job_id, platform, caption, hashtags, asset_manifest, variant_short, status)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'pending-review')
           RETURNING *""",
        body.project_id,
        job["id"],
        body.platform,
        caption,
        ["#mixing", "#mastering", "#studio"],
        json.dumps([]),
        caption[:150],
    )
    return {"job_id": str(job["id"]), "draft": dict(row)}
