"""Projects router — create and manage studio projects."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import json
import mimetypes
import re

from ..db import get_pool

router = APIRouter()

TEXT_PREVIEW_SUFFIXES = {
    ".json",
    ".txt",
    ".log",
    ".lua",
    ".py",
    ".js",
    ".csv",
    ".md",
    ".rpp",
}


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


def _artifact_path_from_payload(artifact: dict) -> str | None:
    for key in ("path", "manifest_path", "report_path", "changes_path", "script_path", "delivery_path"):
        value = artifact.get(key)
        if isinstance(value, str) and value.strip():
            return value
    result = artifact.get("result")
    if isinstance(result, dict):
        return _artifact_path_from_payload(result)
    return None


def _serialize_row(row) -> dict:
    data = dict(row)
    for key, value in list(data.items()):
        if isinstance(value, str):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                continue
            if isinstance(decoded, (dict, list)):
                data[key] = decoded
    return data


def _artifact_inventory(jobs: list[dict], worker_tasks: list[dict]) -> list[dict]:
    artifact_inventory: list[dict] = []
    for job in jobs:
        for artifact in job.get("artifacts") or []:
            artifact_inventory.append(
                {
                    "artifact_id": len(artifact_inventory),
                    "source": "job",
                    "job_id": str(job["id"]),
                    "module": job.get("module"),
                    "action": job.get("action"),
                    "artifact": artifact,
                    "artifact_path": _artifact_path_from_payload(artifact),
                    "created_at": job.get("updated_at") or job.get("created_at"),
                }
            )

    for task in worker_tasks:
        result = task.get("result") or {}
        for artifact in result.get("artifacts") or []:
            artifact_inventory.append(
                {
                    "artifact_id": len(artifact_inventory),
                    "source": "worker-task",
                    "task_id": str(task["id"]),
                    "worker_slug": task.get("worker_slug") or task.get("claimed_by"),
                    "task_type": task.get("task_type"),
                    "artifact": artifact,
                    "artifact_path": _artifact_path_from_payload(artifact),
                    "created_at": task.get("completed_at") or task.get("created_at"),
                }
            )

    artifact_inventory.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    for index, entry in enumerate(artifact_inventory):
        entry["artifact_id"] = index
    return artifact_inventory


def _review_summary(qc_reports: list[dict], revisions: list[dict], mix_plans: list[dict], artifact_inventory: list[dict]) -> dict:
    passing_qc = sum(1 for report in qc_reports if report.get("overall_pass"))
    return {
        "qc_report_count": len(qc_reports),
        "passing_qc_count": passing_qc,
        "failing_qc_count": len(qc_reports) - passing_qc,
        "revision_count": len(revisions),
        "mix_plan_count": len(mix_plans),
        "artifact_count": len(artifact_inventory),
        "latest_revision_status": revisions[0].get("status") if revisions else None,
        "latest_mix_plan_status": mix_plans[0].get("status") if mix_plans else None,
    }


async def _load_project_detail_payload(pool, project_id: str) -> dict:
    project = await pool.fetchrow("SELECT * FROM projects WHERE id::text=$1 OR slug=$1", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_key = project["id"]
    leads = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM leads WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    jobs = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 40", project_key)]
    revisions = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM revisions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    qc_reports = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM qc_reports WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    mix_plans = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM mix_plans WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)]
    session_manifests = [
        _serialize_row(row)
        for row in await pool.fetch("SELECT * FROM session_manifests WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20", project_key)
    ]
    worker_tasks = [_serialize_row(row) for row in await pool.fetch("SELECT * FROM worker_tasks WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30", project_key)]
    audit_entries = [
        _serialize_row(row)
        for row in await pool.fetch("SELECT * FROM audit_log WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30", project_key)
    ]
    artifact_inventory = _artifact_inventory(jobs, worker_tasks)

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
        "review_summary": _review_summary(qc_reports, revisions, mix_plans, artifact_inventory),
    }


async def _resolve_artifact_entry(pool, project_id: str, artifact_id: int) -> dict:
    detail = await _load_project_detail_payload(pool, project_id)
    inventory = detail["artifact_inventory"]
    if artifact_id < 0 or artifact_id >= len(inventory):
        raise HTTPException(status_code=404, detail="Artifact not found")
    return inventory[artifact_id]


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
    return await _load_project_detail_payload(pool, project_id)


@router.get("/{project_id}/artifacts")
async def list_project_artifacts(project_id: str):
    pool = await get_pool()
    detail = await _load_project_detail_payload(pool, project_id)
    return {
        "project_id": project_id,
        "artifact_inventory": detail["artifact_inventory"],
        "review_summary": detail["review_summary"],
    }


@router.get("/{project_id}/artifacts/{artifact_id}")
async def get_project_artifact(project_id: str, artifact_id: int):
    pool = await get_pool()
    entry = await _resolve_artifact_entry(pool, project_id, artifact_id)
    artifact_path = entry.get("artifact_path")
    path = Path(artifact_path) if artifact_path else None
    exists = bool(path and path.exists())
    is_dir = bool(path and path.is_dir())
    return {
        **entry,
        "exists": exists,
        "is_directory": is_dir,
        "file_name": path.name if path else None,
        "size_bytes": path.stat().st_size if path and exists and path.is_file() else None,
        "mime_type": mimetypes.guess_type(str(path))[0] if path and exists and path.is_file() else None,
    }


@router.get("/{project_id}/artifacts/{artifact_id}/preview")
async def preview_project_artifact(project_id: str, artifact_id: int):
    pool = await get_pool()
    entry = await _resolve_artifact_entry(pool, project_id, artifact_id)
    artifact_path = entry.get("artifact_path")
    if not artifact_path:
        raise HTTPException(status_code=404, detail="Artifact path unavailable")
    path = Path(artifact_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")
    if path.is_dir():
        raise HTTPException(status_code=409, detail="Artifact is a directory")
    if path.suffix.lower() not in TEXT_PREVIEW_SUFFIXES:
        raise HTTPException(status_code=409, detail="Artifact preview is only available for text-like files")
    content = path.read_text(encoding="utf-8", errors="ignore")
    if len(content) > 200_000:
        content = content[:200_000] + "\n\n[truncated]"
    return {
        "artifact_id": artifact_id,
        "path": str(path),
        "file_name": path.name,
        "content": content,
    }


@router.get("/{project_id}/artifacts/{artifact_id}/download")
async def download_project_artifact(project_id: str, artifact_id: int):
    pool = await get_pool()
    entry = await _resolve_artifact_entry(pool, project_id, artifact_id)
    artifact_path = entry.get("artifact_path")
    if not artifact_path:
        raise HTTPException(status_code=404, detail="Artifact path unavailable")
    path = Path(artifact_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")
    if path.is_dir():
        raise HTTPException(status_code=409, detail="Artifact is a directory")
    return FileResponse(path, filename=path.name)


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
