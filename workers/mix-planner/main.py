"""mix-planner worker."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="mix-planner", lifespan=lifespan)


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


class MixPlanBody(BaseModel):
    project_id: str
    notes: str | None = None
    stems: list[str] = []


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("mix_planner", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='mix-planner' AND status='awaiting-approval'")
    plan_count = await pool.fetchval("SELECT COUNT(*) FROM mix_plans")
    return {
        "status": "ok",
        "module": "mix-planner",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "plan_count": plan_count,
    }


@app.post("/mix-plan", status_code=201)
async def mix_plan(body: MixPlanBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    plan = {
        "gain_staging": "Check rough balances before processing",
        "focus": ["vocals", "drums", "low-end translation"],
        "notes": body.notes or "No additional notes supplied",
        "stems": body.stems,
    }
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'mix-planner','draft-mix-plan','operator',$2::jsonb,'awaiting-approval',true,'worker:mix-planner')
           RETURNING *""",
        body.project_id,
        json.dumps({"stems": body.stems}),
    )
    row = await pool.fetchrow(
        """INSERT INTO mix_plans
           (project_id, job_id, plan_json, status)
           VALUES ($1,$2,$3::jsonb,'draft')
           RETURNING *""",
        body.project_id,
        job["id"],
        json.dumps(plan),
    )
    return {"job_id": str(job["id"]), "mix_plan_id": str(row["id"]), "plan": plan}
