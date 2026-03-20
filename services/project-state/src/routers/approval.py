"""Approval queue router — human approval and rejection of queued jobs."""
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..db import get_pool
from ..fsm import validate_transition

router = APIRouter()


class RejectBody(BaseModel):
    reason: str


@router.get("/")
async def list_approval_queue():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM jobs WHERE status = 'awaiting-approval' ORDER BY created_at ASC"
    )
    return [dict(r) for r in rows]


@router.post("/{job_id}/approve")
async def approve_job(job_id: str, x_actor: str = Header(...)):
    pool = await get_pool()
    job = await pool.fetchrow("SELECT * FROM jobs WHERE id = $1", job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        validate_transition(job["status"], "approved", job["approval_required"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await pool.execute(
        """UPDATE jobs SET status='approved', approved_by=$1, approved_at=$2,
           updated_at=now() WHERE id=$3""",
        x_actor, datetime.now(timezone.utc), job_id
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, actor, action, tier)
           VALUES ($1, $2, 'approve', 3)""",
        job_id, f"human:{x_actor}"
    )
    return {"job_id": job_id, "status": "approved", "approved_by": x_actor}


@router.post("/{job_id}/reject")
async def reject_job(job_id: str, body: RejectBody, x_actor: str = Header(...)):
    pool = await get_pool()
    job = await pool.fetchrow("SELECT * FROM jobs WHERE id = $1", job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        validate_transition(job["status"], "rejected", job["approval_required"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await pool.execute(
        """UPDATE jobs SET status='rejected', error_message=$1, updated_at=now()
           WHERE id=$2""",
        body.reason, job_id
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, actor, action, tier, payload)
           VALUES ($1, $2, 'reject', 3, $3)""",
        job_id, f"human:{x_actor}", {"reason": body.reason}
    )
    return {"job_id": job_id, "status": "rejected"}
