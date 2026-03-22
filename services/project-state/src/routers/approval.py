"""Approval queue router — human approval and rejection of queued jobs."""
import json
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..db import get_pool
from ..fsm import validate_transition

logger = logging.getLogger(__name__)

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


async def _build_approval_preview(pool, job) -> dict:
    trigger_payload = _decode_jsonb(job.get("trigger_payload")) or {}
    preview: dict[str, object] = {
        "trigger_type": job.get("trigger_type"),
        "requested_by": job.get("requested_by"),
        "trigger_payload": trigger_payload,
    }

    if job.get("project_id"):
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", job["project_id"])
        if project is not None:
            preview["project"] = {
                "id": str(project["id"]),
                "slug": project["slug"],
                "client_name": project["client_name"],
                "service_type": project["service_type"],
                "status": project["status"],
            }

    if job["module"] == "lead-intake":
        lead_id = trigger_payload.get("lead_id")
        if lead_id:
            lead = await pool.fetchrow("SELECT * FROM leads WHERE id=$1", lead_id)
            if lead is not None:
                preview["kind"] = "lead-reply"
                preview["title"] = f"Lead reply for {preview.get('project', {}).get('client_name', 'new lead')}"
                preview["lead"] = {
                    "id": str(lead["id"]),
                    "source": lead["source"],
                    "raw_input": lead["raw_input"],
                    "normalized": _decode_jsonb(lead["normalized"]),
                    "fit_score": lead["fit_score"],
                    "urgency_score": lead["urgency_score"],
                    "draft_reply": lead["draft_reply"],
                }
    elif job["module"] == "inbox-triage":
        draft = await pool.fetchrow(
            "SELECT * FROM inbox_drafts WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
            job["id"],
        )
        if draft is not None:
            preview["kind"] = "inbox-reply"
            preview["title"] = draft["draft_subject"] or "Inbox reply draft"
            preview["draft"] = {
                "thread_id": draft["source_thread"],
                "message_type": draft["message_type"],
                "classification": draft["classification"],
                "urgency": draft["urgency"],
                "draft_subject": draft["draft_subject"],
                "draft_body": draft["draft_body"],
            }
    elif job["module"] in {"social-drafting", "content-pipeline"}:
        rows = await pool.fetch(
            "SELECT * FROM social_drafts WHERE job_id=$1 ORDER BY platform ASC, created_at ASC",
            job["id"],
        )
        if rows:
            preview["kind"] = "social-drafts"
            preview["title"] = "Social draft review"
            preview["drafts"] = [
                {
                    "platform": row["platform"],
                    "caption": row["caption"],
                    "hashtags": row["hashtags"],
                    "variant_short": row["variant_short"],
                    "status": row["status"],
                }
                for row in rows
            ]
    elif job["module"] == "revision-parser":
        revision = await pool.fetchrow(
            "SELECT * FROM revisions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
            job["id"],
        )
        if revision is not None:
            preview["kind"] = "revision-plan"
            preview["title"] = "Revision execution approval"
            preview["revision"] = {
                "raw_notes": revision["raw_notes"],
                "parsed_changes": _decode_jsonb(revision["parsed_changes"]),
                "soundflow_script": revision["soundflow_script"],
                "reascript_path": revision["reascript_path"],
                "status": revision["status"],
            }
            validation = await _validate_revision_execution_ready(pool, job, revision)
            if validation["blocking_issue"]:
                preview["blocking_issue"] = validation["blocking_issue"]
            preview["execution_readiness"] = validation

    return preview


async def _emit_approval_webhook(pool, job, approver: str, approved_at: datetime) -> None:
    """Fan-out approval event to configured webhook URL (fire-and-forget, never raises)."""
    try:
        row = await pool.fetchrow("SELECT alert_destinations FROM workspace_settings LIMIT 1")
        if row is None:
            return
        destinations = _decode_jsonb(row["alert_destinations"]) or {}
        webhook_url = destinations.get("webhook_url", "").strip()
        if not webhook_url:
            return
        payload = {
            "event": "job.approved",
            "job_id": str(job["id"]),
            "module": job["module"],
            "trigger_type": job.get("trigger_type"),
            "project_id": str(job["project_id"]) if job["project_id"] else None,
            "approver": approver,
            "approved_at": approved_at.isoformat(),
            "trigger_payload": _decode_jsonb(job.get("trigger_payload")),
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info("Approval webhook delivered to %s (status %s)", webhook_url, resp.status_code)
    except Exception as exc:
        logger.warning("Approval webhook failed (non-fatal): %s", exc)


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


async def _validate_revision_execution_ready(pool, job, revision=None) -> dict:
    trigger_payload = _decode_jsonb(job.get("trigger_payload")) or {}
    daw = trigger_payload.get("daw")
    worker_slug = trigger_payload.get("worker_slug")
    worker = None
    blocking_issue = None
    required_capability = None
    script_path = None
    if daw == "protools":
        required_capability = "execute-soundflow"
        script_path = revision["soundflow_script"] if revision is not None else None
    elif daw == "reaper":
        required_capability = "execute-reascript"
        script_path = revision["reascript_path"] if revision is not None else None
    elif job["module"] == "revision-parser":
        blocking_issue = "Revision approval is missing a supported DAW target."

    if not blocking_issue and not worker_slug:
        blocking_issue = "Revision approval cannot queue execution until a worker is assigned."

    if worker_slug:
        worker = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1 AND status <> 'retired'", worker_slug)
        if worker is None and not blocking_issue:
            blocking_issue = f"Assigned worker '{worker_slug}' is not registered."
    if worker is not None and required_capability:
        capabilities = _decode_jsonb(worker.get("capabilities")) or []
        if required_capability not in capabilities and not blocking_issue:
            blocking_issue = f"Worker '{worker_slug}' does not advertise {required_capability}."
    if required_capability and not script_path and not blocking_issue:
        blocking_issue = f"{required_capability} is required, but no executable script artifact was generated."

    return {
        "worker_slug": worker_slug,
        "worker_registered": worker is not None,
        "required_capability": required_capability,
        "script_ready": bool(script_path),
        "blocking_issue": blocking_issue,
    }


@router.get("/")
async def list_approval_queue():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM jobs WHERE status = 'awaiting-approval' ORDER BY created_at ASC"
    )
    items = []
    for row in rows:
        item = dict(row)
        item["preview"] = await _build_approval_preview(pool, row)
        items.append(item)
    return items


@router.post("/{job_id}/approve")
async def approve_job(job_id: str, x_actor: str = Header(...), x_operator_token: str | None = Header(default=None)):
    _require_authorized(x_actor)
    _require_operator_token(x_operator_token)

    pool = await get_pool()
    job = await pool.fetchrow("SELECT * FROM jobs WHERE id = $1", job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["module"] == "revision-parser":
        revision = await pool.fetchrow(
            "SELECT * FROM revisions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
            job_id,
        )
        validation = await _validate_revision_execution_ready(pool, job, revision)
        if validation["blocking_issue"]:
            raise HTTPException(status_code=409, detail=validation["blocking_issue"])
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
    await _emit_approval_webhook(pool, job, x_actor, now)
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
