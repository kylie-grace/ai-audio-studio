"""session-prep worker."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

_pool: asyncpg.Pool | None = None
_workspace_settings_cache: dict = {}
_workspace_settings_cache_ts: float = 0.0
WORKSPACE_SETTINGS_CACHE_TTL = 60.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="session-prep", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def _get_workspace_settings(pool) -> dict:
    global _workspace_settings_cache, _workspace_settings_cache_ts
    if time.monotonic() - _workspace_settings_cache_ts < WORKSPACE_SETTINGS_CACHE_TTL:
        return _workspace_settings_cache
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    _workspace_settings_cache = dict(row) if row else {}
    _workspace_settings_cache_ts = time.monotonic()
    return _workspace_settings_cache


async def load_module_settings(pool: asyncpg.Pool) -> dict:
    row = await _get_workspace_settings(pool)
    if not row or not row.get("module_settings"):
        return {}
    value = row["module_settings"]
    return json.loads(value) if isinstance(value, str) else dict(value)


async def require_module_enabled(pool: asyncpg.Pool, module_key: str) -> dict:
    module_settings = (await load_module_settings(pool)).get(module_key, {})
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


class PrepareSessionBody(BaseModel):
    source_dir: str
    project_id: str | None = None
    client_name: str | None = None
    execution_mode: str = "local"
    worker_slug: str | None = None


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("session_prep", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='session-prep' AND status='awaiting-approval'")
    manifest_count = await pool.fetchval("SELECT COUNT(*) FROM session_manifests")
    return {
        "status": "ok",
        "module": "session-prep",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "manifest_count": manifest_count,
        "shared_projects_path": os.environ.get("SHARED_PROJECTS_PATH", "/data/projects"),
    }


@app.post("/prepare-session", status_code=201)
async def prepare_session(body: PrepareSessionBody):
    pool = await get_pool()
    await require_module_enabled(pool, "session_prep")
    allowed_base = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")).resolve()
    base_str = str(allowed_base)
    sp_norm = os.path.normpath(body.source_dir)
    if sp_norm == base_str:
        source_dir = allowed_base
    elif os.path.isabs(sp_norm) and sp_norm.startswith(base_str + os.sep):
        _rel = sp_norm[len(base_str) + 1:]
        source_dir = allowed_base
        for _part in _rel.split(os.sep):
            if not _part:
                continue
            if _part in (".", "..") or not re.match(r"^[^\x00-\x1f/\\:*?\"<>|][^\x00-\x1f/\\:*?\"<>|]*$", _part):
                raise HTTPException(status_code=400, detail="Invalid source_dir path component")
            source_dir = source_dir / _part
    else:
        raise HTTPException(status_code=400, detail="source_dir is outside the allowed directory")
    if not source_dir.exists() or not source_dir.is_dir():
        raise HTTPException(status_code=404, detail="Source directory not found")

    project = None
    if body.project_id:
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        client_name = body.client_name or source_dir.name.replace("-", " ").title()
        project = await pool.fetchrow(
            """INSERT INTO projects (slug, client_name, service_type, notes)
               VALUES ($1,$2,'session',$3) RETURNING *""",
            slugify(client_name),
            client_name,
            f"Imported from {source_dir}",
        )

    if body.execution_mode == "remote":
        job = await pool.fetchrow(
            """INSERT INTO jobs
               (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
               VALUES ($1,'session-prep','prepare-session','operator',$2::jsonb,'pending',false,'worker:session-prep')
               RETURNING *""",
            project["id"],
            json.dumps({"source_dir": str(source_dir), "worker_slug": body.worker_slug}),
        )
        task = await pool.fetchrow(
            """INSERT INTO worker_tasks
               (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
               VALUES ($1,$2,$3,'prepare-session','session-prep',$4::jsonb,'normal')
               RETURNING *""",
            job["id"],
            project["id"],
            body.worker_slug,
            json.dumps(
                {
                    "project_id": str(project["id"]),
                    "project_slug": project["slug"],
                    "client_name": project["client_name"],
                    "source_dir": str(source_dir),
                    "shared_projects_path": os.environ.get("SHARED_PROJECTS_PATH", "/data/projects"),
                }
            ),
        )
        return {
            "job_id": str(job["id"]),
            "task_id": str(task["id"]),
            "project_id": str(project["id"]),
            "status": "queued-for-worker",
            "worker_slug": body.worker_slug,
        }

    base_dir = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")) / project["slug"]
    stems_dir = base_dir / "stems"
    session_dir = base_dir / "session"
    reference_dir = base_dir / "reference"
    deliveries_dir = base_dir / "deliveries"
    for path in (stems_dir, session_dir, reference_dir, deliveries_dir):
        path.mkdir(parents=True, exist_ok=True)

    stems = []
    issues = []
    for file_path in sorted(source_dir.iterdir()):
        if not file_path.is_file():
            continue
        suffix = file_path.suffix.lower()
        target_path = stems_dir / file_path.name
        if suffix not in {".wav", ".aiff", ".aif"}:
            issues.append({"stem": file_path.name, "severity": "ERROR", "message": "Unsupported format"})
            continue
        shutil.copy2(file_path, target_path)
        stems.append({"name": file_path.name, "path": str(target_path), "valid": True})
        if " " in file_path.name:
            issues.append({"stem": file_path.name, "severity": "INFO", "message": "Filename contains spaces"})

    status = "issues-found" if any(issue["severity"] == "ERROR" for issue in issues) else "ready"
    notes_path = session_dir / f"{project['slug']}_template_notes.txt"
    notes_path.write_text("Session prep complete. Review prep report before starting mix work.\n")
    report_path = base_dir / "prep-report.html"
    report_path.write_text(
        "<html><body><h1>Prep Report</h1>"
        f"<p>Project: {html.escape(project['client_name'])}</p>"
        f"<pre>{html.escape(json.dumps({'stems': stems, 'issues': issues}, indent=2))}</pre>"
        "</body></html>"
    )
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'session-prep','prepare-session','operator',$2::jsonb,'awaiting-approval',true,'worker:session-prep')
           RETURNING *""",
        project["id"],
        json.dumps({"source_dir": str(source_dir)}),
    )
    manifest = await pool.fetchrow(
        """INSERT INTO session_manifests
           (project_id, job_id, stems, issues, template_used, session_path, prep_report_path, status)
           VALUES ($1,$2,$3::jsonb,$4::jsonb,'default-template',$5,$6,$7)
           RETURNING *""",
        project["id"],
        job["id"],
        json.dumps(stems),
        json.dumps(issues),
        str(notes_path),
        str(report_path),
        status,
    )
    return {
        "job_id": str(job["id"]),
        "project_id": str(project["id"]),
        "manifest_id": str(manifest["id"]),
        "status": "awaiting-approval",
        "prep_report_path": str(report_path),
        "issues": issues,
    }
