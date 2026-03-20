"""Audit log router — append-only, never update or delete."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional

from ..db import get_pool

router = APIRouter()

# Only these internal callers may write to audit_log directly
_INTERNAL_ACTORS = {"system", "system:approved-send", "system:openclaw"}


class AuditEntry(BaseModel):
    job_id: Optional[str] = None
    project_id: Optional[str] = None
    actor: str
    action: str
    tier: int
    payload: Optional[dict] = None
    artifact_refs: Optional[list[str]] = None


@router.post("/", status_code=201)
async def append_audit(entry: AuditEntry, request: Request):
    # Restrict direct writes to internal callers via header
    caller = request.headers.get("X-Internal-Caller")
    if caller != "openclaw":
        raise HTTPException(
            status_code=403,
            detail="Direct audit log writes are restricted to internal services."
        )
    if entry.tier not in (1, 2, 3, 4):
        raise HTTPException(status_code=422, detail="tier must be 1–4")

    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO audit_log
           (job_id, project_id, actor, action, tier, payload, artifact_refs)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at""",
        entry.job_id, entry.project_id, entry.actor, entry.action,
        entry.tier, entry.payload, entry.artifact_refs,
    )
    return {"id": row["id"], "created_at": row["created_at"]}


@router.get("/")
async def get_audit_log(
    job_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
):
    pool = await get_pool()
    conditions = []
    params: list = []

    if job_id:
        params.append(job_id)
        conditions.append(f"job_id=${len(params)}")
    if project_id:
        params.append(project_id)
        conditions.append(f"project_id=${len(params)}")
    if actor:
        params.append(actor)
        conditions.append(f"actor=${len(params)}")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params += [limit, offset]
    rows = await pool.fetch(
        f"""SELECT * FROM audit_log {where}
            ORDER BY created_at ASC
            LIMIT ${len(params)-1} OFFSET ${len(params)}""",
        *params,
    )
    return [dict(r) for r in rows]
