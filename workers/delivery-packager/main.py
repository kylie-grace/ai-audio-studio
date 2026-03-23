"""delivery-packager worker."""

from __future__ import annotations

import json
import os
import re as _re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

_pool: asyncpg.Pool | None = None
_workspace_settings_cache: dict = {}
_workspace_settings_cache_ts: float = 0.0
WORKSPACE_SETTINGS_CACHE_TTL = 60.0


def _safe_package_name(name: str) -> str:
    """Strip characters that could cause path traversal in a directory name."""
    sanitized = _re.sub(r"[^\w\-.]", "_", name)
    if sanitized != name.replace(" ", "_"):
        pass  # silent normalization
    return sanitized.strip(".")


def _resolve_allowed_path(file_path: str) -> Path:
    try:
        resolved = Path(file_path).resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if ".." in Path(file_path).parts:
        raise HTTPException(status_code=400, detail="File path must not contain '..'")
    return resolved


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="delivery-packager", lifespan=lifespan)


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


class PackageDeliveryBody(BaseModel):
    project_id: str
    file_paths: list[str] = Field(min_length=1)
    package_name: str = "delivery-package"
    execution_mode: str = "local"
    worker_slug: str | None = None


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("delivery_packager", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='delivery-packager' AND status='awaiting-approval'")
    qc_pass_count = await pool.fetchval("SELECT COUNT(*) FROM qc_reports WHERE overall_pass = TRUE")
    return {
        "status": "ok",
        "module": "delivery-packager",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "passing_qc_reports": qc_pass_count,
        "delivery_path": os.environ.get("DELIVERY_PATH", "/data/deliveries"),
    }


@app.post("/package-delivery", status_code=201)
async def package_delivery(body: PackageDeliveryBody):
    pool = await get_pool()
    await require_module_enabled(pool, "delivery_packager")
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    qc = await pool.fetchrow(
        "SELECT * FROM qc_reports WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1",
        body.project_id,
    )
    if qc is None or not qc["overall_pass"]:
        raise HTTPException(status_code=409, detail="Latest QC report does not permit delivery packaging")

    if body.execution_mode == "remote":
        job = await pool.fetchrow(
            """INSERT INTO jobs
               (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
               VALUES ($1,'delivery-packager','package-delivery','operator',$2::jsonb,'pending',false,'worker:delivery-packager')
               RETURNING *""",
            body.project_id,
            json.dumps({"file_paths": body.file_paths, "package_name": body.package_name, "worker_slug": body.worker_slug}),
        )
        task = await pool.fetchrow(
            """INSERT INTO worker_tasks
               (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
               VALUES ($1,$2,$3,'package-delivery','delivery-packager',$4::jsonb,'normal')
               RETURNING *""",
            job["id"],
            body.project_id,
            body.worker_slug,
            json.dumps(
                {
                    "project_id": body.project_id,
                    "project_slug": project["slug"],
                    "file_paths": body.file_paths,
                    "package_name": body.package_name,
                    "delivery_path": os.environ.get("DELIVERY_PATH", "/data/deliveries"),
                }
            ),
        )
        return {"job_id": str(job["id"]), "task_id": str(task["id"]), "status": "queued-for-worker"}

    delivery_root = Path(os.environ.get("DELIVERY_PATH", "/data/deliveries")) / project["slug"] / _safe_package_name(body.package_name)
    delivery_root.mkdir(parents=True, exist_ok=True)
    copied = []
    for file_path in body.file_paths:
        path = _resolve_allowed_path(file_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Missing delivery file: {file_path}")
        target = delivery_root / path.name
        shutil.copy2(path, target)
        copied.append(str(target))
    manifest_path = delivery_root / "manifest.json"
    manifest_path.write_text(json.dumps({"project_id": body.project_id, "files": copied}, indent=2))
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'delivery-packager','package-delivery','operator',$2::jsonb,'awaiting-approval',true,'worker:delivery-packager')
           RETURNING *""",
        body.project_id,
        json.dumps({"files": body.file_paths}),
    )
    await pool.execute(
        "UPDATE jobs SET artifacts = artifacts || $1::jsonb WHERE id=$2",
        json.dumps([{"path": str(manifest_path), "type": "delivery-manifest"}]),
        job["id"],
    )
    return {"job_id": str(job["id"]), "delivery_path": str(delivery_root), "manifest_path": str(manifest_path)}
