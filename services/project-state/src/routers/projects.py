"""Projects router — create and manage studio projects."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import re

from ..db import get_pool

router = APIRouter()


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


class CreateProjectBody(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    service_type: str  # mix | master | mix+master | session | other
    budget_signal: Optional[str] = "unknown"
    timeline: Optional[str] = None
    notes: Optional[str] = None


class UpdateStatusBody(BaseModel):
    status: str


@router.post("/", status_code=201)
async def create_project(body: CreateProjectBody):
    pool = await get_pool()
    slug = slugify(body.client_name)
    # Ensure unique slug
    existing = await pool.fetchval("SELECT COUNT(*) FROM projects WHERE slug LIKE $1", f"{slug}%")
    if existing:
        slug = f"{slug}-{existing + 1}"
    row = await pool.fetchrow(
        """INSERT INTO projects
           (slug, client_name, client_email, service_type, budget_signal, timeline, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        slug, body.client_name, body.client_email, body.service_type,
        body.budget_signal, body.timeline, body.notes,
    )
    return dict(row)


@router.get("/{project_id}")
async def get_project(project_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM projects WHERE id::text=$1 OR slug=$1", project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(row)


@router.get("/{project_id}/detail")
async def get_project_detail(project_id: str):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id::text=$1 OR slug=$1", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_key = project["id"]
    leads = [dict(row) for row in await pool.fetch("SELECT * FROM leads WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    jobs = [dict(row) for row in await pool.fetch("SELECT * FROM jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 40", project_key)]
    revisions = [dict(row) for row in await pool.fetch("SELECT * FROM revisions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    qc_reports = [dict(row) for row in await pool.fetch("SELECT * FROM qc_reports WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    mix_plans = [dict(row) for row in await pool.fetch("SELECT * FROM mix_plans WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    session_manifests = [
        dict(row)
        for row in await pool.fetch("SELECT * FROM session_manifests WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)
    ]
    worker_tasks = [dict(row) for row in await pool.fetch("SELECT * FROM worker_tasks WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30", project_key)]
    audit_entries = [
        dict(row)
        for row in await pool.fetch("SELECT * FROM audit_log WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30", project_key)
    ]

    artifact_inventory: list[dict] = []
    for job in jobs:
        for artifact in job.get("artifacts") or []:
            artifact_inventory.append(
                {
                    "source": "job",
                    "job_id": str(job["id"]),
                    "module": job.get("module"),
                    "action": job.get("action"),
                    "artifact": artifact,
                    "created_at": job.get("updated_at") or job.get("created_at"),
                }
            )

    for task in worker_tasks:
        result = task.get("result") or {}
        for artifact in result.get("artifacts") or []:
            artifact_inventory.append(
                {
                    "source": "worker-task",
                    "task_id": str(task["id"]),
                    "worker_slug": task.get("worker_slug") or task.get("claimed_by"),
                    "task_type": task.get("task_type"),
                    "artifact": artifact,
                    "created_at": task.get("completed_at") or task.get("created_at"),
                }
            )

    artifact_inventory.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "project": dict(project),
        "leads": leads,
        "jobs": jobs,
        "revisions": revisions,
        "qc_reports": qc_reports,
        "mix_plans": mix_plans,
        "session_manifests": session_manifests,
        "worker_tasks": worker_tasks,
        "audit_entries": audit_entries,
        "artifact_inventory": artifact_inventory[:50],
    }


@router.put("/{project_id}/status")
async def update_project_status(project_id: str, body: UpdateStatusBody):
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE projects SET status=$1, updated_at=now() WHERE id=$2",
        body.status, project_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project_id": project_id, "status": body.status}
