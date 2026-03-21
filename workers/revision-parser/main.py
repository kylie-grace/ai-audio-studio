"""revision-parser worker."""

from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

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


app = FastAPI(title="revision-parser", lifespan=lifespan)


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


class ParseRevisionsBody(BaseModel):
    project_id: str
    raw_notes: str = Field(min_length=1)
    daw: str
    session_path: str
    execution_mode: str = "local"
    worker_slug: str | None = None


def parse_changes(raw_notes: str) -> list[dict]:
    changes = []
    for sentence in re.split(r"[.\n]+", raw_notes):
        text = sentence.strip()
        if not text:
            continue
        lower = text.lower()
        element = next((item for item in ("vocals", "kick", "bass", "snare", "synth", "pads", "drums") if item in lower), "mix")
        parameter = "other"
        if "quiet" in lower or "loud" in lower or "level" in lower:
            parameter = "level"
        elif "eq" in lower or "muddy" in lower or "bright" in lower:
            parameter = "eq"
        elif "reverb" in lower:
            parameter = "reverb"
        elif "width" in lower or "wide" in lower:
            parameter = "stereo_width"
        direction = "adjust"
        if any(token in lower for token in ("up", "more", "raise", "louder")):
            direction = "up"
        elif any(token in lower for token in ("down", "less", "lower", "quieter")):
            direction = "down"
        confidence = 0.9 if parameter != "other" and element != "mix" else 0.55
        changes.append(
            {
                "element": element,
                "section": "full track",
                "parameter": parameter,
                "direction": direction,
                "value": None,
                "value_range": ["+1dB", "+3dB"] if direction == "up" else ["-3dB", "-1dB"],
                "confidence": confidence,
                "human_readable": text,
                "requires_clarification": confidence < 0.65,
            }
        )
    return changes


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("revision_parser", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='revision-parser' AND status='awaiting-approval'")
    revision_count = await pool.fetchval("SELECT COUNT(*) FROM revisions")
    return {
        "status": "ok",
        "module": "revision-parser",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "revision_count": revision_count,
    }


@app.post("/parse-revisions", status_code=201)
async def parse_revisions(body: ParseRevisionsBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.execution_mode == "remote":
        job = await pool.fetchrow(
            """INSERT INTO jobs
               (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
               VALUES ($1,'revision-parser','parse-revisions','operator',$2::jsonb,'pending',false,'worker:revision-parser')
               RETURNING *""",
            body.project_id,
            json.dumps({"daw": body.daw, "session_path": body.session_path, "worker_slug": body.worker_slug}),
        )
        task = await pool.fetchrow(
            """INSERT INTO worker_tasks
               (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
               VALUES ($1,$2,$3,'parse-revisions','revision-parser',$4::jsonb,'normal')
               RETURNING *""",
            job["id"],
            body.project_id,
            body.worker_slug,
            json.dumps(
                {
                    "project_id": body.project_id,
                    "project_slug": project["slug"],
                    "raw_notes": body.raw_notes,
                    "daw": body.daw,
                    "session_path": body.session_path,
                    "shared_projects_path": os.environ.get("SHARED_PROJECTS_PATH", "/data/projects"),
                }
            ),
        )
        return {"job_id": str(job["id"]), "task_id": str(task["id"]), "status": "queued-for-worker"}
    changes = parse_changes(body.raw_notes)
    project_dir = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")) / project["slug"] / "session"
    project_dir.mkdir(parents=True, exist_ok=True)
    script_path = project_dir / f"{body.daw}_revision_script.txt"
    executable_changes = [change for change in changes if change["confidence"] >= 0.85]
    script_path.write_text(json.dumps(executable_changes, indent=2))
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'revision-parser','parse-revisions','operator',$2::jsonb,'awaiting-approval',true,'worker:revision-parser')
           RETURNING *""",
        body.project_id,
        json.dumps({"daw": body.daw, "session_path": body.session_path, "worker_slug": body.worker_slug}),
    )
    revision = await pool.fetchrow(
        """INSERT INTO revisions
           (project_id, job_id, raw_notes, parsed_changes, soundflow_script, reascript_path, status)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,'parsed')
           RETURNING *""",
        body.project_id,
        job["id"],
        body.raw_notes,
        json.dumps(changes),
        str(script_path) if body.daw == "protools" else None,
        str(script_path) if body.daw == "reaper" else None,
    )
    return {"job_id": str(job["id"]), "revision_id": str(revision["id"]), "changes": changes}
