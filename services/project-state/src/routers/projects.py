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
    row = await pool.fetchrow("SELECT * FROM projects WHERE id=$1 OR slug=$1", project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(row)


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
