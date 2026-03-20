"""Approval queue router — human approval and rejection of queued jobs."""
import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..db import get_pool
from ..fsm import validate_transition

router = APIRouter()

# Allowlist of actors permitted to approve/reject jobs.
# Set AUTHORIZED_ACTORS in env as comma-separated list (e.g. "owner,engineer").
# If env var is unset, defaults to ["owner"] to prevent open access.
_RAW = os.environ.get("AUTHORIZED_ACTORS", "owner")
AUTHORIZED_ACTORS: set[str] = {a.strip() for a in _RAW.split(",") if a.strip()}
OPERATOR_API_TOKEN = os.environ.get("OPERATOR_API_TOKEN", "")


def _decode_jsonb(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _require_authorized(actor: str) -> None:
    if actor not in AUTHORIZED_ACTORS:
        raise HTTPException(
            status_code=403,
            detail=f"Actor '{actor}' is not in the authorized actors list. "
                   f"Update AUTHORIZED_ACTORS in your .env to add them.",
        )


def _require_operator_token(token: str | None) -> None:
    if OPERATOR_API_TOKEN and token != OPERATOR_API_TOKEN:
        raise HTTPException(status_code=403, detail="Missing or invalid operator token.")


class RejectBody(BaseModel):
    reason: str


async def _queue_revision_execution_if_applicable(pool, job, approver: str, approved_at: datetime) -> None:
    if job["module"] != "revision-parser":
        return
    trigger_payload = _decode_jsonb(job["trigger_payload"]) or {}
    worker_slug = trigger_payload.get("worker_slug")
    if not worker_slug:
        return
    revision = await pool.fetchrow(
        "SELECT * FROM revisions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
        job["id"],
    )
    if revision is None:
        return
    daw = trigger_payload.get("daw")
    if daw == "protools":
        task_type = "execute-soundflow"
        script_path = revision["soundflow_script"]
        required_capability = "execute-soundflow"
    elif daw == "reaper":
        task_type = "execute-reascript"
        script_path = revision["reascript_path"]
        required_capability = "execute-reascript"
    else:
        return
    if not script_path:
        return
    payload = {
        "revision_id": str(revision["id"]),
        "project_id": str(job["project_id"]) if job["project_id"] else None,
        "daw": daw,
        "session_path": trigger_payload.get("session_path"),
        "script_path": script_path,
        "script_kind": "soundflow" if daw == "protools" else "reascript",
        "approval_job_id": str(job["id"]),
        "approved_by": approver,
        "approved_at": approved_at.isoformat(),
    }
    await pool.execute(
        """UPDATE revisions
           SET status='approved', approved_by=$1, approved_at=$2
           WHERE id=$3""",
        approver,
        approved_at,
        revision["id"],
    )
    await pool.execute(
        """INSERT INTO worker_tasks
           (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,'normal')""",
        job["id"],
        job["project_id"],
        worker_slug,
        task_type,
        required_capability,
        json.dumps(payload),
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1, $2, $3, 'queue-execution', 3, $4::jsonb)""",
        job["id"],
        job["project_id"],
        f"human:{approver}",
        json.dumps({"worker_slug": worker_slug, "task_type": task_type, "revision_id": str(revision["id"])}),
    )


@router.get("/")
async def list_approval_queue():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM jobs WHERE status = 'awaiting-approval' ORDER BY created_at ASC"
    )
    return [dict(r) for r in rows]


@router.post("/{job_id}/approve")
async def approve_job(job_id: str, x_actor: str = Header(...), x_operator_token: str | None = Header(default=None)):
    _require_authorized(x_actor)
    _require_operator_token(x_operator_token)

    pool = await get_pool()
    job = await pool.fetchrow("SELECT * FROM jobs WHERE id = $1", job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        validate_transition(job["status"], "approved", job["approval_required"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    now = datetime.now(timezone.utc)
    await pool.execute(
        """UPDATE jobs SET status='approved', approved_by=$1, approved_at=$2,
           updated_at=now() WHERE id=$3""",
        x_actor, now, job_id,
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier)
           VALUES ($1, $2, $3, 'approve', 3)""",
        job_id, job["project_id"], f"human:{x_actor}",
    )
    await _queue_revision_execution_if_applicable(pool, job, x_actor, now)
    return {"job_id": job_id, "status": "approved", "approved_by": x_actor}


@router.post("/{job_id}/reject")
async def reject_job(job_id: str, body: RejectBody, x_actor: str = Header(...), x_operator_token: str | None = Header(default=None)):
    _require_authorized(x_actor)
    _require_operator_token(x_operator_token)

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
        body.reason, job_id,
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1, $2, $3, 'reject', 3, $4::jsonb)""",
        job_id, job["project_id"], f"human:{x_actor}",
        json.dumps({"reason": body.reason}),
    )
    return {"job_id": job_id, "status": "rejected"}
