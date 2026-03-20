"""Jobs router — create and query job envelopes."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import json

from ..db import get_pool
from ..fsm import validate_transition

router = APIRouter()


class CreateJobBody(BaseModel):
    project_id: Optional[str] = None
    module: str
    action: str
    trigger_type: str
    trigger_payload: Optional[dict] = None
    priority: str = "normal"
    approval_required: bool = True
    requested_by: str = "system"


class UpdateStatusBody(BaseModel):
    status: str
    actor: str = "system"
    error_message: Optional[str] = None


@router.post("/", status_code=201)
async def create_job(body: CreateJobBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload,
            priority, approval_required, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *""",
        body.project_id, body.module, body.action, body.trigger_type,
        json.dumps(body.trigger_payload) if body.trigger_payload else None,
        body.priority, body.approval_required, body.requested_by,
    )
    await pool.execute(
        "INSERT INTO audit_log (job_id, actor, action, tier) VALUES ($1,$2,'create',3)",
        str(row["id"]), body.requested_by,
    )
    return dict(row)


@router.get("/{job_id}")
async def get_job(job_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(row)


@router.put("/{job_id}/status")
async def update_status(job_id: str, body: UpdateStatusBody):
    pool = await get_pool()
    job = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        validate_transition(job["status"], body.status, job["approval_required"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    await pool.execute(
        "UPDATE jobs SET status=$1, error_message=$2, updated_at=now() WHERE id=$3",
        body.status, body.error_message, job_id,
    )
    await pool.execute(
        "INSERT INTO audit_log (job_id, actor, action, tier) VALUES ($1,$2,$3,3)",
        job_id, body.actor, f"status:{body.status}",
    )
    return {"job_id": job_id, "status": body.status}


@router.post("/{job_id}/artifacts")
async def attach_artifact(job_id: str, artifact: dict):
    pool = await get_pool()
    await pool.execute(
        """UPDATE jobs SET artifacts = artifacts || $1::jsonb, updated_at=now()
           WHERE id=$2""",
        json.dumps([artifact]), job_id,
    )
    return {"job_id": job_id, "attached": True}


@router.get("/")
async def list_jobs(
    module: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    pool = await get_pool()
    conditions = []
    params = []
    if module:
        params.append(module)
        conditions.append(f"module=${len(params)}")
    if status:
        params.append(status)
        conditions.append(f"status=${len(params)}")
    if project_id:
        params.append(project_id)
        conditions.append(f"project_id=${len(params)}")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    rows = await pool.fetch(
        f"SELECT * FROM jobs {where} ORDER BY created_at DESC LIMIT ${len(params)}",
        *params,
    )
    return [dict(r) for r in rows]
